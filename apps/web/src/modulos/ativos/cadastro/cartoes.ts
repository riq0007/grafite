// Os cartões da aba Dados da ficha do ativo (spec cadastro-de-ativos, "Aba Dados em cartões";
// change ficha-em-cartoes, design, decisão 2): a Visão geral, os grupos dos campos na ordem da ficha
// e as capacidades com painel, cada um com o resumo do que tem em texto, com o primeiro cartão do
// tipo no alto (change primeiro-cartao-da-ficha). Funções puras: a ficha as recalcula a cada
// mudança, a partir do que está na tela.
import {
  CHAVE_DO_MODELO,
  campoDeArquivo,
  type DefinicaoNoAtivo,
  type GrupoDoAtivo,
  lerValor,
  mostrarValor,
  PRIORIDADE_DO_PRIMEIRO_CARTAO,
} from '@grafite/domain';
import type { EntradaDoCampo } from './CampoDoAtivo.tsx';
import { preenchida } from './etapas.ts';
import { entradasIguais } from './pedidoDoAtivo.ts';

export const VISAO_GERAL = 'visao-geral';

/** O tom do resumo: o de atenção pinta o que já está escrito, como "Falta: IP". */
export type TomDoResumo = 'normal' | 'atencao';

export interface CartaoDaFicha {
  /** `visao-geral` ou a chave do grupo, como `organizacao:Rede`. */
  chave: string;
  nome: string;
  /** Os campos do cartão que a conta vê; a Visão geral e a capacidade sem campos não têm. */
  campos: DefinicaoNoAtivo[];
  resumo: string;
  tom: TomDoResumo;
}

/** A situação do painel de uma capacidade, em texto, como a da coluna dela na tabela. */
export interface SituacaoDaCapacidade {
  texto: string;
  tom: TomDoResumo;
}

const MAXIMO_DE_VALORES = 2;

/** Os tipos de campo que apontam um registro, pelo id. */
const REGISTROS = new Set(['pessoa', 'local', 'ativo', 'fornecedor']);

/** O valor de uma entrada como a ficha o mostra; vazio, nada. */
function textoDaEntrada(
  definicao: DefinicaoNoAtivo,
  entrada: EntradaDoCampo | undefined,
  nomeDoRegistro: (id: string) => string | undefined,
): string | null {
  if (!preenchida(entrada)) return null;
  // A pessoa, o local e o ativo aparecem pelo nome; sem o nome, ficam fora do resumo.
  if (REGISTROS.has(definicao.tipo)) return nomeDoRegistro(String(entrada)) ?? null;
  const lido = lerValor(definicao, entrada);
  // O valor digitado que o motor ainda recusa aparece como está.
  if (!lido.ok) return Array.isArray(entrada) ? entrada.join(', ') : String(entrada);
  const texto = mostrarValor(definicao, lido.valor, nomeDoRegistro);
  return texto === '' ? null : texto;
}

/** O resumo de um grupo de campos: o que falta, os dois primeiros valores ou "Nada preenchido". */
function resumoDosCampos(
  campos: readonly DefinicaoNoAtivo[],
  entradas: Readonly<Record<string, EntradaDoCampo>>,
  nomeDoRegistro: (id: string) => string | undefined,
): Pick<CartaoDaFicha, 'resumo' | 'tom'> {
  const doResumo = campos.filter((definicao) => !campoDeArquivo(definicao.tipo));
  const faltam = doResumo.filter(
    (definicao) => definicao.obrigatorio && !preenchida(entradas[definicao.chave]),
  );
  const [primeira] = faltam;
  if (primeira) {
    const mais = faltam.length > 1 ? ` e mais ${faltam.length - 1}` : '';
    return { resumo: `Falta: ${primeira.rotulo}${mais}`, tom: 'atencao' };
  }
  const valores = doResumo
    .map((definicao) => textoDaEntrada(definicao, entradas[definicao.chave], nomeDoRegistro))
    .filter((texto): texto is string => texto !== null)
    .slice(0, MAXIMO_DE_VALORES);
  return { resumo: valores.length > 0 ? valores.join(' · ') : 'Nada preenchido', tom: 'normal' };
}

/**
 * A chave do primeiro cartão (change primeiro-cartao-da-ficha, design, decisão 3): o primeiro que a
 * ficha mostra entre o escolhido no tipo, as capacidades da prioridade e a Visão geral. O escolhido
 * pode faltar para a conta, como o backup sem `controlid.ver`.
 */
function chaveDoPrimeiro(chaves: ReadonlySet<string>, escolhido: string | null): string {
  const candidatos = [
    ...(escolhido === null ? [] : [escolhido]),
    ...PRIORIDADE_DO_PRIMEIRO_CARTAO,
  ].map((chave) => (chave === VISAO_GERAL ? chave : `capacidade:${chave}`));
  return candidatos.find((chave) => chaves.has(chave)) ?? VISAO_GERAL;
}

/**
 * Os cartões da ficha: o primeiro cartão do tipo no alto, a Visão geral, com o resumo dos blocos
 * dos módulos, logo depois dele, e os grupos dos campos na ordem da ficha, sem os restritos que a
 * conta não vê. O grupo sem campo visível sai; o da capacidade fica quando ela tem painel, com a
 * situação dele no resumo.
 */
export function cartoesDaFicha({
  grupos,
  entradas,
  verRestritos,
  situacoesDasCapacidades,
  resumoDaVisaoGeral,
  nomeDoRegistro,
  primeiroCartao,
}: {
  grupos: readonly GrupoDoAtivo[];
  entradas: Readonly<Record<string, EntradaDoCampo>>;
  verRestritos: boolean;
  /** A situação do painel de cada capacidade que tem um, pela chave da capacidade. */
  situacoesDasCapacidades: Readonly<Record<string, SituacaoDaCapacidade>>;
  resumoDaVisaoGeral: string;
  nomeDoRegistro: (id: string) => string | undefined;
  /** O primeiro cartão escolhido no tipo: a Visão geral ou uma capacidade; nulo no automático. */
  primeiroCartao: string | null;
}): CartaoDaFicha[] {
  const visaoGeral: CartaoDaFicha = {
    chave: VISAO_GERAL,
    nome: 'Visão geral',
    campos: [],
    resumo: resumoDaVisaoGeral,
    tom: 'normal',
  };
  const dosGrupos = grupos.flatMap((grupo): CartaoDaFicha[] => {
    const campos = grupo.campos.filter((definicao) => verRestritos || !definicao.restrito);
    const capacidade = grupo.chave.startsWith('capacidade:')
      ? grupo.chave.slice('capacidade:'.length)
      : null;
    const situacao = capacidade ? situacoesDasCapacidades[capacidade] : undefined;
    if (situacao) {
      return [
        { chave: grupo.chave, nome: grupo.nome, campos, resumo: situacao.texto, tom: situacao.tom },
      ];
    }
    if (campos.length === 0) return [];
    return [
      {
        chave: grupo.chave,
        nome: grupo.nome,
        campos,
        ...resumoDosCampos(campos, entradas, nomeDoRegistro),
      },
    ];
  });
  const todos = [visaoGeral, ...dosGrupos];
  const primeiro = chaveDoPrimeiro(new Set(todos.map(({ chave }) => chave)), primeiroCartao);
  return [
    ...todos.filter(({ chave }) => chave === primeiro),
    ...todos.filter(({ chave }) => chave !== primeiro),
  ];
}

/** Quantas mudanças da tela ainda não foram salvas: as entradas, as travas e o modelo. */
export function alteracoesNaoSalvas({
  entradas,
  iniciais,
  travas,
  travasIniciais,
  modeloId,
  modeloInicial,
}: {
  entradas: Readonly<Record<string, EntradaDoCampo>>;
  iniciais: Readonly<Record<string, EntradaDoCampo>>;
  travas: Readonly<Record<string, boolean>>;
  travasIniciais: Readonly<Record<string, boolean>>;
  modeloId: string | null;
  modeloInicial: string | null;
}): number {
  const dasEntradas = Object.entries(entradas).filter(
    ([chave, entrada]) => !entradasIguais(entrada, iniciais[chave]),
  ).length;
  const dasTravas = Object.entries(travas).filter(
    ([chave, travado]) => (travasIniciais[chave] ?? false) !== travado,
  ).length;
  return dasEntradas + dasTravas + (modeloId !== modeloInicial ? 1 : 0);
}

export const textoDasAlteracoes = (quantas: number) =>
  quantas === 0
    ? 'Nenhuma alteração'
    : quantas === 1
      ? '1 alteração não salva'
      : `${quantas} alterações não salvas`;

/** O primeiro cartão, na ordem, com um campo recusado; o modelo recusado é da Identificação. */
export function cartaoComRecusa(
  cartoes: readonly CartaoDaFicha[],
  erros: Readonly<Record<string, string>>,
): string | undefined {
  return cartoes.find((cartao) =>
    cartao.chave === 'identificacao' && CHAVE_DO_MODELO in erros
      ? true
      : cartao.campos.some((definicao) => definicao.chave in erros),
  )?.chave;
}
