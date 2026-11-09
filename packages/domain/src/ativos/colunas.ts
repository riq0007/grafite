// As colunas da tabela dos ativos (spec cadastro-de-ativos; design do P1c, decisão 2): as do ativo,
// as dos campos comuns, as dos campos da organização ativos que algum tipo ativo usa e as das
// capacidades ligadas a algum tipo ativo, com o que cada uma ordena e filtra. A API confere por elas
// as colunas, a ordem e os filtros pedidos, e a web monta por elas o cabeçalho, o painel "Colunas",
// as células e os editores de filtro.
import type { DefinicaoDeCampo, TipoDeCampo } from '../campos/tipos.ts';
import { normalizarTexto } from '../texto.ts';
import type { ColunaDaTabela, TipoDeFiltro } from '../visoes/visoes.ts';
import { CAMPOS_DO_ATIVO, GRUPOS_COMUNS } from './campos-do-ativo.ts';
import {
  CAPACIDADES,
  type CampoDoTipo,
  type Capacidade,
  type ColunaColetada,
  type SituacaoDoCadastro,
} from './catalogo.ts';
import { type CampoNoCatalogo, GRUPO_SEM_NOME } from './valores-do-ativo.ts';

/** O grupo das colunas do cadastro e da última mudança do ativo. */
export const GRUPO_DO_REGISTRO = 'Registro';

/** O grupo, recolhido nos painéis, dos campos dos tipos que não estão no filtro de Tipo. */
export const GRUPO_DOS_OUTROS_TIPOS = 'Outros tipos';

/** A coluna que nomeia a linha: o nome do ativo, com o tipo. */
export const COLUNA_PRINCIPAL_DOS_ATIVOS = 'ativo.rotulo';

/** De onde vem a coluna: o próprio ativo, um campo comum, um da organização ou de uma capacidade. */
export type OrigemDaColuna = 'ativo' | 'comum' | 'organizacao' | 'capacidade';

export interface ColunaDosAtivos extends ColunaDaTabela {
  origem: OrigemDaColuna;
  /** O sufixo do número de uma coluna coletada, como "%". */
  unidade?: string;
  /** O tipo e a configuração do campo, para mostrar o valor pelo motor; as do ativo não têm. */
  campo?: DefinicaoDeCampo;
}

/** O que as colunas precisam de cada tipo de ativo do catálogo. */
export interface TipoNasColunas {
  /** O id, para a ordem pelos tipos filtrados; sem ele, o tipo nunca conta como filtrado. */
  id?: string;
  situacao: SituacaoDoCadastro;
  capacidades: readonly string[];
  campos: readonly CampoDoTipo[];
}

/** Como cada tipo de campo vira coluna: o filtro, se ordena, o alinhamento, a fonte e a largura. */
const POR_TIPO: Record<
  TipoDeCampo,
  Pick<ColunaDaTabela, 'filtro' | 'ordena' | 'alinhamento' | 'mono' | 'largura'>
> = {
  texto: { filtro: 'texto', ordena: true, alinhamento: 'inicio', mono: false, largura: 180 },
  'texto-longo': {
    filtro: 'texto',
    ordena: true,
    alinhamento: 'inicio',
    mono: false,
    largura: 240,
  },
  licenca: { filtro: 'texto', ordena: true, alinhamento: 'inicio', mono: false, largura: 180 },
  url: { filtro: 'texto', ordena: true, alinhamento: 'inicio', mono: false, largura: 220 },
  ip: { filtro: 'texto', ordena: true, alinhamento: 'inicio', mono: true, largura: 140 },
  mac: { filtro: 'texto', ordena: true, alinhamento: 'inicio', mono: true, largura: 150 },
  inteiro: { filtro: 'numero', ordena: true, alinhamento: 'fim', mono: true, largura: 120 },
  decimal: { filtro: 'numero', ordena: true, alinhamento: 'fim', mono: true, largura: 120 },
  moeda: { filtro: 'numero', ordena: true, alinhamento: 'fim', mono: true, largura: 140 },
  data: { filtro: 'data', ordena: true, alinhamento: 'inicio', mono: true, largura: 120 },
  lista: { filtro: 'escolha', ordena: true, alinhamento: 'inicio', mono: false, largura: 150 },
  'lista-multipla': {
    filtro: 'escolha',
    ordena: false,
    alinhamento: 'inicio',
    mono: false,
    largura: 200,
  },
  pessoa: { filtro: 'escolha', ordena: true, alinhamento: 'inicio', mono: false, largura: 180 },
  fornecedor: { filtro: 'escolha', ordena: true, alinhamento: 'inicio', mono: false, largura: 180 },
  local: { filtro: 'local', ordena: true, alinhamento: 'inicio', mono: false, largura: 220 },
  ativo: { filtro: null, ordena: false, alinhamento: 'inicio', mono: false, largura: 220 },
  arquivo: { filtro: null, ordena: false, alinhamento: 'inicio', mono: false, largura: 220 },
  imagem: { filtro: null, ordena: false, alinhamento: 'inicio', mono: false, largura: 96 },
};

/** Os identificadores dos campos comuns de texto, na fonte mono, como o IP e o MAC. */
const IDENTIFICADORES = new Set(['ativo.patrimonio', 'ativo.serie', 'ativo.hostname']);

/** Os campos comuns que não viram coluna: o nome está na coluna Ativo, e o uso, na Situação. */
const FORA_DAS_COLUNAS = new Set(['ativo.nome', 'ativo.uso']);

const doAtivo = (
  chave: string,
  rotulo: string,
  grupo: string,
  filtro: TipoDeFiltro,
  extras: Partial<ColunaDosAtivos> = {},
): ColunaDosAtivos => ({
  chave,
  rotulo,
  grupo,
  ordena: true,
  filtro,
  podeFicarVazia: false,
  alinhamento: 'inicio',
  mono: false,
  largura: 150,
  origem: 'ativo',
  ...extras,
});

function doCampo(
  chave: string,
  rotulo: string,
  grupo: string,
  definicao: DefinicaoDeCampo,
  origem: Exclude<OrigemDaColuna, 'ativo'>,
  restrita = false,
): ColunaDosAtivos {
  const doTipo = POR_TIPO[definicao.tipo];
  return {
    chave,
    rotulo,
    grupo,
    ...doTipo,
    mono: doTipo.mono || IDENTIFICADORES.has(chave),
    largura: IDENTIFICADORES.has(chave) ? 140 : doTipo.largura,
    podeFicarVazia: true,
    origem,
    campo: { tipo: definicao.tipo, configuracao: definicao.configuracao ?? {} },
    ...(restrita ? { restrita: true } : {}),
  };
}

/**
 * A coluna de um valor coletado: a situação, como a disponibilidade, com as opções como as de uma
 * lista para o filtro "é qualquer de"; ou o número, como o menor nível dos suprimentos, que ordena
 * pelo número, filtra "de e até" e fica vazio no ativo sem leitura.
 */
const coletada = (coluna: ColunaColetada, grupo: string): ColunaDosAtivos =>
  coluna.tipo === 'numero'
    ? {
        chave: coluna.chave,
        rotulo: coluna.rotulo,
        grupo,
        ordena: true,
        filtro: 'numero',
        podeFicarVazia: true,
        alinhamento: 'fim',
        mono: true,
        largura: 150,
        origem: 'capacidade',
        campo: { tipo: 'inteiro', configuracao: {} },
        ...(coluna.unidade ? { unidade: coluna.unidade } : {}),
      }
    : daSituacao(coluna, grupo);

const daSituacao = (
  coluna: Extract<ColunaColetada, { tipo: 'situacao' }>,
  grupo: string,
): ColunaDosAtivos => ({
  chave: coluna.chave,
  rotulo: coluna.rotulo,
  grupo,
  ordena: true,
  filtro: 'escolha',
  podeFicarVazia: false,
  alinhamento: 'inicio',
  mono: false,
  largura: 170,
  origem: 'capacidade',
  campo: {
    tipo: 'lista',
    configuracao: {
      opcoes: coluna.opcoes.map((opcao) => ({ ...opcao, situacao: 'ativa' as const })),
    },
  },
});

const comum = (grupo: (typeof GRUPOS_COMUNS)[number]) =>
  CAMPOS_DO_ATIVO.filter(
    (campo) => campo.grupo === grupo && !FORA_DAS_COLUNAS.has(campo.chave),
  ).map((campo) =>
    doCampo(
      campo.chave,
      campo.rotulo,
      campo.grupo,
      { tipo: campo.tipo, configuracao: campo.configuracao },
      'comum',
    ),
  );

/**
 * As colunas disponíveis da tabela dos ativos, na ordem do painel "Colunas": Identificação, Uso, os
 * grupos dos campos da organização, "Outros", uma por capacidade, o Administrativo e o Registro. Um
 * campo da organização num grupo com o nome de um grupo comum entra nele, depois dos comuns. Os
 * campos restritos só entram com `verRestritos`, que é ter `ativos.restritos` em algum ramo.
 *
 * Com `tiposFiltrados`, os ids do filtro de Tipo, os painéis mostram primeiro os grupos dos campos
 * e das capacidades desses tipos, depois os comuns, e por último os campos dos outros tipos, no grupo
 * "Outros tipos" (change filtros-e-barra-da-tabela, design, decisão 4).
 */
export function colunasDosAtivos({
  tipos,
  campos,
  capacidades = CAPACIDADES,
  verRestritos,
  tiposFiltrados = [],
}: {
  tipos: readonly TipoNasColunas[];
  campos: readonly CampoNoCatalogo[];
  capacidades?: readonly Capacidade[];
  verRestritos: boolean;
  tiposFiltrados?: readonly string[];
}): ColunaDosAtivos[] {
  const ativos = tipos.filter((tipo) => tipo.situacao === 'ativo');
  const usados = new Set(ativos.flatMap((tipo) => tipo.campos.map(({ campoId }) => campoId)));
  const ligadas = new Set(ativos.flatMap((tipo) => tipo.capacidades));

  const comumPeloNome = new Map(GRUPOS_COMUNS.map((grupo) => [normalizarTexto(grupo), grupo]));
  const nosComuns = new Map<string, ColunaDosAtivos[]>(GRUPOS_COMUNS.map((grupo) => [grupo, []]));
  const daOrganizacao = new Map<string, ColunaDosAtivos[]>();
  const semGrupo: ColunaDosAtivos[] = [];
  for (const campo of campos) {
    if (campo.situacao !== 'ativo' || !usados.has(campo.id)) continue;
    if (campo.restrito && !verRestritos) continue;
    const nomeDoGrupo = campo.grupo?.trim() ? campo.grupo.trim() : null;
    const grupoComum = nomeDoGrupo ? comumPeloNome.get(normalizarTexto(nomeDoGrupo)) : undefined;
    const coluna = doCampo(
      campo.id,
      campo.rotulo,
      grupoComum ?? nomeDoGrupo ?? GRUPO_SEM_NOME,
      { tipo: campo.tipo, configuracao: campo.configuracao },
      'organizacao',
      campo.restrito,
    );
    if (grupoComum) nosComuns.get(grupoComum)?.push(coluna);
    else if (nomeDoGrupo)
      daOrganizacao.set(nomeDoGrupo, [...(daOrganizacao.get(nomeDoGrupo) ?? []), coluna]);
    else semGrupo.push(coluna);
  }

  /** A capacidade de cada coluna que vem de uma, pela chave da coluna. */
  const capacidadeDaColuna = new Map<string, string>();
  const dasCapacidades = capacidades
    .filter((capacidade) => ligadas.has(capacidade.chave))
    .flatMap((capacidade) => {
      const daCapacidade = [
        ...capacidade.campos.map((campo) =>
          doCampo(campo.chave, campo.rotulo, capacidade.nome, campo, 'capacidade'),
        ),
        ...(capacidade.colunas ?? []).map((coluna) => coletada(coluna, capacidade.nome)),
      ];
      for (const coluna of daCapacidade) capacidadeDaColuna.set(coluna.chave, capacidade.chave);
      return daCapacidade;
    });

  const deSempre = [
    doAtivo(COLUNA_PRINCIPAL_DOS_ATIVOS, 'Ativo', 'Identificação', 'texto', {
      principal: true,
      largura: 280,
    }),
    doAtivo('ativo.tipo', 'Tipo', 'Identificação', 'escolha'),
    doAtivo('ativo.modelo', 'Modelo', 'Identificação', 'escolha', {
      podeFicarVazia: true,
      largura: 200,
    }),
    ...comum('Identificação'),
    ...(nosComuns.get('Identificação') ?? []),
    doAtivo('ativo.situacao', 'Situação', 'Uso', 'situacao', { largura: 140 }),
    ...comum('Uso'),
    ...(nosComuns.get('Uso') ?? []),
    ...[...daOrganizacao.values()].flat(),
    ...semGrupo,
    ...dasCapacidades,
    ...comum('Administrativo'),
    ...(nosComuns.get('Administrativo') ?? []),
    doAtivo('ativo.criado-em', 'Cadastrado em', GRUPO_DO_REGISTRO, 'momento', { mono: true }),
    doAtivo('ativo.atualizado-em', 'Atualizado em', GRUPO_DO_REGISTRO, 'momento', { mono: true }),
  ];
  if (tiposFiltrados.length === 0) return deSempre;

  const filtrados = new Set(tiposFiltrados);
  const dosFiltrados = ativos.filter((tipo) => tipo.id !== undefined && filtrados.has(tipo.id));
  const camposDosFiltrados = new Set(
    dosFiltrados.flatMap((tipo) => tipo.campos.map(({ campoId }) => campoId)),
  );
  const capacidadesDosFiltrados = new Set(dosFiltrados.flatMap((tipo) => tipo.capacidades));
  const gruposComuns = new Set<string>([...GRUPOS_COMUNS, GRUPO_DO_REGISTRO]);
  const dosTipos: ColunaDosAtivos[] = [];
  const comuns: ColunaDosAtivos[] = [];
  const dosOutrosTipos: ColunaDosAtivos[] = [];
  for (const coluna of deSempre) {
    // As colunas do ativo e dos campos comuns valem para todo tipo.
    const doFiltro =
      coluna.origem === 'organizacao'
        ? camposDosFiltrados.has(coluna.chave)
        : coluna.origem === 'capacidade'
          ? capacidadesDosFiltrados.has(capacidadeDaColuna.get(coluna.chave) ?? '')
          : true;
    if (!doFiltro) dosOutrosTipos.push({ ...coluna, grupo: GRUPO_DOS_OUTROS_TIPOS });
    else if (gruposComuns.has(coluna.grupo)) comuns.push(coluna);
    else dosTipos.push(coluna);
  }
  return [...dosTipos, ...comuns, ...dosOutrosTipos];
}
