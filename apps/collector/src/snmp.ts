// A leitura SNMP da impressora (spec impressoras-por-snmp, "Leitura das impressoras"; change
// p2b-impressoras-por-snmp, design, decisões 1, 4 e 5). O coletor lê, por subárvore, o número de
// série, os suprimentos, os contadores e as cores dos marcadores, as condições e as mensagens, com o
// GETBULK no v2c e o GETNEXT no v1, até 2 s de espera e uma tentativa a mais. A impressora que não
// responde, como a que recebe a comunidade errada e fica calada, dá só o "não respondeu"; a subárvore
// que recusa GETBULK é relida por GETNEXT. A impressora é o primeiro dispositivo de cada tabela.
// As leituras são montadas com as regras do domínio, e o texto que não cabe no lote é cortado. A
// comunidade só passa pela sessão SNMP: ela não vai às leituras nem ao log.
import { isUtf8 } from 'node:buffer';
import {
  condicoesDosBits,
  type MetricaDaColeta,
  nivelDoSuprimento,
  type VersaoDoSnmp,
} from '@grafite/domain';
import snmp from 'net-snmp';
import type { LeituraParaEnviar } from './lotes.ts';

/** A porta do SNMP nas impressoras. */
export const PORTA_DO_SNMP = 161;
/** A espera de cada pedido, em ms. */
const ESPERA = 2000;
/** As tentativas depois da primeira. */
const TENTATIVAS_A_MAIS = 1;
/** Quantas linhas cada GETBULK pede. */
const REPETICOES = 20;
/** O maior texto e a maior lista que o lote aceita. */
const TEXTO_MAXIMO = 200;
const ITENS_DA_LISTA = 32;

/** As subárvores lidas (design do P2b, decisão 5). */
export const SUBARVORES_DA_IMPRESSORA = {
  serie: '1.3.6.1.2.1.43.5.1.1.17',
  suprimentos: '1.3.6.1.2.1.43.11.1.1',
  contadores: '1.3.6.1.2.1.43.10.2.1.4',
  cores: '1.3.6.1.2.1.43.10.2.1.6',
  condicoes: '1.3.6.1.2.1.25.3.5.1.2',
  mensagens: '1.3.6.1.2.1.43.18.1.1.8',
} as const;

/** As colunas da tabela de suprimentos (prtMarkerSuppliesTable) que o coletor usa. */
const COLUNA_DA_DESCRICAO = 6;
const COLUNA_DA_CAPACIDADE = 8;
const COLUNA_DO_NIVEL = 9;

export interface PedidoSnmp {
  ip: string;
  versao: VersaoDoSnmp;
  comunidade: string;
}

export interface OpcoesDaLeitura extends PedidoSnmp {
  porta?: number;
  /** A espera de cada pedido, em ms. */
  espera?: number;
  tentativasAMais?: number;
}

/** Um suprimento como a impressora informa: a descrição, a capacidade e o nível, sem interpretar. */
export interface SuprimentoInformado {
  item: number;
  descricao: string;
  capacidade: number;
  nivel: number;
}

/** Um contador como a impressora informa: as páginas e as cores do marcador, quando informadas. */
export interface ContadorInformado {
  item: number;
  paginas: number;
  cores: number | null;
}

/** O que a impressora informou, ou que ela não respondeu. */
export type LeituraSnmp =
  | { respondeu: false }
  | {
      respondeu: true;
      serie: string | null;
      suprimentos: SuprimentoInformado[];
      contadores: ContadorInformado[];
      /** As condições em bits (hrPrinterDetectedErrorState), ou nenhuma, quando ela não informa. */
      estadoDeErro: number[] | null;
      mensagens: string[];
    };

/** Uma linha lida: o índice depois da base da subárvore e o valor. */
interface Linha {
  indice: number[];
  valor: unknown;
}

/** A sessão SNMP com a impressora, com a espera e a tentativa a mais. */
export function abrirSessao({
  ip,
  versao,
  comunidade,
  porta = PORTA_DO_SNMP,
  espera = ESPERA,
  tentativasAMais = TENTATIVAS_A_MAIS,
}: OpcoesDaLeitura): snmp.Session {
  const sessao = snmp.createSession(ip, comunidade, {
    port: porta,
    version: versao === '1' ? snmp.Version1 : snmp.Version2c,
    timeout: espera,
    retries: tentativasAMais,
  });
  // O erro do socket também chega ao pedido, que desiste sozinho; sem ouvinte, derrubaria o coletor.
  sessao.on('error', () => {});
  return sessao;
}

/**
 * Os objetos da subárvore inteira, pelo GETBULK no v2c e pelo GETNEXT no v1. A subárvore que a
 * impressora recusa com um erro dela fica vazia; a impressora que não responde rejeita.
 */
export async function lerSubarvore(sessao: snmp.Session, base: string): Promise<snmp.Varbind[]> {
  const lidas: snmp.Varbind[] = [];
  try {
    return await new Promise<snmp.Varbind[]>((resolver, rejeitar) => {
      sessao.subtree(
        base,
        REPETICOES,
        (ligacoes: snmp.Varbind[]) => {
          for (const ligacao of ligacoes) if (!snmp.isVarbindError(ligacao)) lidas.push(ligacao);
        },
        (erro: Error | null) => (erro ? rejeitar(erro) : resolver(lidas)),
      );
    });
  } catch (erro) {
    if (erro instanceof snmp.RequestFailedError) {
      if (erro.status === snmp.ErrorStatus.NoSuchName) return lidas;
      return lerPorGetNext(sessao, base);
    }
    throw erro;
  }
}

/** GETNEXT na mesma sessão: não troca silenciosamente a versão nem a comunidade do cadastro. */
async function lerPorGetNext(sessao: snmp.Session, base: string): Promise<snmp.Varbind[]> {
  const lidas: snmp.Varbind[] = [];
  let anterior = base;
  // Limita também equipamentos que devolvem OIDs repetidos ou uma tabela sem fim.
  while (lidas.length < 4096) {
    let ligacoes: snmp.Varbind[];
    try {
      ligacoes = await new Promise((resolver, rejeitar) =>
        sessao.getNext([anterior], (erro, valores) =>
          erro ? rejeitar(erro) : resolver(valores ?? []),
        ),
      );
    } catch (erro) {
      if (erro instanceof snmp.RequestFailedError && erro.status === snmp.ErrorStatus.NoSuchName)
        return lidas;
      throw erro;
    }
    const proxima = ligacoes[0];
    if (!proxima || snmp.isVarbindError(proxima) || !proxima.oid.startsWith(`${base}.`))
      return lidas;
    const antes = anterior.split('.').map(Number);
    const depois = proxima.oid.split('.').map(Number);
    const diferente = depois.findIndex((parte, indice) => parte !== antes[indice]);
    if (diferente < 0 || (depois[diferente] ?? 0) <= (antes[diferente] ?? -1))
      throw new Error('A impressora repetiu ou recuou o OID.');
    lidas.push(proxima);
    anterior = proxima.oid;
  }
  throw new Error('A tabela SNMP excedeu o limite de leitura.');
}

/** As linhas da subárvore: o índice depois da base e o valor. */
const linhasDa = (ligacoes: readonly snmp.Varbind[], base: string): Linha[] =>
  ligacoes.map((ligacao) => ({
    indice: ligacao.oid
      .slice(base.length + 1)
      .split('.')
      .map(Number),
    valor: ligacao.value,
  }));

/** O texto que a impressora informa, em UTF-8 ou, quando não é, em Latin-1, sem os nulos do fim. */
function texto(valor: unknown): string | null {
  if (!Buffer.isBuffer(valor)) return null;
  const lido = isUtf8(valor) ? valor.toString('utf8') : valor.toString('latin1');
  return lido.replace(/\0+$/, '').trim();
}

const inteiro = (valor: unknown) =>
  typeof valor === 'number' && Number.isInteger(valor) ? valor : null;

/** Os valores do primeiro dispositivo da tabela, pelo item, no índice `<dispositivo>.<item>`. */
function porItem(linhas: readonly Linha[]): Map<number, unknown> {
  const dispositivo = linhas[0]?.indice[0];
  const valores = new Map<number, unknown>();
  for (const { indice, valor } of linhas) {
    const [doDispositivo, item, ...resto] = indice;
    if (doDispositivo !== dispositivo || item === undefined || item < 1 || resto.length > 0)
      continue;
    valores.set(item, valor);
  }
  return valores;
}

/** A coluna da tabela, com o índice depois dela. */
const daColuna = (linhas: readonly Linha[], coluna: number): Linha[] =>
  linhas
    .filter(({ indice }) => indice[0] === coluna)
    .map(({ indice, valor }) => ({ indice: indice.slice(1), valor }));

function suprimentosDas(linhas: readonly Linha[]): SuprimentoInformado[] {
  const descricoes = porItem(daColuna(linhas, COLUNA_DA_DESCRICAO));
  const capacidades = porItem(daColuna(linhas, COLUNA_DA_CAPACIDADE));
  const niveis = porItem(daColuna(linhas, COLUNA_DO_NIVEL));
  return [...descricoes]
    .flatMap(([item, valor]) => {
      const descricao = texto(valor);
      const capacidade = inteiro(capacidades.get(item));
      const nivel = inteiro(niveis.get(item));
      if (descricao === null || capacidade === null || nivel === null) return [];
      return [{ item, descricao, capacidade, nivel }];
    })
    .sort((a, b) => a.item - b.item);
}

function contadoresDas(paginas: readonly Linha[], cores: readonly Linha[]): ContadorInformado[] {
  const coresPorItem = porItem(cores);
  return [...porItem(paginas)]
    .flatMap(([item, valor]) => {
      const total = inteiro(valor);
      if (total === null) return [];
      const doMarcador = inteiro(coresPorItem.get(item));
      return [
        { item, paginas: total, cores: doMarcador !== null && doMarcador >= 0 ? doMarcador : null },
      ];
    })
    .sort((a, b) => a.item - b.item);
}

/** Lê a impressora; a que não responde a um pedido, depois da tentativa a mais, não respondeu. */
export async function lerImpressora(opcoes: OpcoesDaLeitura): Promise<LeituraSnmp> {
  const sessao = abrirSessao(opcoes);
  const ler = async (base: string) => linhasDa(await lerSubarvore(sessao, base), base);
  try {
    // Uma subárvore por vez: a impressora que não responde para a leitura na primeira.
    const serie = await ler(SUBARVORES_DA_IMPRESSORA.serie);
    const suprimentos = await ler(SUBARVORES_DA_IMPRESSORA.suprimentos);
    const paginas = await ler(SUBARVORES_DA_IMPRESSORA.contadores);
    const cores = await ler(SUBARVORES_DA_IMPRESSORA.cores);
    const condicoes = await ler(SUBARVORES_DA_IMPRESSORA.condicoes);
    const mensagens = await ler(SUBARVORES_DA_IMPRESSORA.mensagens);
    const estadoDeErro = condicoes[0]?.valor;
    return {
      respondeu: true,
      serie: texto(serie[0]?.valor) || null,
      suprimentos: suprimentosDas(suprimentos),
      contadores: contadoresDas(paginas, cores),
      estadoDeErro: Buffer.isBuffer(estadoDeErro) ? [...estadoDeErro] : null,
      mensagens: [...porItem(mensagens).values()]
        .map(texto)
        .filter((mensagem): mensagem is string => Boolean(mensagem)),
    };
  } catch {
    return { respondeu: false };
  } finally {
    sessao.close();
  }
}

/** O texto no tamanho que o lote aceita. */
const caber = (valor: string) => valor.slice(0, TEXTO_MAXIMO);

/**
 * As leituras da impressora, pelas regras do domínio (design do P2b, decisão 1): a resposta e, quando
 * ela respondeu, a série, cada suprimento com o nível, cada contador, as condições e as mensagens. O
 * suprimento sem capacidade nem indicação de nível fica de fora.
 */
export function leiturasDaImpressora(
  ativoId: string,
  lida: LeituraSnmp,
  momento: Date,
): LeituraParaEnviar[] {
  const quando = momento.toISOString();
  const leitura = (metrica: MetricaDaColeta, valor: LeituraParaEnviar['valor']) => ({
    ativoId,
    metrica,
    momento: quando,
    valor,
  });
  if (!lida.respondeu) return [leitura('snmp.resposta', 'nao-respondeu')];
  const leituras: LeituraParaEnviar[] = [leitura('snmp.resposta', 'respondeu')];
  const serie = lida.serie?.trim();
  if (serie) leituras.push(leitura('impressora.serie', caber(serie)));
  for (const { item, descricao, capacidade, nivel } of lida.suprimentos) {
    const doNivel = nivelDoSuprimento(capacidade, nivel);
    if (doNivel === null) continue;
    leituras.push({
      ...leitura('impressora.suprimento', doNivel.tipo === 'medido' ? doNivel.percentual : null),
      item: String(item),
      detalhes: { descricao: caber(descricao), capacidade, nivel },
    });
  }
  for (const { item, paginas, cores } of lida.contadores) {
    leituras.push({
      ...leitura('impressora.contador', paginas),
      item: String(item),
      ...(cores === null ? {} : { detalhes: { cores } }),
    });
  }
  if (lida.estadoDeErro !== null) {
    leituras.push(leitura('impressora.condicoes', condicoesDosBits(lida.estadoDeErro)));
  }
  const mensagens = lida.mensagens
    .map((mensagem) => mensagem.trim())
    .filter((mensagem) => mensagem !== '')
    .slice(0, ITENS_DA_LISTA)
    .map(caber);
  leituras.push(leitura('impressora.mensagens', mensagens));
  return leituras;
}
