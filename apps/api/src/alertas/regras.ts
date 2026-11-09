// As regras de alerta no banco (spec alertas, "Regras de alerta"; change p3a-regras-e-alertas,
// design, decisões 2 e 3): a linha como os dados do domínio, o que a auditoria guarda, o registro do
// escopo conferido no banco (ativo e da organização) e o nome dele para a tela. As exceções (change
// regras-indicadores-e-tarefas, design, decisão 1) têm o lugar conferido e nomeado do mesmo jeito.
import {
  ativos,
  locais,
  modelos,
  type regrasDeAlerta,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type DadosDaRegra,
  type EscopoDaRegra,
  type ExcecaoDaRegra,
  MENSAGEM_DO_NOME_REPETIDO,
  MENSAGENS_DO_ESCOPO,
  rotuloDoAtivo,
} from '@grafite/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { violouUnicidade } from '../banco.ts';
import { conflito, dadosInvalidos } from '../problemas.ts';

export type LinhaDaRegra = typeof regrasDeAlerta.$inferSelect;

/** O escopo guardado na linha, como o domínio o entende. */
export const escopoDaLinha = (linha: Pick<LinhaDaRegra, 'escopo' | 'escopoId'>): EscopoDaRegra =>
  linha.escopo === 'organizacao' || linha.escopoId === null
    ? { tipo: 'organizacao', id: null }
    : { tipo: linha.escopo, id: linha.escopoId };

/** As exceções guardadas na linha, que a gravação conferiu. */
export const excecoesDaLinha = (linha: Pick<LinhaDaRegra, 'excecoes'>): ExcecaoDaRegra[] =>
  linha.excecoes as unknown as ExcecaoDaRegra[];

/** A regra da linha, como o domínio e o motor a usam. */
export const dadosDaLinha = (linha: LinhaDaRegra): DadosDaRegra =>
  ({
    nome: linha.nome,
    condicao: linha.condicao,
    parametros: linha.parametros,
    duracao: linha.duracao,
    severidade: linha.severidade,
    escopo: escopoDaLinha(linha),
    excecoes: excecoesDaLinha(linha),
  }) as DadosDaRegra;

/** O que a auditoria guarda de uma regra. */
export const visaoDaRegra = (linha: LinhaDaRegra) => ({
  nome: linha.nome,
  condicao: linha.condicao,
  parametros: linha.parametros,
  duracao: linha.duracao,
  severidade: linha.severidade,
  escopo: escopoDaLinha(linha),
  excecoes: excecoesDaLinha(linha),
  situacao: linha.situacao,
});

/** Se o registro do tipo, do modelo, do ativo ou do local existe e está ativo. */
async function ativoNoBanco(
  tx: Transacao,
  tipo: Exclude<EscopoDaRegra['tipo'], 'organizacao'>,
  id: string,
): Promise<boolean> {
  const tabela = { tipo: tiposDeAtivo, modelo: modelos, ativo: ativos, local: locais }[tipo];
  const [achado] = await tx
    .select({ id: tabela.id })
    .from(tabela)
    .where(and(eq(tabela.id, id), eq(tabela.situacao, 'ativo')));
  return achado !== undefined;
}

/** Confere no banco que o registro do escopo existe e está ativo. */
export async function conferirEscopoNoBanco(tx: Transacao, escopo: EscopoDaRegra): Promise<void> {
  if (escopo.tipo === 'organizacao') return;
  if (!(await ativoNoBanco(tx, escopo.tipo, escopo.id))) {
    throw dadosInvalidos({ escopo: MENSAGENS_DO_ESCOPO[escopo.tipo] });
  }
}

/** Confere no banco o lugar de cada exceção, com a mensagem na exceção. */
export async function conferirExcecoesNoBanco(
  tx: Transacao,
  excecoes: readonly ExcecaoDaRegra[],
): Promise<void> {
  const erros: Record<string, string> = {};
  for (const [posicao, { lugar }] of excecoes.entries()) {
    if (!(await ativoNoBanco(tx, lugar.tipo, lugar.id))) {
      erros[`excecoes.${posicao}`] = MENSAGENS_DO_ESCOPO[lugar.tipo];
    }
  }
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);
}

/** O nome do registro do escopo e do lugar das exceções de cada regra, pelo id, para a tela. */
export async function nomesDosEscopos(
  tx: Transacao,
  linhas: readonly Pick<LinhaDaRegra, 'escopo' | 'escopoId' | 'excecoes'>[],
): Promise<Map<string, string>> {
  const ids = (tipo: LinhaDaRegra['escopo']) => [
    ...new Set(
      linhas.flatMap((linha) => [
        ...(linha.escopo === tipo && linha.escopoId ? [linha.escopoId] : []),
        ...excecoesDaLinha(linha).flatMap(({ lugar }) => (lugar.tipo === tipo ? [lugar.id] : [])),
      ]),
    ),
  ];
  const nomes = new Map<string, string>();
  const doTipo = ids('tipo');
  if (doTipo.length > 0) {
    for (const tipo of await tx
      .select({ id: tiposDeAtivo.id, nome: tiposDeAtivo.nome })
      .from(tiposDeAtivo)
      .where(inArray(tiposDeAtivo.id, doTipo))) {
      nomes.set(tipo.id, tipo.nome);
    }
  }
  const doModelo = ids('modelo');
  if (doModelo.length > 0) {
    for (const modelo of await tx
      .select({ id: modelos.id, fabricante: modelos.fabricante, nome: modelos.nome })
      .from(modelos)
      .where(inArray(modelos.id, doModelo))) {
      nomes.set(modelo.id, `${modelo.fabricante} ${modelo.nome}`);
    }
  }
  const doAtivo = ids('ativo');
  if (doAtivo.length > 0) {
    for (const ativo of await tx
      .select({
        id: ativos.id,
        nome: ativos.nome,
        tipo: tiposDeAtivo.nome,
        fabricante: modelos.fabricante,
        modelo: modelos.nome,
      })
      .from(ativos)
      .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
      .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
      .where(inArray(ativos.id, doAtivo))) {
      nomes.set(
        ativo.id,
        rotuloDoAtivo({
          nome: ativo.nome,
          modelo:
            ativo.fabricante !== null && ativo.modelo !== null
              ? { fabricante: ativo.fabricante, nome: ativo.modelo }
              : null,
          tipo: { nome: ativo.tipo },
        }),
      );
    }
  }
  const doLocal = ids('local');
  if (doLocal.length > 0) {
    for (const local of await tx
      .select({ id: locais.id, nome: locais.nome })
      .from(locais)
      .where(inArray(locais.id, doLocal))) {
      nomes.set(local.id, local.nome);
    }
  }
  return nomes;
}

/** Grava a regra, trocando o nome repetido pela recusa no campo do nome. */
export async function semNomeDeRegraRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'regras_de_alerta_nome_unico')) {
      throw conflito(MENSAGEM_DO_NOME_REPETIDO, { nome: MENSAGEM_DO_NOME_REPETIDO });
    }
    throw erro;
  }
}
