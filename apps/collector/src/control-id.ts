// A sondagem do Control iD (spec saude-do-control-id, "Sondagem dos controles"; change
// p2c-saude-do-control-id, design, decisões 1 e 4). O coletor entra no controle (`login.fcgi`), lê
// as informações do sistema (`system_information.fcgi`) e sai (`logout.fcgi`), pelo HTTP na porta do
// tipo, com os pedidos POST em JSON e a sessão no endereço, como o PMG. Cada pedido espera até 10 s,
// e o que não tem resposta tenta mais uma vez, depois de 1 s. A saída vai sempre que houve sessão,
// sem tentativa a mais, e a falha dela não muda a leitura. A classificação:
// - login recusado: o login responde 401 ou 403, ou responde sem a sessão;
// - resposta inesperada: outro código, ou um corpo que não é JSON, no login ou nas informações;
// - sem resposta: o tempo esgotado ou a conexão recusada, depois da tentativa a mais;
// - respondendo: as informações do sistema em JSON.
// O usuário e a senha só passam pelo pedido do login: eles não vão às leituras nem ao log.
import type { EtapaDaSondagem, MetricaDaColeta } from '@grafite/domain';
import type { LeituraParaEnviar } from './lotes.ts';

/** A espera de cada pedido, em ms. */
const ESPERA = 10_000;
/** A espera antes da tentativa a mais, em ms. */
const ESPERA_DA_TENTATIVA = 1000;
/** O maior texto que o lote aceita do firmware, do produto e da série. */
const TEXTO_MAXIMO = 100;

export interface PedidoDaSondagem {
  ip: string;
  porta: number;
  usuario: string;
  senha: string;
}

export interface OpcoesDaSondagem extends PedidoDaSondagem {
  /** A espera de cada pedido, em ms. */
  espera?: number;
  /** A espera antes da tentativa a mais, em ms. */
  esperaDaTentativa?: number;
}

/** O que a sondagem leu do controle. */
export type SondagemLida =
  | {
      situacao: 'respondendo';
      firmware: string | null;
      produto: string | null;
      serie: string | null;
    }
  | { situacao: 'login-recusado' }
  | { situacao: 'sem-resposta' }
  | { situacao: 'resposta-inesperada'; etapa: EtapaDaSondagem; codigo: number | null };

/** O corpo que não é JSON. */
const NAO_E_JSON = Symbol('não é JSON');

type Resposta = { status: number; corpo: unknown } | null;

/**
 * Um POST em JSON ao controle: a resposta, com o corpo lido, ou nenhuma, quando o controle não
 * responde, nem na tentativa a mais.
 */
async function postar(
  endereco: string,
  corpo: object,
  {
    espera,
    tentativasAMais,
    esperaDaTentativa,
  }: {
    espera: number;
    tentativasAMais: number;
    esperaDaTentativa: number;
  },
): Promise<Resposta> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      const resposta = await fetch(endereco, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(espera),
      });
      const texto = await resposta.text();
      if (texto.trim() === '') return { status: resposta.status, corpo: {} };
      try {
        return { status: resposta.status, corpo: JSON.parse(texto) as unknown };
      } catch {
        return { status: resposta.status, corpo: NAO_E_JSON };
      }
    } catch {
      if (tentativa >= tentativasAMais) return null;
      await new Promise((pronto) => setTimeout(pronto, esperaDaTentativa));
    }
  }
}

const objeto = (corpo: unknown): Record<string, unknown> | null =>
  typeof corpo === 'object' && corpo !== null && !Array.isArray(corpo)
    ? (corpo as Record<string, unknown>)
    : null;

/** O primeiro texto preenchido entre os campos dados. */
const texto = (informacoes: Record<string, unknown>, ...campos: string[]): string | null => {
  for (const campo of campos) {
    const valor = informacoes[campo];
    if (typeof valor === 'string' && valor.trim() !== '') return valor.trim();
  }
  return null;
};

/** As informações do sistema como o controle as deu, ou por que a sondagem não as leu. */
export type InformacoesLidas =
  | { situacao: 'respondendo'; informacoes: Record<string, unknown> }
  | Exclude<SondagemLida, { situacao: 'respondendo' }>;

/** Sonda o controle: entra, lê as informações do sistema e sai, sempre que houve sessão. */
export async function sondarControle(opcoes: OpcoesDaSondagem): Promise<SondagemLida> {
  const lida = await lerInformacoesDoControle(opcoes);
  if (lida.situacao !== 'respondendo') return lida;
  const { informacoes } = lida;
  return {
    situacao: 'respondendo',
    firmware: texto(informacoes, 'firmware', 'version'),
    produto: texto(informacoes, 'product_name'),
    serie: texto(informacoes, 'serial'),
  };
}

/**
 * As informações do sistema do controle, inteiras, como a sondagem as lê: o comando
 * gravar-control-id as grava, e a sondagem tira delas o firmware, o produto e a série.
 */
export async function lerInformacoesDoControle({
  ip,
  porta,
  usuario,
  senha,
  espera = ESPERA,
  esperaDaTentativa = ESPERA_DA_TENTATIVA,
}: OpcoesDaSondagem): Promise<InformacoesLidas> {
  const base = `http://${ip}:${porta}`;
  const comTentativa = { espera, tentativasAMais: 1, esperaDaTentativa };
  const login = await postar(
    `${base}/login.fcgi`,
    { login: usuario, password: senha },
    comTentativa,
  );
  if (!login) return { situacao: 'sem-resposta' };
  if (login.status === 401 || login.status === 403) return { situacao: 'login-recusado' };
  if (login.status !== 200 || login.corpo === NAO_E_JSON) {
    return { situacao: 'resposta-inesperada', etapa: 'login', codigo: login.status };
  }
  const sessao = objeto(login.corpo)?.session;
  if (typeof sessao !== 'string' || sessao === '') return { situacao: 'login-recusado' };
  const daSessao = `?session=${encodeURIComponent(sessao)}`;
  try {
    const lida = await postar(`${base}/system_information.fcgi${daSessao}`, {}, comTentativa);
    if (!lida) return { situacao: 'sem-resposta' };
    const informacoes = lida.status === 200 ? objeto(lida.corpo) : null;
    if (!informacoes) {
      return { situacao: 'resposta-inesperada', etapa: 'informacoes', codigo: lida.status };
    }
    return { situacao: 'respondendo', informacoes };
  } finally {
    // A sessão do controle sempre sai, sem tentativa a mais; a falha dela não muda a leitura.
    await postar(`${base}/logout.fcgi${daSessao}`, {}, { ...comTentativa, tentativasAMais: 0 });
  }
}

/** O texto no tamanho que o lote aceita. */
const caber = (valor: string) => valor.slice(0, TEXTO_MAXIMO);

/**
 * As leituras da sondagem (design, decisão 1): a situação, com a etapa e o código da resposta
 * inesperada, e, quando o controle responde, o firmware, com o produto, e a série. A sondagem que
 * não pôde ser feita vai sem valor.
 */
export function leiturasDoControle(
  ativoId: string,
  lida: SondagemLida | null,
  momento: Date,
): LeituraParaEnviar[] {
  const quando = momento.toISOString();
  const leitura = (metrica: MetricaDaColeta, valor: LeituraParaEnviar['valor']) => ({
    ativoId,
    metrica,
    momento: quando,
    valor,
  });
  if (!lida) return [leitura('controlid.sondagem', null)];
  const sondagem: LeituraParaEnviar = leitura('controlid.sondagem', lida.situacao);
  if (lida.situacao === 'resposta-inesperada') {
    sondagem.detalhes =
      lida.codigo === null ? { etapa: lida.etapa } : { etapa: lida.etapa, codigo: lida.codigo };
  }
  if (lida.situacao !== 'respondendo') return [sondagem];
  const leituras: LeituraParaEnviar[] = [
    sondagem,
    {
      ...leitura('controlid.firmware', lida.firmware === null ? null : caber(lida.firmware)),
      ...(lida.produto === null ? {} : { detalhes: { produto: caber(lida.produto) } }),
    },
  ];
  if (lida.serie !== null) leituras.push(leitura('controlid.serie', caber(lida.serie)));
  return leituras;
}
