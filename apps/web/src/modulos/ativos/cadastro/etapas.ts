// As etapas do cadastro do ativo (spec cadastro-de-ativos, "Cadastro do ativo em etapas"; change
// cadastro-em-etapas, design, decisão 2): o Tipo, o Modelo e uma etapa por grupo dos campos, na
// ordem da ficha, cada uma com a situação em texto. Funções puras: o cadastro as recalcula a cada
// mudança.
import {
  type CamposDoAtivo,
  CHAVE_DO_MODELO,
  campoDeArquivo,
  type DefinicaoNoAtivo,
  type GrupoDoAtivo,
} from '@grafite/domain';
import type { EntradaDoCampo } from './CampoDoAtivo.tsx';

export interface EtapaDoCadastro {
  /** `tipo`, `modelo` ou a chave do grupo, como `organizacao:Rede`. */
  chave: string;
  nome: string;
  /** Os campos da etapa; o Tipo e o Modelo não têm. */
  campos: DefinicaoNoAtivo[];
  /** Como a etapa está, em texto: "Falta: IP", "Preenchida", "Opcional" ou o nome escolhido. */
  situacao: string;
  tom: 'normal' | 'atencao';
  /** Por que a etapa ainda não abre. */
  motivo?: string;
}

const ANTES_DO_TIPO = 'Escolha o tipo antes';

/** Os grupos que o cadastro mostra: sem os restritos para quem não os vê, e sem o grupo vazio. */
export function gruposDoCadastro(campos: CamposDoAtivo, verRestritos: boolean): GrupoDoAtivo[] {
  return campos.grupos
    .map((grupo) => ({
      ...grupo,
      campos: grupo.campos.filter((definicao) => verRestritos || !definicao.restrito),
    }))
    .filter((grupo) => grupo.campos.length > 0);
}

/** A entrada tem um valor: o texto com algo além de espaços, ou a lista com algum item. */
export const preenchida = (entrada: EntradaDoCampo | undefined): boolean =>
  Array.isArray(entrada)
    ? entrada.length > 0
    : typeof entrada === 'string' && entrada.trim() !== '';

/** A situação de um grupo pelos campos dele; o de arquivo não conta, porque vai depois. */
function situacaoDoGrupo(
  campos: readonly DefinicaoNoAtivo[],
  entradas: Readonly<Record<string, EntradaDoCampo>>,
): Pick<EtapaDoCadastro, 'situacao' | 'tom'> {
  const doCadastro = campos.filter((definicao) => !campoDeArquivo(definicao.tipo));
  const faltam = doCadastro.filter(
    (definicao) => definicao.obrigatorio && !preenchida(entradas[definicao.chave]),
  );
  const [primeira] = faltam;
  if (primeira) {
    const mais = faltam.length > 1 ? ` e mais ${faltam.length - 1}` : '';
    return { situacao: `Falta: ${primeira.rotulo}${mais}`, tom: 'atencao' };
  }
  const algumaCoisa = doCadastro.some(
    (definicao) => definicao.obrigatorio || preenchida(entradas[definicao.chave]),
  );
  return { situacao: algumaCoisa ? 'Preenchida' : 'Opcional', tom: 'normal' };
}

/**
 * As etapas do cadastro. Sem o tipo, só o Tipo abre: as outras são as dos grupos comuns, com o
 * motivo. Com ele, o Modelo e cada grupo, na ordem da ficha.
 */
export function etapasDoCadastro({
  tipo,
  modelo,
  grupos,
  entradas,
}: {
  tipo: { nome: string } | null;
  modelo: { fabricante: string; nome: string } | null;
  grupos: readonly GrupoDoAtivo[];
  entradas: Readonly<Record<string, EntradaDoCampo>>;
}): EtapaDoCadastro[] {
  if (!tipo) {
    const semTipo = (chave: string, nome: string): EtapaDoCadastro => ({
      chave,
      nome,
      campos: [],
      situacao: '',
      tom: 'normal',
      motivo: ANTES_DO_TIPO,
    });
    return [
      { chave: 'tipo', nome: 'Tipo', campos: [], situacao: 'Falta escolher', tom: 'atencao' },
      semTipo('modelo', 'Modelo'),
      semTipo('identificacao', 'Identificação'),
      semTipo('uso', 'Uso'),
      semTipo('administrativo', 'Administrativo'),
    ];
  }
  return [
    { chave: 'tipo', nome: 'Tipo', campos: [], situacao: tipo.nome, tom: 'normal' },
    {
      chave: 'modelo',
      nome: 'Modelo',
      campos: [],
      situacao: modelo ? `${modelo.fabricante} ${modelo.nome}` : 'Opcional',
      tom: 'normal',
    },
    ...grupos.map((grupo) => ({
      chave: grupo.chave,
      nome: grupo.nome,
      campos: grupo.campos,
      ...situacaoDoGrupo(grupo.campos, entradas),
    })),
  ];
}

export const etapaSeguinte = (etapas: readonly EtapaDoCadastro[], atual: string) =>
  etapas[etapas.findIndex((etapa) => etapa.chave === atual) + 1];

export const etapaAnterior = (etapas: readonly EtapaDoCadastro[], atual: string) => {
  const posicao = etapas.findIndex((etapa) => etapa.chave === atual);
  return posicao > 0 ? etapas[posicao - 1] : undefined;
};

/** A primeira etapa, na ordem da lista, que tem um campo recusado; o modelo recusado é a dele. */
export function etapaComRecusa(
  etapas: readonly EtapaDoCadastro[],
  erros: Readonly<Record<string, string>>,
): string | undefined {
  return etapas.find((etapa) =>
    etapa.chave === 'modelo'
      ? CHAVE_DO_MODELO in erros
      : etapa.campos.some((definicao) => definicao.chave in erros),
  )?.chave;
}
