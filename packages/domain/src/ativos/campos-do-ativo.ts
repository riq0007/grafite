// Os campos comuns a todo ativo (spec cadastro-de-ativos; design do P1b, decisões 2 e 11): os dados
// de identificação, de uso e administrativos, como o `AssetProfile` do PMG, com a chave fixa no
// código. Os que o banco garante ou filtra ficam em colunas; os outros, no JSONB dos valores. Todos
// têm o estado guardado pela chave, como os campos da organização.
import type {
  ConfiguracaoDoCampo,
  OpcaoDaLista,
  TipoDeCampo,
  ValorDeCampo,
} from '../campos/tipos.ts';
import { normalizarTexto } from '../texto.ts';
import { CAPACIDADES, type PoliticaDeEscrita } from './catalogo.ts';

/** A situação de uso de um ativo ativo, uma lista fixa; o ativo inativo mostra "Inativo". */
export const USOS_DO_ATIVO = [
  { id: 'em-uso', rotulo: 'Em uso', situacao: 'ativa' },
  { id: 'em-estoque', rotulo: 'Em estoque', situacao: 'ativa' },
  { id: 'em-manutencao', rotulo: 'Em manutenção', situacao: 'ativa' },
] as const satisfies readonly OpcaoDaLista[];

export type UsoDoAtivo = (typeof USOS_DO_ATIVO)[number]['id'];

/** O ativo novo começa em uso. */
export const USO_PADRAO: UsoDoAtivo = 'em-uso';

export const PROPRIEDADES_DO_ATIVO = [
  { id: 'proprio', rotulo: 'Próprio', situacao: 'ativa' },
  { id: 'alugado', rotulo: 'Alugado', situacao: 'ativa' },
  { id: 'comodato', rotulo: 'Comodato', situacao: 'ativa' },
] as const satisfies readonly OpcaoDaLista[];

export const GRUPOS_COMUNS = ['Identificação', 'Uso', 'Administrativo'] as const;
export type GrupoComum = (typeof GRUPOS_COMUNS)[number];

/** As colunas da tabela `ativos` que guardam um campo comum, pelo nome no Drizzle. */
export type ColunaDoCampoComum =
  | 'nome'
  | 'patrimonio'
  | 'serie'
  | 'hostname'
  | 'uso'
  | 'localId'
  | 'responsavelId';

/** Um campo comum a todo ativo, com a chave fixa. */
export interface CampoComum {
  chave: `ativo.${string}`;
  rotulo: string;
  tipo: TipoDeCampo;
  grupo: GrupoComum;
  configuracao: ConfiguracaoDoCampo;
  escrita: PoliticaDeEscrita;
  /** A coluna onde o valor fica; sem ela, o valor fica no JSONB dos valores. */
  coluna?: ColunaDoCampoComum;
  /** O valor do ativo novo, sem um pedido. */
  padrao?: ValorDeCampo;
}

const comum = (
  chave: CampoComum['chave'],
  rotulo: string,
  tipo: TipoDeCampo,
  grupo: GrupoComum,
  extras: Partial<Pick<CampoComum, 'configuracao' | 'coluna' | 'padrao'>> = {},
): CampoComum => ({
  chave,
  rotulo,
  tipo,
  grupo,
  configuracao: {},
  escrita: 'automatica',
  ...extras,
});

export const CAMPOS_DO_ATIVO: readonly CampoComum[] = [
  comum('ativo.nome', 'Nome', 'texto', 'Identificação', { coluna: 'nome' }),
  comum('ativo.patrimonio', 'Patrimônio', 'texto', 'Identificação', { coluna: 'patrimonio' }),
  comum('ativo.serie', 'Número de série', 'texto', 'Identificação', { coluna: 'serie' }),
  comum('ativo.hostname', 'Hostname', 'texto', 'Identificação', { coluna: 'hostname' }),
  comum('ativo.uso', 'Situação de uso', 'lista', 'Uso', {
    coluna: 'uso',
    configuracao: { opcoes: [...USOS_DO_ATIVO] },
    padrao: USO_PADRAO,
  }),
  comum('ativo.local', 'Local', 'local', 'Uso', { coluna: 'localId' }),
  comum('ativo.responsavel', 'Responsável', 'pessoa', 'Uso', { coluna: 'responsavelId' }),
  comum('ativo.fornecedor', 'Fornecedor', 'fornecedor', 'Administrativo'),
  comum('ativo.nota-fiscal', 'Nota fiscal', 'texto', 'Administrativo'),
  comum('ativo.data-de-compra', 'Data de compra', 'data', 'Administrativo'),
  comum('ativo.valor-de-compra', 'Valor de compra', 'moeda', 'Administrativo'),
  comum('ativo.garantia', 'Garantia até', 'data', 'Administrativo'),
  comum('ativo.propriedade', 'Propriedade', 'lista', 'Administrativo', {
    configuracao: { opcoes: [...PROPRIEDADES_DO_ATIVO] },
  }),
  comum('ativo.contrato', 'Contrato', 'texto', 'Administrativo'),
  comum('ativo.custo-mensal', 'Custo mensal', 'moeda', 'Administrativo'),
  comum('ativo.centro-de-custo', 'Centro de custo', 'texto', 'Administrativo'),
  comum('ativo.vida-util', 'Vida útil (meses)', 'inteiro', 'Administrativo', {
    configuracao: { minimo: 0, maximo: 600 },
  }),
];

/** A chave do estado do modelo do ativo, que não é um campo, mas tem origem e trava. */
export const CHAVE_DO_MODELO = 'ativo.modelo';

export function campoComumDa(chave: string): CampoComum | undefined {
  return CAMPOS_DO_ATIVO.find((campo) => campo.chave === chave);
}

/**
 * O nome que o ativo mostra: o nome dele, o fabricante e o modelo, ou o tipo. O patrimônio vai ao
 * lado, nas telas, para distinguir os ativos do mesmo modelo.
 */
export function rotuloDoAtivo({
  nome,
  modelo,
  tipo,
}: {
  nome: string | null;
  modelo: { fabricante: string; nome: string } | null;
  tipo: { nome: string };
}): string {
  if (nome && nome.trim() !== '') return nome.trim();
  if (modelo) return `${modelo.fabricante} ${modelo.nome}`;
  return tipo.nome;
}

/**
 * O motivo de recusar o rótulo de um campo da organização que repete o de um campo comum ou o de
 * um campo de capacidade, sem diferenciar acento e maiúsculas; `null` quando ele está livre.
 */
export function rotuloReservado(rotulo: string): string | null {
  const pedido = normalizarTexto(rotulo);
  if (CAMPOS_DO_ATIVO.some((campo) => normalizarTexto(campo.rotulo) === pedido)) {
    return 'Este rótulo é de um campo que todo ativo já tem.';
  }
  const capacidade = CAPACIDADES.find((candidata) =>
    candidata.campos.some((campo) => normalizarTexto(campo.rotulo) === pedido),
  );
  return capacidade ? `Este rótulo é de um campo da capacidade ${capacidade.nome}.` : null;
}
