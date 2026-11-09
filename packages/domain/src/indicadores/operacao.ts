// O cálculo dos indicadores da operação sobre as OS e as saídas do período (spec
// indicadores-da-operacao; change p4f-indicadores-da-operacao, design, decisões 1 a 3). A API lê as
// OS que tocam os últimos 60 dias pelo alcance da conta, ou da organização inteira na avaliação
// diária, e as passa para cá com o momento da consulta e as metas: a tela e a notificação calculam
// pela mesma função. O ativo de cada OS e a impressora de cada saída passam sem ser lidos; a chave
// de cada um os identifica para agrupar.
import type { CorDeConsumivel } from '../consumiveis/consumivel.ts';
import { type SituacaoDaOrdem, situacaoEmAberto } from '../ordens/ordens.ts';
import {
  cortar,
  dentro,
  mediana,
  minutosEntre,
  type PeriodoDosIndicadores,
  periodoDosIndicadores,
  type ResultadoDoIndicador,
  situacaoDoTempo,
} from './calculo.ts';
import type { IndicadorDaOperacao } from './indicadores.ts';

/** Uma mudança do histórico de uma OS. */
export interface MudancaParaOsIndicadores {
  situacao: SituacaoDaOrdem;
  mudadaEm: Date;
}

export interface OrdemParaOsIndicadores<A> {
  id: string;
  numero: number;
  problema: string;
  situacao: SituacaoDaOrdem;
  ativoChave: string;
  ativo: A;
  abertaEm: Date;
  /** A última resolução; a reabertura a limpa. */
  resolvidaEm: Date | null;
  historico: readonly MudancaParaOsIndicadores[];
}

/** Uma OS na lista do tempo de resolução. */
export interface ItemDaResolucao<A> {
  id: string;
  numero: number;
  problema: string;
  ativo: A;
  /** Da abertura à resolução, ou até agora na OS em aberto. */
  minutos: number;
  emAberto: boolean;
  esperaPelaPeca: number;
  esperaPeloFornecedor: number;
}

/** A OS encerrada sem a resolução: a aberta por engano ou no ativo errado. */
const encerradaSemResolver = <A>(ordem: OrdemParaOsIndicadores<A>) =>
  ordem.situacao === 'encerrada' && ordem.resolvidaEm === null;

/**
 * A espera de uma OS, em minutos, pela soma dos intervalos do histórico em Aguardando peça e em
 * Aguardando fornecedor: cada um vai da mudança para a situação até a mudança seguinte, sem passar
 * da resolução, ou de agora na OS em aberto.
 */
function esperasDa<A>(ordem: OrdemParaOsIndicadores<A>, agora: Date) {
  const fim = ordem.resolvidaEm ?? agora;
  const mudancas = [...ordem.historico].sort((a, b) => a.mudadaEm.getTime() - b.mudadaEm.getTime());
  let pelaPeca = 0;
  let peloFornecedor = 0;
  mudancas.forEach((mudanca, indice) => {
    if (mudanca.situacao !== 'aguardando-peca' && mudanca.situacao !== 'aguardando-fornecedor') {
      return;
    }
    const seguinte = mudancas[indice + 1]?.mudadaEm ?? fim;
    const ate = seguinte.getTime() < fim.getTime() ? seguinte : fim;
    const minutos = Math.max(0, minutosEntre(mudanca.mudadaEm, ate));
    if (mudanca.situacao === 'aguardando-peca') pelaPeca += minutos;
    else peloFornecedor += minutos;
  });
  return { esperaPelaPeca: pelaPeca, esperaPeloFornecedor: peloFornecedor };
}

/**
 * O tempo de resolução das OS: a mediana da abertura à última resolução, nas OS resolvidas no
 * período, com a espera pela peça e pelo fornecedor dentro. A lista traz primeiro as em aberto há
 * mais tempo que a meta, da mais antiga para a mais nova, e depois as resolvidas depois da meta, da
 * mais demorada para a mais rápida, cada uma com a espera.
 */
export function indicadorDaResolucao<A>(
  ordens: readonly OrdemParaOsIndicadores<A>[],
  { inicio, fim, inicioDoAnterior }: PeriodoDosIndicadores,
  meta: number,
): ResultadoDoIndicador<ItemDaResolucao<A>> {
  const resolvidasEm = (de: Date, ate: Date) =>
    ordens.filter((ordem) => ordem.resolvidaEm !== null && dentro(ordem.resolvidaEm, de, ate));
  const duracao = (ordem: OrdemParaOsIndicadores<A>) =>
    minutosEntre(ordem.abertaEm, ordem.resolvidaEm ?? fim);
  const resolvidas = resolvidasEm(inicio, fim);
  const valor = mediana(resolvidas.map(duracao));

  const item = (ordem: OrdemParaOsIndicadores<A>, emAberto: boolean): ItemDaResolucao<A> => ({
    id: ordem.id,
    numero: ordem.numero,
    problema: ordem.problema,
    ativo: ordem.ativo,
    minutos: duracao(ordem),
    emAberto,
    ...esperasDa(ordem, fim),
  });
  const maisDemorada = (a: ItemDaResolucao<A>, b: ItemDaResolucao<A>) => b.minutos - a.minutos;
  const emAberto = ordens
    .filter((ordem) => situacaoEmAberto(ordem.situacao))
    .map((ordem) => item(ordem, true))
    .filter(({ minutos }) => minutos > meta)
    .sort(maisDemorada);
  const demoradas = resolvidas
    .map((ordem) => item(ordem, false))
    .filter(({ minutos }) => minutos > meta)
    .sort(maisDemorada);

  return {
    valor,
    anterior: mediana(resolvidasEm(inicioDoAnterior, inicio).map(duracao)),
    base: resolvidas.length,
    situacao: situacaoDoTempo(valor, meta),
    ...cortar([...emAberto, ...demoradas]),
  };
}

/** Um ativo na lista das OS repetidas, com as OS dele no período. */
export interface ItemDasRepetidas<A> {
  ativo: A;
  quantas: number;
  ordens: { id: string; numero: number; problema: string }[];
  ultimaEm: Date;
}

/**
 * As OS repetidas: os ativos com a quantidade de OS da meta ou mais, abertas no período, menos as
 * encerradas sem resolver, do que teve mais OS para o que teve menos e, no empate, do que teve a
 * última mais recente.
 */
export function indicadorDasRepetidas<A>(
  ordens: readonly OrdemParaOsIndicadores<A>[],
  { inicio, fim, inicioDoAnterior }: PeriodoDosIndicadores,
  meta: number,
): ResultadoDoIndicador<ItemDasRepetidas<A>> {
  const repetidasEm = (de: Date, ate: Date) => {
    const abertas = ordens
      .filter((ordem) => !encerradaSemResolver(ordem) && dentro(ordem.abertaEm, de, ate))
      .sort((a, b) => a.abertaEm.getTime() - b.abertaEm.getTime());
    const porAtivo = new Map<string, ItemDasRepetidas<A>>();
    for (const ordem of abertas) {
      const doAtivo = porAtivo.get(ordem.ativoChave) ?? {
        ativo: ordem.ativo,
        quantas: 0,
        ordens: [],
        ultimaEm: ordem.abertaEm,
      };
      doAtivo.quantas += 1;
      doAtivo.ordens.push({ id: ordem.id, numero: ordem.numero, problema: ordem.problema });
      doAtivo.ultimaEm = ordem.abertaEm;
      porAtivo.set(ordem.ativoChave, doAtivo);
    }
    const repetidos = [...porAtivo.values()]
      .filter(({ quantas }) => quantas >= meta)
      .sort((a, b) => b.quantas - a.quantas || b.ultimaEm.getTime() - a.ultimaEm.getTime());
    return { repetidos, comOrdens: porAtivo.size };
  };
  const doPeriodo = repetidasEm(inicio, fim);
  const valor = doPeriodo.repetidos.length;
  return {
    valor,
    anterior: repetidasEm(inicioDoAnterior, inicio).repetidos.length,
    base: doPeriodo.comOrdens,
    situacao: valor > 0 ? 'fora' : 'dentro',
    ...cortar(doPeriodo.repetidos),
  };
}

/** Uma saída do estoque de um toner para uma impressora, com o total de páginas lido nela. */
export interface SaidaDeTonerParaOsIndicadores<I> {
  id: string;
  impressoraChave: string;
  impressora: I;
  consumivel: {
    id: string;
    codigo: string;
    cor: CorDeConsumivel | null;
    rendimento: number | null;
  };
  quantidade: number;
  momento: Date;
  totalDePaginas: number | null;
  /** A conta vê a saída, pelo local de origem; na avaliação diária, todas. */
  contaVe: boolean;
}

/** Um toner na lista das páginas por toner, pelo consumível e pela troca que fechou a vida dele. */
export interface ItemDasPaginas<I> {
  impressora: I;
  consumivel: { id: string; codigo: string };
  paginas: number;
  rendimento: number;
  /** As páginas sobre o rendimento, em décimos de ponto percentual: 617 é 61,7%. */
  porMil: number;
  trocadoEm: Date;
}

/** Um toner medido: a saída dele e a troca, com as páginas entre as duas. */
interface TonerMedido<I> {
  item: ItemDasPaginas<I>;
  /** Abaixo da meta, pela conta inteira, sem o arredondamento da porcentagem. */
  abaixo: (meta: number) => boolean;
}

/**
 * Os toners medidos, cada um da saída dele até a troca: a saída seguinte de um toner da mesma cor
 * para a mesma impressora, ou do mesmo consumível, quando ele não tem cor. Entra o toner de rendimento
 * conhecido, de uma saída de um toner só, com o total de páginas nas duas saídas e o da troca não
 * menor, trocado numa saída que a conta vê.
 */
function tonersMedidos<I>(saidas: readonly SaidaDeTonerParaOsIndicadores<I>[]): TonerMedido<I>[] {
  const porVida = new Map<string, SaidaDeTonerParaOsIndicadores<I>[]>();
  for (const saida of saidas) {
    const chave = `${saida.impressoraChave} ${saida.consumivel.cor ?? `consumivel:${saida.consumivel.id}`}`;
    porVida.set(chave, [...(porVida.get(chave) ?? []), saida]);
  }
  const medidos: TonerMedido<I>[] = [];
  for (const daVida of porVida.values()) {
    daVida.sort((a, b) => a.momento.getTime() - b.momento.getTime() || a.id.localeCompare(b.id));
    daVida.forEach((dele, indice) => {
      const troca = daVida[indice + 1];
      const { rendimento } = dele.consumivel;
      if (
        !troca?.contaVe ||
        rendimento === null ||
        dele.quantidade !== 1 ||
        dele.totalDePaginas === null ||
        troca.totalDePaginas === null ||
        troca.totalDePaginas < dele.totalDePaginas
      ) {
        return;
      }
      const paginas = troca.totalDePaginas - dele.totalDePaginas;
      medidos.push({
        item: {
          impressora: dele.impressora,
          consumivel: { id: dele.consumivel.id, codigo: dele.consumivel.codigo },
          paginas,
          rendimento,
          porMil: Math.round((paginas * 1000) / rendimento),
          trocadoEm: troca.momento,
        },
        abaixo: (meta) => paginas * 1000 < meta * rendimento,
      });
    });
  }
  return medidos;
}

/**
 * As páginas por toner: os toners trocados no período que renderam menos que a meta, em porcentagem
 * do rendimento, do que rendeu menos para o que rendeu mais. Sem nenhum toner medido, o indicador
 * não tem dado.
 */
export function indicadorDasPaginas<I>(
  saidas: readonly SaidaDeTonerParaOsIndicadores<I>[],
  { inicio, fim, inicioDoAnterior }: PeriodoDosIndicadores,
  meta: number,
): ResultadoDoIndicador<ItemDasPaginas<I>> {
  const medidos = tonersMedidos(saidas);
  const abaixoEm = (de: Date, ate: Date) => {
    const trocados = medidos.filter(({ item }) => dentro(item.trocadoEm, de, ate));
    const abaixo = trocados
      .filter((medido) => medido.abaixo(meta))
      .map(({ item }) => item)
      .sort((a, b) => a.porMil - b.porMil || b.trocadoEm.getTime() - a.trocadoEm.getTime());
    return { abaixo, medidos: trocados.length };
  };
  const doPeriodo = abaixoEm(inicio, fim);
  const doAnterior = abaixoEm(inicioDoAnterior, inicio);
  if (doPeriodo.medidos === 0) {
    return {
      valor: null,
      anterior: doAnterior.medidos === 0 ? null : doAnterior.abaixo.length,
      base: 0,
      situacao: 'sem-dado',
      itens: [],
      mais: 0,
    };
  }
  const valor = doPeriodo.abaixo.length;
  return {
    valor,
    anterior: doAnterior.medidos === 0 ? null : doAnterior.abaixo.length,
    base: doPeriodo.medidos,
    situacao: valor > 0 ? 'fora' : 'dentro',
    ...cortar(doPeriodo.abaixo),
  };
}

export interface ContextoDosIndicadoresDaOperacao {
  agora: Date;
  metas: Record<IndicadorDaOperacao, number>;
}

export interface IndicadoresDaOperacaoCalculados<A, I> {
  periodo: PeriodoDosIndicadores;
  'resolucao-das-os': ResultadoDoIndicador<ItemDaResolucao<A>>;
  'os-repetidas': ResultadoDoIndicador<ItemDasRepetidas<A>>;
  'paginas-por-toner': ResultadoDoIndicador<ItemDasPaginas<I>>;
}

/** Os três indicadores da operação, no período até `agora`, com as metas da organização. */
export function calcularIndicadoresDaOperacao<A, I>(
  {
    ordens,
    saidas,
  }: {
    ordens: readonly OrdemParaOsIndicadores<A>[];
    saidas: readonly SaidaDeTonerParaOsIndicadores<I>[];
  },
  { agora, metas }: ContextoDosIndicadoresDaOperacao,
): IndicadoresDaOperacaoCalculados<A, I> {
  const periodo = periodoDosIndicadores(agora);
  return {
    periodo,
    'resolucao-das-os': indicadorDaResolucao(ordens, periodo, metas['resolucao-das-os']),
    'os-repetidas': indicadorDasRepetidas(ordens, periodo, metas['os-repetidas']),
    'paginas-por-toner': indicadorDasPaginas(saidas, periodo, metas['paginas-por-toner']),
  };
}
