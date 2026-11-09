// As visões de tabela (spec visoes-de-tabela; design do P1c, decisão 1): o que a visão guarda (as
// colunas, com a ordem e a largura, a ordenação e os filtros), a leitura da forma dela, os filtros
// que cada coluna aceita, a visão de fábrica de cada tabela e a comparação que diz se a tabela está
// alterada. As chaves das colunas não são conferidas contra o catálogo: a coluna que deixou de valer
// fica guardada e volta quando valer de novo.
import type { Permissao } from '../acesso/permissoes.ts';
import { lerData } from '../campos/datas.ts';
import type { IdDoModuloOpcional } from '../modulos/modulos.ts';

export const LIMITES_DA_VISAO = {
  nome: 60,
  colunas: 60,
  largura: { minimo: 64, maximo: 800 },
  filtros: 20,
  valoresPorFiltro: 100,
  textoDoFiltro: 200,
  visoesDaConta: 50,
  visoesDaOrganizacao: 100,
  bytesDaDefinicao: 32_768,
} as const;

/** O id da visão de fábrica, no endereço e nas preferências. */
export const VISAO_DE_FABRICA = 'fabrica';

export type DirecaoDaOrdem = 'crescente' | 'decrescente';

export interface ColunaDaVisao {
  chave: string;
  /** A largura em pixels; sem ela, a coluna usa a largura padrão. */
  largura?: number;
}

export interface OrdenacaoDaVisao {
  chave: string;
  direcao: DirecaoDaOrdem;
}

/** O filtro de situação da lista: os ativos (o padrão), cada situação de uso, os inativos ou todos. */
export const SITUACOES_DO_FILTRO = [
  'ativos',
  'em-uso',
  'em-estoque',
  'em-manutencao',
  'inativos',
  'todos',
] as const;

export type SituacaoDoFiltro = (typeof SITUACOES_DO_FILTRO)[number];

export const ROTULOS_DAS_SITUACOES = {
  ativos: 'Ativos',
  'em-uso': 'Em uso',
  'em-estoque': 'Em estoque',
  'em-manutencao': 'Em manutenção',
  inativos: 'Inativos',
  todos: 'Todos',
} as const satisfies Record<SituacaoDoFiltro, string>;

/** Um filtro sobre uma coluna, pelo operador. O intervalo é de números ou de datas em aaaa-mm-dd. */
export type FiltroDaVisao =
  | { chave: string; operador: 'contem'; texto: string }
  | { chave: string; operador: 'vazio' }
  | { chave: string; operador: 'preenchido' }
  | { chave: string; operador: 'entre'; de?: number | string; ate?: number | string }
  | { chave: string; operador: 'qualquer'; valores: string[] }
  | { chave: string; operador: 'em'; local: string }
  /** O local sem os de dentro, da origem da tabela (change relacoes-vivas, design, decisão 3). */
  | { chave: string; operador: 'igual'; local: string }
  | { chave: string; operador: 'situacao'; situacao: SituacaoDoFiltro };

export type OperadorDeFiltro = FiltroDaVisao['operador'];

export const OPERADORES_DE_FILTRO = [
  'contem',
  'vazio',
  'preenchido',
  'entre',
  'qualquer',
  'em',
  'igual',
  'situacao',
] as const satisfies readonly OperadorDeFiltro[];

export interface DefinicaoDaVisao {
  colunas: ColunaDaVisao[];
  ordenacao: OrdenacaoDaVisao | null;
  filtros: FiltroDaVisao[];
}

/** O tipo do filtro de uma coluna, que diz o operador principal e a forma do valor. */
export type TipoDeFiltro =
  | 'texto'
  | 'numero'
  | 'data'
  | 'momento'
  | 'escolha'
  | 'local'
  | 'situacao';

/** Uma coluna que uma tabela com visões oferece. */
export interface ColunaDaTabela {
  chave: string;
  rotulo: string;
  grupo: string;
  /** A coluna que nomeia a linha: sempre à vista e em primeiro lugar. */
  principal?: boolean;
  ordena: boolean;
  /** O filtro da coluna; nulo quando ela só aceita "Está vazio" e "Está preenchido". */
  filtro: TipoDeFiltro | null;
  /** Se a coluna pode ficar sem valor, com os filtros "Está vazio" e "Está preenchido". */
  podeFicarVazia: boolean;
  alinhamento: 'inicio' | 'fim';
  mono: boolean;
  /** A largura padrão, em pixels. */
  largura: number;
  /** A coluna de um campo restrito. */
  restrita?: boolean;
}

/** Uma tabela que oferece visões, com o módulo, a permissão de vê-la e a visão de fábrica. */
export interface TabelaComVisoes {
  id: string;
  /** O módulo opcional da tabela: com ele desligado, as visões dela são recusadas. */
  modulo: IdDoModuloOpcional | null;
  /** A permissão de ver a tabela, em algum escopo. */
  permissao: Permissao;
  fabrica: { nome: string; definicao: DefinicaoDaVisao };
}

export const TABELAS_COM_VISOES = [
  {
    id: 'ativos',
    modulo: 'ativos',
    permissao: 'ativos.ver',
    fabrica: {
      nome: 'Todos os ativos',
      definicao: {
        colunas: [
          { chave: 'ativo.rotulo' },
          { chave: 'ativo.patrimonio' },
          { chave: 'ativo.local' },
          { chave: 'ativo.situacao' },
        ],
        ordenacao: { chave: 'ativo.criado-em', direcao: 'decrescente' },
        filtros: [{ chave: 'ativo.situacao', operador: 'situacao', situacao: 'ativos' }],
      },
    },
  },
] as const satisfies readonly TabelaComVisoes[];

export type IdDaTabelaComVisoes = (typeof TABELAS_COM_VISOES)[number]['id'];

export function tabelaComVisoes(id: string): TabelaComVisoes | undefined {
  return TABELAS_COM_VISOES.find((tabela) => tabela.id === id);
}

export type LeituraDaDefinicao =
  | { ok: true; definicao: DefinicaoDaVisao }
  | { ok: false; erro: string };

const INVALIDA = 'A definição da visão não é válida.';

/** A recusa de uma parte da definição: interrompe a leitura com a mensagem. */
class Recusa extends Error {}

type Bruto = Record<string, unknown>;

const objeto = (valor: unknown): Bruto | null =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Bruto) : null;

const textoNaoVazio = (valor: unknown): valor is string =>
  typeof valor === 'string' && valor.trim() !== '';

function recusar(mensagem: string): never {
  throw new Recusa(mensagem);
}

function lerColunas(bruto: unknown): ColunaDaVisao[] {
  if (!Array.isArray(bruto)) recusar(INVALIDA);
  if (bruto.length > LIMITES_DA_VISAO.colunas) recusar('Use até 60 colunas.');
  const vistas = new Set<string>();
  const colunas: ColunaDaVisao[] = [];
  for (const item of bruto) {
    const coluna = objeto(item);
    if (!coluna || !textoNaoVazio(coluna.chave)) recusar(INVALIDA);
    const largura = coluna.largura;
    if (largura !== undefined && (typeof largura !== 'number' || !Number.isFinite(largura))) {
      recusar(INVALIDA);
    }
    // A coluna repetida fica de fora: vale a primeira.
    if (vistas.has(coluna.chave)) continue;
    vistas.add(coluna.chave);
    const { minimo, maximo } = LIMITES_DA_VISAO.largura;
    colunas.push(
      largura === undefined
        ? { chave: coluna.chave }
        : { chave: coluna.chave, largura: Math.min(maximo, Math.max(minimo, Math.round(largura))) },
    );
  }
  return colunas;
}

function lerOrdenacao(bruto: unknown): OrdenacaoDaVisao | null {
  if (bruto === null || bruto === undefined) return null;
  const ordenacao = objeto(bruto);
  if (
    !ordenacao ||
    !textoNaoVazio(ordenacao.chave) ||
    (ordenacao.direcao !== 'crescente' && ordenacao.direcao !== 'decrescente')
  ) {
    recusar(INVALIDA);
  }
  return { chave: ordenacao.chave, direcao: ordenacao.direcao };
}

/** Um limite do intervalo: o número ou a data; ausente quando não veio. */
function lerLimite(valor: unknown): number | string | undefined {
  if (valor === undefined || valor === null) return undefined;
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '') return valor.trim();
  return recusar(INVALIDA);
}

function lerFiltro(bruto: unknown): FiltroDaVisao {
  const filtro = objeto(bruto);
  if (!filtro || !textoNaoVazio(filtro.chave)) recusar(INVALIDA);
  const { chave } = filtro;
  switch (filtro.operador) {
    case 'contem': {
      if (typeof filtro.texto !== 'string') recusar(INVALIDA);
      const texto = filtro.texto.trim();
      if (texto === '') recusar('Digite o texto do filtro.');
      if (texto.length > LIMITES_DA_VISAO.textoDoFiltro)
        recusar('Use até 200 caracteres no filtro.');
      return { chave, operador: 'contem', texto };
    }
    case 'vazio':
    case 'preenchido':
      return { chave, operador: filtro.operador };
    case 'entre': {
      const de = lerLimite(filtro.de);
      const ate = lerLimite(filtro.ate);
      if (de === undefined && ate === undefined) recusar('Informe o início ou o fim do intervalo.');
      return {
        chave,
        operador: 'entre',
        ...(de === undefined ? {} : { de }),
        ...(ate === undefined ? {} : { ate }),
      };
    }
    case 'qualquer': {
      if (!Array.isArray(filtro.valores) || !filtro.valores.every(textoNaoVazio)) recusar(INVALIDA);
      const valores = [...new Set(filtro.valores as string[])];
      if (valores.length === 0) recusar('Escolha pelo menos uma opção.');
      if (valores.length > LIMITES_DA_VISAO.valoresPorFiltro) recusar('Escolha até 100 opções.');
      return { chave, operador: 'qualquer', valores };
    }
    case 'em':
    case 'igual': {
      if (!textoNaoVazio(filtro.local)) recusar('Escolha um local.');
      const local = filtro.local.trim();
      return filtro.operador === 'em'
        ? { chave, operador: 'em', local }
        : { chave, operador: 'igual', local };
    }
    case 'situacao': {
      const situacao = SITUACOES_DO_FILTRO.find((candidata) => candidata === filtro.situacao);
      if (!situacao) recusar('Escolha uma situação da lista.');
      return { chave, operador: 'situacao', situacao };
    }
    default:
      return recusar(INVALIDA);
  }
}

function lerFiltros(bruto: unknown): FiltroDaVisao[] {
  if (!Array.isArray(bruto)) recusar(INVALIDA);
  if (bruto.length > LIMITES_DA_VISAO.filtros) recusar('Use até 20 filtros.');
  const filtros = bruto.map(lerFiltro);
  const chaves = new Set(filtros.map((filtro) => filtro.chave));
  if (chaves.size !== filtros.length) recusar('Use um filtro por coluna.');
  return filtros;
}

const bytes = (valor: unknown) => new TextEncoder().encode(JSON.stringify(valor) ?? '').length;

/**
 * Lê a definição de uma visão: confere a forma e os limites, com a mensagem da recusa. A largura
 * fora do intervalo é trazida para o limite mais próximo, e a coluna repetida fica de fora.
 */
export function lerDefinicaoDaVisao(bruto: unknown): LeituraDaDefinicao {
  const definicao = objeto(bruto);
  if (!definicao) return { ok: false, erro: INVALIDA };
  if (bytes(definicao) > LIMITES_DA_VISAO.bytesDaDefinicao) {
    return { ok: false, erro: 'A visão passou do tamanho permitido.' };
  }
  try {
    return {
      ok: true,
      definicao: {
        colunas: lerColunas(definicao.colunas),
        ordenacao: lerOrdenacao(definicao.ordenacao),
        filtros: lerFiltros(definicao.filtros),
      },
    };
  } catch (erro) {
    if (erro instanceof Recusa) return { ok: false, erro: erro.message };
    throw erro;
  }
}

const OPERADOR_DO_FILTRO = {
  texto: 'contem',
  numero: 'entre',
  data: 'entre',
  momento: 'entre',
  escolha: 'qualquer',
  local: 'em',
  situacao: 'situacao',
} as const satisfies Record<TipoDeFiltro, OperadorDeFiltro>;

/** Os operadores que o filtro aceita além do dele: o local sem os de dentro. */
const OPERADORES_A_MAIS: Partial<Record<TipoDeFiltro, readonly OperadorDeFiltro[]>> = {
  local: ['igual'],
};

/**
 * Os operadores que a coluna aceita: os do filtro dela e, se pode ficar vazia, vazio e preenchido.
 */
export function operadoresDa(
  coluna: Pick<ColunaDaTabela, 'filtro' | 'podeFicarVazia'>,
): OperadorDeFiltro[] {
  return [
    ...(coluna.filtro
      ? [OPERADOR_DO_FILTRO[coluna.filtro], ...(OPERADORES_A_MAIS[coluna.filtro] ?? [])]
      : []),
    ...(coluna.podeFicarVazia ? (['vazio', 'preenchido'] as const) : []),
  ];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A data em aaaa-mm-dd que existe, como o motor de campos guarda. */
const dataValida = (valor: unknown): valor is string => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const lida = lerData(valor);
  return lida.ok && lida.valor === valor;
};

/**
 * A recusa de um filtro para a coluna, ou `null` quando ele vale: o operador que a coluna aceita e
 * o valor na forma do filtro dela (o número, a data, o local).
 */
export function conferirFiltro(filtro: FiltroDaVisao, coluna: ColunaDaTabela): string | null {
  if (!operadoresDa(coluna).includes(filtro.operador)) {
    return `Este filtro não vale para a coluna ${coluna.rotulo}.`;
  }
  if (filtro.operador === 'entre') {
    const limites = [filtro.de, filtro.ate].filter((limite) => limite !== undefined);
    if (coluna.filtro === 'numero') {
      if (!limites.every((limite) => typeof limite === 'number')) return 'Use um número.';
    } else if (!limites.every(dataValida)) {
      return 'Use uma data válida.';
    }
    if (filtro.de !== undefined && filtro.ate !== undefined && filtro.de > filtro.ate) {
      return 'O início vem depois do fim.';
    }
  }
  if ((filtro.operador === 'em' || filtro.operador === 'igual') && !UUID.test(filtro.local)) {
    return 'Escolha um local.';
  }
  return null;
}

/**
 * A definição como a tabela a mostra com as colunas disponíveis: a principal em primeiro lugar, e
 * sem as colunas, os filtros e a ordem que deixaram de valer. A definição dada não muda: o que saiu
 * volta quando a coluna valer de novo.
 */
export function aplicarAColunas(
  definicao: DefinicaoDaVisao,
  disponiveis: readonly ColunaDaTabela[],
): DefinicaoDaVisao {
  const porChave = new Map(disponiveis.map((coluna) => [coluna.chave, coluna]));
  const principal = disponiveis.find((coluna) => coluna.principal);
  const visiveis = definicao.colunas.filter((coluna) => porChave.has(coluna.chave));
  const daPrincipal = principal && visiveis.find((coluna) => coluna.chave === principal.chave);
  const colunas = principal
    ? [
        daPrincipal ? { ...daPrincipal } : { chave: principal.chave },
        ...visiveis
          .filter((coluna) => coluna.chave !== principal.chave)
          .map((coluna) => ({ ...coluna })),
      ]
    : visiveis.map((coluna) => ({ ...coluna }));
  const daOrdem = definicao.ordenacao && porChave.get(definicao.ordenacao.chave);
  const filtros = definicao.filtros.filter((filtro) => {
    const coluna = porChave.get(filtro.chave);
    return coluna !== undefined && conferirFiltro(filtro, coluna) === null;
  });
  return {
    colunas,
    ordenacao: daOrdem?.ordena && definicao.ordenacao ? { ...definicao.ordenacao } : null,
    filtros: structuredClone(filtros),
  };
}

/** O filtro numa forma única, com as chaves sempre na mesma ordem, para comparar. */
function formaDoFiltro(filtro: FiltroDaVisao): string {
  const { chave, operador } = filtro;
  const resto = Object.fromEntries(
    Object.entries(filtro)
      .filter(([nome]) => nome !== 'chave' && nome !== 'operador')
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify([chave, operador, resto]);
}

/** As mesmas colunas, na mesma ordem e com a mesma largura. */
const mesmasColunas = (a: DefinicaoDaVisao, b: DefinicaoDaVisao) =>
  a.colunas.length === b.colunas.length &&
  a.colunas.every((coluna, indice) => {
    const outra = b.colunas[indice];
    return outra?.chave === coluna.chave && outra.largura === coluna.largura;
  });

const mesmaOrdenacao = (a: DefinicaoDaVisao, b: DefinicaoDaVisao) =>
  a.ordenacao === null || b.ordenacao === null
    ? a.ordenacao === b.ordenacao
    : a.ordenacao.chave === b.ordenacao.chave && a.ordenacao.direcao === b.ordenacao.direcao;

/** Os mesmos filtros, em qualquer ordem. */
function mesmosFiltros(a: DefinicaoDaVisao, b: DefinicaoDaVisao) {
  if (a.filtros.length !== b.filtros.length) return false;
  const formas = (filtros: FiltroDaVisao[]) => filtros.map(formaDoFiltro).sort();
  const deA = formas(a.filtros);
  const deB = formas(b.filtros);
  return deA.every((forma, indice) => forma === deB[indice]);
}

/**
 * Se as duas definições mostram a mesma tabela: as mesmas colunas, na mesma ordem e com a mesma
 * largura, a mesma ordenação e os mesmos filtros, em qualquer ordem.
 */
export function mesmaDefinicao(a: DefinicaoDaVisao, b: DefinicaoDaVisao): boolean {
  return mesmasColunas(a, b) && mesmaOrdenacao(a, b) && mesmosFiltros(a, b);
}

/** As partes da tabela que a tela nomeia ao dizer o que a conta mudou numa visão. */
export type ParteDaVisao = 'colunas' | 'ordem' | 'filtros';

/**
 * O que a tabela mudou sobre a visão salva, nessa ordem: as colunas, com a ordem e a largura delas,
 * a ordenação e os filtros (change visoes-da-conta, design, decisão 4).
 */
export function partesQueMudaram(
  salva: DefinicaoDaVisao,
  tabela: DefinicaoDaVisao,
): ParteDaVisao[] {
  return [
    ...(mesmasColunas(salva, tabela) ? [] : (['colunas'] as const)),
    ...(mesmaOrdenacao(salva, tabela) ? [] : (['ordem'] as const)),
    ...(mesmosFiltros(salva, tabela) ? [] : (['filtros'] as const)),
  ];
}

/**
 * A visão que abre a tabela: a escolhida pela conta, a padrão da organização ou a de fábrica, nessa
 * ordem, pulando a que não está entre as que a conta pode usar, como uma visão removida. A de
 * fábrica escolhida numa camada vale sem conferência.
 */
export function visaoQueVale(
  { conta, organizacao }: { conta?: string; organizacao?: string },
  usaveis: ReadonlySet<string>,
): string {
  for (const escolhida of [conta, organizacao]) {
    if (escolhida === VISAO_DE_FABRICA) return VISAO_DE_FABRICA;
    if (escolhida !== undefined && usaveis.has(escolhida)) return escolhida;
  }
  return VISAO_DE_FABRICA;
}

/** O nome da visão, sem os espaços das bordas, de 1 a 60 caracteres. */
export function lerNomeDaVisao(
  bruto: unknown,
): { ok: true; nome: string } | { ok: false; erro: string } {
  const nome = typeof bruto === 'string' ? bruto.trim() : '';
  if (nome === '') return { ok: false, erro: 'Dê um nome à visão.' };
  if (nome.length > LIMITES_DA_VISAO.nome) return { ok: false, erro: 'Use até 60 caracteres.' };
  return { ok: true, nome };
}
