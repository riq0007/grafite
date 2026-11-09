// O rascunho do cadastro do ativo (spec cadastro-de-ativos, "Rascunho do cadastro do ativo"; change
// cadastro-em-etapas, design, decisão 9): o estado inteiro do cadastro é o próprio rascunho. Ao
// retomar, fica só o que o tipo ainda usa e a conta ainda edita, na forma de cada campo. Funções
// puras: o cadastro e o Novo ativo as usam.
import type { components } from '@grafite/api-client';
import {
  type CampoNoCatalogo,
  CHAVE_DO_MODELO,
  campoDeArquivo,
  camposDoAtivo,
  type DefinicaoNoAtivo,
} from '@grafite/domain';
import type { CampoDaOrganizacao, TipoDeAtivo } from '../consultas.ts';
import { type EntradaDoCampo, entradaInicial } from './CampoDoAtivo.tsx';
import { gruposDoCadastro } from './etapas.ts';

export type ConteudoDoRascunho = components['schemas']['ConteudoDoRascunhoDoAtivo'];
export type RascunhoDoAtivo = components['schemas']['RascunhoDoAtivo'];

/** O estado do cadastro em etapas, que é o que o rascunho guarda. */
export interface EstadoDoCadastro {
  tipoId: string | null;
  modeloId: string | null;
  entradas: Record<string, EntradaDoCampo>;
  travas: Record<string, boolean>;
  /** Os nomes das pessoas, dos locais e dos ativos escolhidos, pelo id. */
  nomes: Record<string, string>;
  /** A chave da etapa aberta. */
  etapa: string;
  /** A origem de onde o cadastro foi aberto, como o parâmetro da tela. */
  origem: string | null;
}

/** O que a origem da tabela preenche no cadastro (change relacoes-vivas, decisão 3). */
export interface PreenchidoPelaOrigem {
  valores: Record<string, string>;
  nomes: Record<string, string>;
  modeloId?: string;
  tipoId?: string;
}

export const CADASTRO_VAZIO: EstadoDoCadastro = {
  tipoId: null,
  modeloId: null,
  entradas: {},
  travas: {},
  nomes: {},
  etapa: 'tipo',
  origem: null,
};

/** Os campos que o cadastro preenche: sem os de arquivo, que vão depois, e sem os restritos que a
 * conta não edita. */
function camposDoCadastro(
  tipo: TipoDeAtivo,
  campos: readonly CampoDaOrganizacao[],
  editarRestritos: boolean,
) {
  const definicoes = camposDoAtivo({
    tipo: { capacidades: tipo.capacidades, campos: tipo.campos },
    campos: campos as readonly CampoNoCatalogo[],
  });
  const editaveis = [...definicoes.porChave.values()].filter(
    (definicao) => !campoDeArquivo(definicao.tipo) && (editarRestritos || !definicao.restrito),
  );
  return { definicoes, editaveis };
}

/** A entrada guardada, se ela tem a forma do campo: a lista para a múltipla, o texto para o resto. */
function entradaNaForma(
  definicao: DefinicaoNoAtivo,
  guardada: unknown,
): EntradaDoCampo | undefined {
  if (definicao.tipo === 'lista-multipla') {
    return Array.isArray(guardada) && guardada.every((item) => typeof item === 'string')
      ? guardada
      : undefined;
  }
  return typeof guardada === 'string' || guardada === null ? guardada : undefined;
}

/** Os ids citados pelas entradas: os nomes dos outros saem. */
function nomesCitados(entradas: Record<string, EntradaDoCampo>, nomes: Record<string, string>) {
  const citados = new Set(Object.values(entradas).flatMap((entrada) => entrada ?? []));
  return Object.fromEntries(Object.entries(nomes).filter(([id]) => citados.has(id)));
}

/** O cadastro novo de um tipo: os valores padrão e o que a origem preenche. */
export function estadoDoTipo({
  tipo,
  campos,
  preenchido,
  origem = null,
  editarRestritos = false,
}: {
  tipo: TipoDeAtivo;
  campos: readonly CampoDaOrganizacao[];
  preenchido?: PreenchidoPelaOrigem;
  origem?: string | null;
  editarRestritos?: boolean;
}): EstadoDoCadastro {
  const { editaveis } = camposDoCadastro(tipo, campos, editarRestritos);
  const entradas = Object.fromEntries(
    editaveis.map((definicao) => [
      definicao.chave,
      entradaInicial(definicao, preenchido?.valores[definicao.chave] ?? definicao.padrao),
    ]),
  );
  return {
    ...CADASTRO_VAZIO,
    tipoId: tipo.id,
    modeloId: preenchido?.modeloId ?? null,
    entradas,
    nomes: nomesCitados(entradas, preenchido?.nomes ?? {}),
    origem,
  };
}

/**
 * O cadastro retomado do rascunho. Sem o tipo, que pode ter sido inativado, ele volta sem os
 * valores. Com o tipo, ficam os valores dos campos que ele ainda usa e que a conta edita, na forma
 * do campo, as travas deles e do modelo e os nomes que eles citam; a etapa que não existe mais abre
 * a do Tipo. O modelo é conferido depois, pela leitura dele.
 */
export function retomarRascunho({
  rascunho,
  tipos,
  campos,
  editarRestritos,
}: {
  rascunho: ConteudoDoRascunho;
  tipos: readonly TipoDeAtivo[];
  campos: readonly CampoDaOrganizacao[];
  editarRestritos: boolean;
}): EstadoDoCadastro {
  const tipo = tipos.find(
    (candidato) => candidato.id === rascunho.tipoId && candidato.situacao === 'ativo',
  );
  if (!tipo) return { ...CADASTRO_VAZIO, origem: rascunho.origem };
  const { definicoes, editaveis } = camposDoCadastro(tipo, campos, editarRestritos);
  const entradas = Object.fromEntries(
    editaveis.map((definicao) => [
      definicao.chave,
      entradaNaForma(definicao, rascunho.valores[definicao.chave]) ??
        entradaInicial(definicao, definicao.padrao),
    ]),
  );
  const chaves = new Set([...editaveis.map((definicao) => definicao.chave), CHAVE_DO_MODELO]);
  const etapas = new Set([
    'tipo',
    'modelo',
    ...gruposDoCadastro(definicoes, editarRestritos).map((grupo) => grupo.chave),
  ]);
  return {
    tipoId: tipo.id,
    modeloId: rascunho.modeloId,
    entradas,
    travas: Object.fromEntries(
      Object.entries(rascunho.travas).filter(([chave]) => chaves.has(chave)),
    ),
    nomes: nomesCitados(entradas, rascunho.nomes),
    etapa: rascunho.etapa && etapas.has(rascunho.etapa) ? rascunho.etapa : 'tipo',
    origem: rascunho.origem,
  };
}

/**
 * O que fazer ao abrir o Novo ativo: sem rascunho, começar; sem origem, ou com a mesma do
 * rascunho, retomar; com outra origem, perguntar se a pessoa continua o começado.
 */
export function decidirPelaOrigem({
  rascunho,
  origem,
}: {
  rascunho: ConteudoDoRascunho | null;
  origem: string | null;
}): 'comecar' | 'retomar' | 'perguntar' {
  if (!rascunho) return 'comecar';
  if (origem === null || origem === rascunho.origem) return 'retomar';
  return 'perguntar';
}

/** O estado do cadastro na forma em que a API guarda o rascunho. */
export const conteudoDoRascunho = (estado: EstadoDoCadastro): ConteudoDoRascunho => ({
  tipoId: estado.tipoId,
  modeloId: estado.modeloId,
  valores: estado.entradas,
  travas: estado.travas,
  nomes: estado.nomes,
  etapa: estado.etapa,
  origem: estado.origem,
});
