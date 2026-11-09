// A decisão do motor dos alertas (spec alertas, "Condições de alerta", "Avaliação a cada minuto",
// "Recuperação com folga", "Encerramento quando a regra deixa de valer", "Coleta atrasada",
// "Coletor sem contato" e "Texto do alerta"; change p3a-regras-e-alertas, design, decisões 5 a 7):
// o que uma leitura diz da condição de uma regra, e o que fazer com o alerta de cada alvo e item. É
// pura: a API lê o banco, pergunta aqui e grava.
import { capacidadeDa } from '../ativos/catalogo.ts';
import { SITUACOES_DA_SONDAGEM } from '../coleta/control-id.ts';
import { CONDICOES_DA_IMPRESSORA, tipoDoSuprimento } from '../coleta/impressoras.ts';
import type { CondicaoDeAlerta, DadosDaRegra, SeveridadeDoAlerta } from './regras.ts';

/** O texto do alerta cabe nisto, com o valor no fim. */
export const TEXTO_MAXIMO_DO_ALERTA = 200;

/** A leitura do estado atual que a condição observa. */
export interface LeituraDoEstado {
  situacao: 'valida' | 'sem-dado' | 'inconsistente';
  valorNumero: number | null;
  valorTexto: string | null;
  detalhes: Record<string, unknown> | null;
}

const TEXTOS_DO_CONTROL_ID: Record<string, string> = {
  'sem-resposta': 'Control iD sem resposta',
  'login-recusado': 'Control iD com login recusado',
  'resposta-inesperada': 'Control iD com resposta inesperada',
};

const descricaoDe = (detalhes: Record<string, unknown> | null) =>
  typeof detalhes?.descricao === 'string' ? detalhes.descricao.trim() : '';

/**
 * O texto do alerta, com o valor atual: a descrição do toner como a impressora a informa, cortada
 * para o nível caber no fim.
 */
export function textoDoAlerta(
  condicao: CondicaoDeAlerta,
  {
    item,
    valorNumero = null,
    valorTexto = null,
    detalhes = null,
  }: {
    item: string;
    valorNumero?: number | null;
    valorTexto?: string | null;
    detalhes?: Record<string, unknown> | null;
  },
): string {
  switch (condicao) {
    case 'rede.offline':
      return 'Offline';
    case 'toner.nivel': {
      const nivel = ` em ${valorNumero ?? 0}%`;
      const descricao = descricaoDe(detalhes) || 'Toner';
      return descricao.slice(0, TEXTO_MAXIMO_DO_ALERTA - nivel.length) + nivel;
    }
    case 'impressora.condicao':
      return CONDICOES_DA_IMPRESSORA.find(({ chave }) => chave === item)?.rotulo ?? item;
    case 'controlid.situacao':
      return TEXTOS_DO_CONTROL_ID[valorTexto ?? ''] ?? 'Control iD com problema';
    case 'coleta.atrasada':
      return `Coleta atrasada: ${capacidadeDa(item)?.nome ?? item}`.slice(
        0,
        TEXTO_MAXIMO_DO_ALERTA,
      );
    case 'coletor.sem-contato':
      return 'Coletor sem contato';
  }
}

/**
 * O que a observação de um alvo e item diz da condição:
 * - `dispara`: a condição vale agora;
 * - `na-folga`: a leitura válida não dispara, mas ainda não passou da folga;
 * - `normal`: a leitura válida mostra a recuperação;
 * - `sem-dado`: nada a concluir, como a leitura sem dado;
 * - `fora-da-regra`: a regra não alcança mais o alvo ou o item.
 */
export type ObservacaoDoAlvo =
  | { tipo: 'dispara'; texto: string }
  | { tipo: 'na-folga'; texto: string }
  | { tipo: 'normal' }
  | { tipo: 'sem-dado' }
  | { tipo: 'fora-da-regra' };

const SEM_DADO = { tipo: 'sem-dado' } as const;
const NORMAL = { tipo: 'normal' } as const;
const FORA_DA_REGRA = { tipo: 'fora-da-regra' } as const;

/** A lista das condições ativas da impressora, como o lote a grava, ou `null`. */
function condicoesLidas(valorTexto: string | null): string[] | null {
  try {
    const lidas: unknown = JSON.parse(valorTexto ?? '');
    return Array.isArray(lidas) && lidas.every((chave) => typeof chave === 'string') ? lidas : null;
  } catch {
    return null;
  }
}

/**
 * O que a leitura do estado atual diz da condição da regra, para o item: cada toner pelo índice e
 * cada condição da impressora pela chave. Sem leitura, ou com a leitura sem dado ou inconsistente,
 * não há o que concluir.
 */
export function observarLeitura(
  regra: DadosDaRegra,
  leitura: LeituraDoEstado | null,
  item: string,
): ObservacaoDoAlvo {
  if (regra.condicao === 'impressora.condicao' && !regra.parametros.condicoes.includes(item)) {
    return FORA_DA_REGRA;
  }
  if (!leitura) return SEM_DADO;
  if (regra.condicao === 'toner.nivel') {
    const descricao = descricaoDe(leitura.detalhes);
    if (descricao !== '' && tipoDoSuprimento(descricao) !== 'toner') return FORA_DA_REGRA;
  }
  if (leitura.situacao !== 'valida') return SEM_DADO;
  const texto = () =>
    textoDoAlerta(regra.condicao, {
      item,
      valorNumero: leitura.valorNumero,
      valorTexto: leitura.valorTexto,
      detalhes: leitura.detalhes,
    });
  switch (regra.condicao) {
    case 'rede.offline':
      if (leitura.valorTexto === 'offline') return { tipo: 'dispara', texto: texto() };
      return leitura.valorTexto === 'online' ? NORMAL : SEM_DADO;
    case 'toner.nivel': {
      const { limite, folga } = regra.parametros;
      const nivel = leitura.valorNumero;
      if (nivel === null) return SEM_DADO;
      if (nivel <= limite) return { tipo: 'dispara', texto: texto() };
      return nivel > limite + folga ? NORMAL : { tipo: 'na-folga', texto: texto() };
    }
    case 'impressora.condicao': {
      const lidas = condicoesLidas(leitura.valorTexto);
      if (!lidas) return SEM_DADO;
      return lidas.includes(item) ? { tipo: 'dispara', texto: texto() } : NORMAL;
    }
    case 'controlid.situacao': {
      const situacao = leitura.valorTexto ?? '';
      if ((regra.parametros.situacoes as readonly string[]).includes(situacao)) {
        return { tipo: 'dispara', texto: texto() };
      }
      return (SITUACOES_DA_SONDAGEM as readonly string[]).includes(situacao) ? NORMAL : SEM_DADO;
    }
    case 'coleta.atrasada':
    case 'coletor.sem-contato':
      // Não são do estado atual: a API as observa pelo tempo e pelos coletores.
      return SEM_DADO;
  }
}

/**
 * A coleta atrasada de uma capacidade do ativo: a última leitura passou do prazo (os ciclos da
 * regra pelo intervalo da métrica), e o coletor falou com a API depois dele. Com o coletor calado,
 * o alerta do coletor diz o problema, e aqui não há o que concluir.
 */
export function observarColetaAtrasada({
  momento,
  ultimoContato,
  intervalo,
  ciclos,
  agora,
  item,
}: {
  /** O momento da última leitura da capacidade. */
  momento: Date;
  /** O último contato do coletor que a lê. */
  ultimoContato: Date | null;
  /** O intervalo da métrica, em ms. */
  intervalo: number;
  ciclos: number;
  agora: Date;
  /** A capacidade, como `rede.disponibilidade`. */
  item: string;
}): ObservacaoDoAlvo {
  const prazo = momento.getTime() + ciclos * intervalo;
  if (agora.getTime() <= prazo) return NORMAL;
  if (ultimoContato && ultimoContato.getTime() > prazo) {
    return { tipo: 'dispara', texto: textoDoAlerta('coleta.atrasada', { item }) };
  }
  return SEM_DADO;
}

/** O coletor sem contato pelos minutos da regra; o que nunca falou com a API fica de fora. */
export function observarColetor({
  ultimoContato,
  minutos,
  agora,
}: {
  ultimoContato: Date | null;
  minutos: number;
  agora: Date;
}): ObservacaoDoAlvo {
  if (!ultimoContato) return FORA_DA_REGRA;
  return agora.getTime() - ultimoContato.getTime() >= minutos * 60_000
    ? { tipo: 'dispara', texto: textoDoAlerta('coletor.sem-contato', { item: '' }) }
    : NORMAL;
}

/** O alerta não resolvido de um alvo e item, como o motor o conhece. */
export interface AlertaNaDecisao {
  /** O pendente é a condição vista que ainda não durou a duração da regra. */
  situacao: 'pendente' | 'aberto';
  observadoEm: Date;
  texto: string;
  severidade: SeveridadeDoAlerta;
}

export type ComoTerminouOAlerta = 'voltou-ao-normal' | 'regra-deixou-de-valer';

/**
 * O que fazer com o alerta. Ao criar e ao atualizar, `abrir` diz se ele passa a aberto, e
 * `abertoNoSilencio` vale só quando abre; `naTela` diz se o que a tela mostra mudou.
 */
export type DecisaoDoAlerta =
  | { acao: 'nada' }
  | {
      acao: 'criar';
      abrir: boolean;
      texto: string;
      severidade: SeveridadeDoAlerta;
      abertoNoSilencio: boolean;
    }
  | {
      acao: 'atualizar';
      abrir: boolean;
      texto: string;
      severidade: SeveridadeDoAlerta;
      abertoNoSilencio: boolean;
      naTela: boolean;
    }
  | { acao: 'resolver'; como: ComoTerminouOAlerta }
  | { acao: 'descartar' };

const NADA = { acao: 'nada' } as const;

/**
 * A decisão de um alvo e item: o alerta que existe (ou nenhum), o que a observação diz, a duração
 * (em minutos) e a severidade da regra, se o ativo está silenciado e o momento da avaliação.
 */
export function decidirAlerta({
  alerta,
  observacao,
  regra,
  silenciado,
  agora,
}: {
  alerta: AlertaNaDecisao | null;
  observacao: ObservacaoDoAlvo;
  regra: { duracao: number; severidade: SeveridadeDoAlerta };
  silenciado: boolean;
  agora: Date;
}): DecisaoDoAlerta {
  if (!alerta) {
    if (observacao.tipo !== 'dispara') return NADA;
    const abrir = regra.duracao === 0;
    return {
      acao: 'criar',
      abrir,
      texto: observacao.texto,
      severidade: regra.severidade,
      abertoNoSilencio: abrir && silenciado,
    };
  }
  if (alerta.situacao === 'pendente') {
    if (observacao.tipo === 'sem-dado') return NADA;
    if (observacao.tipo !== 'dispara') return { acao: 'descartar' };
    if (agora.getTime() - alerta.observadoEm.getTime() < regra.duracao * 60_000) return NADA;
    return {
      acao: 'atualizar',
      abrir: true,
      texto: observacao.texto,
      severidade: regra.severidade,
      abertoNoSilencio: silenciado,
      naTela: true,
    };
  }
  switch (observacao.tipo) {
    case 'normal':
      return { acao: 'resolver', como: 'voltou-ao-normal' };
    case 'fora-da-regra':
      return { acao: 'resolver', como: 'regra-deixou-de-valer' };
    case 'sem-dado':
      return NADA;
    default:
      if (observacao.texto === alerta.texto && regra.severidade === alerta.severidade) return NADA;
      return {
        acao: 'atualizar',
        abrir: false,
        texto: observacao.texto,
        severidade: regra.severidade,
        abertoNoSilencio: false,
        naTela: true,
      };
  }
}
