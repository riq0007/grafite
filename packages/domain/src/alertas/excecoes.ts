// As exceções da regra (spec alertas, "Exceções da regra"; change regras-indicadores-e-tarefas,
// design, decisões 1 e 2): num tipo, num modelo, num ativo ou num local, a regra não alerta ou, na
// regra do toner, usa outro limite. A exceção mais específica vence: a do ativo, a do modelo, a do
// tipo e a do local mais fundo. O lugar que não existe ou está inativo, a API confere no banco com
// as mensagens do escopo.
import {
  type CondicaoDeAlerta,
  condicaoDe,
  LIMITES_DA_REGRA,
  MENSAGENS_DO_ESCOPO,
  type ParametrosDasCondicoes,
} from './regras.ts';

export const EFEITOS_DA_EXCECAO = ['nao-alertar', 'outro-limite'] as const;

export type EfeitoDaExcecao = (typeof EFEITOS_DA_EXCECAO)[number];

export const ROTULOS_DOS_EFEITOS = {
  'nao-alertar': 'Não alertar',
  'outro-limite': 'Outro limite',
} as const satisfies Record<EfeitoDaExcecao, string>;

export const LUGARES_DA_EXCECAO = ['ativo', 'modelo', 'tipo', 'local'] as const;

export type LugarDaExcecao = { tipo: (typeof LUGARES_DA_EXCECAO)[number]; id: string };

export type ExcecaoDaRegra =
  | { lugar: LugarDaExcecao; efeito: 'nao-alertar' }
  | { lugar: LugarDaExcecao; efeito: 'outro-limite'; limite: number; folga: number };

export const MAXIMO_DE_EXCECOES = 50;

/** Os erros das exceções: o da lista, em `excecoes`, e o de cada uma, em `excecoes.<posição>`. */
export type ErrosDasExcecoes = Record<string, string>;

export type ConferenciaDasExcecoes =
  | { ok: true; excecoes: ExcecaoDaRegra[] }
  | { ok: false; erros: ErrosDasExcecoes };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const objeto = (valor: unknown): Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};

const inteiroEntre = (valor: unknown, [minimo, maximo]: readonly [number, number]) =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo && valor <= maximo
    ? valor
    : null;

/** Uma exceção conferida, ou a mensagem dela. */
function conferirUma(condicao: CondicaoDeAlerta, entrada: unknown): ExcecaoDaRegra | string {
  const dados = objeto(entrada);
  const lugar = objeto(dados.lugar);
  if (!(LUGARES_DA_EXCECAO as readonly unknown[]).includes(lugar.tipo)) {
    return 'Escolha onde vale a exceção.';
  }
  const tipo = lugar.tipo as LugarDaExcecao['tipo'];
  if (typeof lugar.id !== 'string' || !UUID.test(lugar.id)) return MENSAGENS_DO_ESCOPO[tipo];
  const onde = { tipo, id: lugar.id };
  if (dados.efeito === 'nao-alertar') return { lugar: onde, efeito: 'nao-alertar' };
  if (dados.efeito !== 'outro-limite') return 'Escolha o efeito da exceção.';
  if (condicao !== 'toner.nivel') return 'Outro limite só vale na regra do toner.';
  const limite = inteiroEntre(dados.limite, LIMITES_DA_REGRA.limite);
  if (limite === null) return 'Informe um limite de 1 a 99%.';
  const folga = inteiroEntre(dados.folga, LIMITES_DA_REGRA.folga);
  if (folga === null) return 'Informe uma folga de 0 a 50 pontos.';
  if (limite + folga >= 100) return 'O limite mais a folga precisa ficar abaixo de 100%.';
  return { lugar: onde, efeito: 'outro-limite', limite, folga };
}

/** Confere as exceções que chegam com a regra; sem nenhuma, a lista vazia. */
export function conferirExcecoes(
  condicao: CondicaoDeAlerta,
  entrada: unknown,
): ConferenciaDasExcecoes {
  if (entrada === undefined || entrada === null) return { ok: true, excecoes: [] };
  if (!Array.isArray(entrada))
    return { ok: false, erros: { excecoes: 'Envie as exceções numa lista.' } };
  if (entrada.length === 0) return { ok: true, excecoes: [] };
  if (condicaoDe(condicao)?.alvo === 'coletor') {
    return { ok: false, erros: { excecoes: 'A regra do coletor não tem exceções.' } };
  }
  if (entrada.length > MAXIMO_DE_EXCECOES) {
    return { ok: false, erros: { excecoes: 'Use até 50 exceções na regra.' } };
  }
  const erros: ErrosDasExcecoes = {};
  const excecoes: ExcecaoDaRegra[] = [];
  const lugares = new Set<string>();
  entrada.forEach((item, posicao) => {
    const conferida = conferirUma(condicao, item);
    if (typeof conferida === 'string') {
      erros[`excecoes.${posicao}`] = conferida;
      return;
    }
    const chave = `${conferida.lugar.tipo}:${conferida.lugar.id}`;
    if (lugares.has(chave)) {
      erros[`excecoes.${posicao}`] = 'Já existe uma exceção nesse lugar.';
      return;
    }
    lugares.add(chave);
    excecoes.push(conferida);
  });
  return Object.keys(erros).length > 0 ? { ok: false, erros } : { ok: true, excecoes };
}

/** O ativo, como a avaliação o lê, para achar a exceção dele. */
export interface AtivoDaExcecao {
  id: string;
  tipoId: string;
  modeloId: string | null;
  localId: string | null;
}

/**
 * A exceção mais específica que alcança o ativo: a dele, a do modelo, a do tipo e, entre as dos
 * locais que o têm no ramo, a do local de ramo menor, o mais fundo. `ramoDe` dá o local com os de
 * baixo.
 */
export function excecaoDoAtivo(
  excecoes: readonly ExcecaoDaRegra[],
  ativo: AtivoDaExcecao,
  ramoDe: (localId: string) => ReadonlySet<string>,
): ExcecaoDaRegra | null {
  const em = (tipo: LugarDaExcecao['tipo'], id: string | null) =>
    id === null
      ? undefined
      : excecoes.find((excecao) => excecao.lugar.tipo === tipo && excecao.lugar.id === id);
  const direta = em('ativo', ativo.id) ?? em('modelo', ativo.modeloId) ?? em('tipo', ativo.tipoId);
  if (direta) return direta;
  if (ativo.localId === null) return null;
  let maisFunda: ExcecaoDaRegra | null = null;
  let tamanho = Number.POSITIVE_INFINITY;
  for (const excecao of excecoes) {
    if (excecao.lugar.tipo !== 'local') continue;
    const ramo = ramoDe(excecao.lugar.id);
    if (ramo.has(ativo.localId) && ramo.size < tamanho) {
      maisFunda = excecao;
      tamanho = ramo.size;
    }
  }
  return maisFunda;
}

/** Os parâmetros do toner no ativo: os da exceção "Outro limite", ou os da regra. */
export function parametrosNoAtivo(
  daRegra: ParametrosDasCondicoes['toner.nivel'],
  excecao: ExcecaoDaRegra | null,
): ParametrosDasCondicoes['toner.nivel'] {
  return excecao?.efeito === 'outro-limite'
    ? { limite: excecao.limite, folga: excecao.folga }
    : daRegra;
}
