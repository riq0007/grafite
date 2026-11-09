// Os consumíveis na API (spec consumiveis; change p4b-consumiveis, design, decisões 1, 2 e 4): os
// dados conferidos pelo domínio, com a recusa no campo, o código único pelo banco, com a mensagem no
// campo dele, as ligações com os fornecedores e os modelos, conferidas só no que entra de novo, e a
// visão que a auditoria guarda, com os fornecedores e os modelos pelo nome.
import {
  consumiveis,
  consumiveisDosModelos,
  fornecedores,
  fornecedoresDosConsumiveis,
  modelos,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  codigoNormalizado,
  type DadosDoConsumivel,
  limparConsumivel,
  MENSAGEM_DO_CODIGO_REPETIDO,
  MENSAGEM_DO_FORNECEDOR_INATIVO,
  MENSAGEM_DO_MODELO_INATIVO,
  MENSAGEM_DO_MODELO_SEM_A_CAPACIDADE,
  normalizarTexto,
  type TipoDeConsumivel,
  validarConsumivel,
} from '@grafite/domain';
import { and, asc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
import { violouUnicidade } from '../banco.ts';
import { contendo } from '../busca.ts';
import { conflito, dadosInvalidos, naoEncontrado } from '../problemas.ts';
import { CAPACIDADE_DOS_CONSUMIVEIS } from './compativeis.ts';

/**
 * A busca dos consumíveis: o nome, sem diferenciar acento e maiúsculas, ou o código, sem diferenciar
 * maiúsculas, espaços e hífens. Sem texto, não filtra nada.
 */
export function pelaBuscaDoConsumivel(busca: string | undefined): SQL | undefined {
  const texto = busca?.trim() ?? '';
  if (texto === '') return undefined;
  const condicoes = [sql`${consumiveis.nomeNormalizado} like ${contendo(normalizarTexto(texto))}`];
  const doCodigo = codigoNormalizado(texto);
  if (doCodigo !== '') {
    condicoes.push(sql`${consumiveis.codigoNormalizado} like ${contendo(doCodigo)}`);
  }
  return or(...condicoes);
}

export type LinhaDoConsumivel = typeof consumiveis.$inferSelect;

export interface FornecedorDoConsumivel {
  id: string;
  nome: string;
  situacao: 'ativo' | 'inativo';
}

export interface ModeloDoConsumivel {
  id: string;
  fabricante: string;
  nome: string;
  situacao: 'ativo' | 'inativo';
  tipo: { id: string; nome: string };
}

export interface LigacoesDoConsumivel {
  fornecedores: FornecedorDoConsumivel[];
  modelos: ModeloDoConsumivel[];
}

/**
 * Os dados conferidos pelo domínio, prontos para gravar: as colunas do consumível, com o código e o
 * nome normalizados, e as listas sem os repetidos. A recusa sai no campo dela.
 */
export function dadosConferidos(dados: DadosDoConsumivel) {
  const erros = validarConsumivel(dados);
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros as Record<string, string>);
  const limpos = limparConsumivel(dados);
  return {
    colunas: {
      codigo: limpos.codigo,
      codigoNormalizado: codigoNormalizado(limpos.codigo),
      nome: limpos.nome,
      nomeNormalizado: limpos.nome === null ? null : normalizarTexto(limpos.nome),
      // O domínio já recusou o tipo vazio.
      tipo: limpos.tipo as TipoDeConsumivel,
      cor: limpos.cor,
      rendimento: limpos.rendimento,
    },
    fornecedores: limpos.fornecedores,
    modelos: limpos.modelos,
  };
}

/** Grava, trocando a recusa da unicidade do código pela mensagem no campo. */
export async function semConsumivelRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'consumiveis_codigo_unico')) {
      throw conflito(MENSAGEM_DO_CODIGO_REPETIDO, { codigo: MENSAGEM_DO_CODIGO_REPETIDO });
    }
    throw erro;
  }
}

/** O consumível da organização do contexto, travado para a mudança; 404 sem ele. */
export async function lerConsumivel(tx: Transacao, id: string): Promise<LinhaDoConsumivel> {
  const [consumivel] = await tx
    .select()
    .from(consumiveis)
    .where(eq(consumiveis.id, id))
    .for('update');
  if (!consumivel) throw naoEncontrado('Consumível não encontrado.');
  return consumivel;
}

/**
 * Os fornecedores e os modelos do consumível, pelo nome, com a situação, e o tipo de cada modelo:
 * os fornecedores pelo nome, e os modelos pelo fabricante e pelo nome.
 */
export async function ligacoesDo(
  tx: Transacao,
  consumivelId: string,
): Promise<LigacoesDoConsumivel> {
  const dosFornecedores = await tx
    .select({ id: fornecedores.id, nome: fornecedores.nome, situacao: fornecedores.situacao })
    .from(fornecedoresDosConsumiveis)
    .innerJoin(fornecedores, eq(fornecedores.id, fornecedoresDosConsumiveis.fornecedorId))
    .where(eq(fornecedoresDosConsumiveis.consumivelId, consumivelId))
    .orderBy(asc(fornecedores.nomeNormalizado), asc(fornecedores.id));
  const dosModelos = await tx
    .select({
      id: modelos.id,
      fabricante: modelos.fabricante,
      nome: modelos.nome,
      situacao: modelos.situacao,
      tipoId: tiposDeAtivo.id,
      tipoNome: tiposDeAtivo.nome,
    })
    .from(consumiveisDosModelos)
    .innerJoin(modelos, eq(modelos.id, consumiveisDosModelos.modeloId))
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, modelos.tipoId))
    .where(eq(consumiveisDosModelos.consumivelId, consumivelId))
    .orderBy(asc(modelos.fabricanteNormalizado), asc(modelos.nomeNormalizado), asc(modelos.id));
  return {
    fornecedores: dosFornecedores,
    modelos: dosModelos.map(({ tipoId, tipoNome, ...modelo }) => ({
      ...modelo,
      tipo: { id: tipoId, nome: tipoNome },
    })),
  };
}

/** Os que entram de novo: os pedidos que o consumível ainda não tem. */
const novos = (pedidos: readonly string[], atuais: readonly { id: string }[]) =>
  pedidos.filter((id) => !atuais.some((atual) => atual.id === id));

/**
 * Confere os fornecedores e os modelos que entram de novo: que existem na organização e estão
 * ativos, e, no modelo, que o tipo dele liga a capacidade dos consumíveis compatíveis. Os que o
 * consumível já tinha ficam, mesmo inativos ou de um tipo que desligou a capacidade.
 */
export async function conferirLigacoes(
  tx: Transacao,
  pedidos: { fornecedores: readonly string[]; modelos: readonly string[] },
  atuais: LigacoesDoConsumivel,
): Promise<void> {
  const fornecedoresNovos = novos(pedidos.fornecedores, atuais.fornecedores);
  if (fornecedoresNovos.length > 0) {
    const encontrados = await tx
      .select({ situacao: fornecedores.situacao })
      .from(fornecedores)
      .where(inArray(fornecedores.id, fornecedoresNovos));
    if (encontrados.length < fornecedoresNovos.length) {
      throw dadosInvalidos({ fornecedores: 'Fornecedor não encontrado.' });
    }
    if (encontrados.some(({ situacao }) => situacao !== 'ativo')) {
      throw dadosInvalidos({ fornecedores: MENSAGEM_DO_FORNECEDOR_INATIVO });
    }
  }
  const modelosNovos = novos(pedidos.modelos, atuais.modelos);
  if (modelosNovos.length > 0) {
    const encontrados = await tx
      .select({ situacao: modelos.situacao, capacidades: tiposDeAtivo.capacidades })
      .from(modelos)
      .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, modelos.tipoId))
      .where(inArray(modelos.id, modelosNovos));
    if (encontrados.length < modelosNovos.length) {
      throw dadosInvalidos({ modelos: 'Modelo não encontrado.' });
    }
    if (encontrados.some(({ situacao }) => situacao !== 'ativo')) {
      throw dadosInvalidos({ modelos: MENSAGEM_DO_MODELO_INATIVO });
    }
    if (encontrados.some(({ capacidades }) => !capacidades.includes(CAPACIDADE_DOS_CONSUMIVEIS))) {
      throw dadosInvalidos({ modelos: MENSAGEM_DO_MODELO_SEM_A_CAPACIDADE });
    }
  }
}

/** Grava as listas pedidas: tira o que saiu e inclui o que entrou. */
export async function gravarLigacoes(
  tx: Transacao,
  { orgId, consumivelId }: { orgId: string; consumivelId: string },
  pedidos: { fornecedores: readonly string[]; modelos: readonly string[] },
  atuais: LigacoesDoConsumivel,
): Promise<void> {
  const fornecedoresQueSairam = atuais.fornecedores
    .map(({ id }) => id)
    .filter((id) => !pedidos.fornecedores.includes(id));
  if (fornecedoresQueSairam.length > 0) {
    await tx
      .delete(fornecedoresDosConsumiveis)
      .where(
        and(
          eq(fornecedoresDosConsumiveis.consumivelId, consumivelId),
          inArray(fornecedoresDosConsumiveis.fornecedorId, fornecedoresQueSairam),
        ),
      );
  }
  const fornecedoresQueEntraram = novos(pedidos.fornecedores, atuais.fornecedores);
  if (fornecedoresQueEntraram.length > 0) {
    await tx
      .insert(fornecedoresDosConsumiveis)
      .values(
        fornecedoresQueEntraram.map((fornecedorId) => ({ orgId, consumivelId, fornecedorId })),
      );
  }
  const modelosQueSairam = atuais.modelos
    .map(({ id }) => id)
    .filter((id) => !pedidos.modelos.includes(id));
  if (modelosQueSairam.length > 0) {
    await tx
      .delete(consumiveisDosModelos)
      .where(
        and(
          eq(consumiveisDosModelos.consumivelId, consumivelId),
          inArray(consumiveisDosModelos.modeloId, modelosQueSairam),
        ),
      );
  }
  const modelosQueEntraram = novos(pedidos.modelos, atuais.modelos);
  if (modelosQueEntraram.length > 0) {
    await tx
      .insert(consumiveisDosModelos)
      .values(modelosQueEntraram.map((modeloId) => ({ orgId, consumivelId, modeloId })));
  }
}

/** As listas pedidas são as mesmas que o consumível já tem, em qualquer ordem. */
export const mesmasLigacoes = (
  pedidos: { fornecedores: readonly string[]; modelos: readonly string[] },
  atuais: LigacoesDoConsumivel,
) =>
  pedidos.fornecedores.length === atuais.fornecedores.length &&
  novos(pedidos.fornecedores, atuais.fornecedores).length === 0 &&
  pedidos.modelos.length === atuais.modelos.length &&
  novos(pedidos.modelos, atuais.modelos).length === 0;

/**
 * O que a auditoria guarda do consumível: os fornecedores e os modelos pelo nome. O código vai como
 * "codigoDoFabricante", porque a chave "codigo" é recusada, por ser a de um código de verificação.
 */
export const visaoDoConsumivel = (
  consumivel: LinhaDoConsumivel,
  ligacoes: LigacoesDoConsumivel,
) => ({
  codigoDoFabricante: consumivel.codigo,
  nome: consumivel.nome,
  tipo: consumivel.tipo,
  cor: consumivel.cor,
  rendimento: consumivel.rendimento,
  fornecedores: ligacoes.fornecedores.map(({ nome }) => nome),
  modelos: ligacoes.modelos.map(({ fabricante, nome }) => `${fabricante} ${nome}`),
  situacao: consumivel.situacao,
});
