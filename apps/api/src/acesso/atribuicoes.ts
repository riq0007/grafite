// As atribuições de perfil e as participações em grupos (spec perfis-e-grupos; design do F2b,
// decisão 4): nunca se apagam, e encerrar grava o fim. Cada mudança fica na auditoria no registro de
// quem recebe o perfil, a conta ou o grupo, para aparecer no histórico dele, com o nome do perfil e
// do grupo e o caminho do local, e nunca com o nome ou o usuário da pessoa.
import { atribuicoes, grupos, membrosDoGrupo, perfis, type Transacao } from '@grafite/db';
import type { ArvoreDeLocais } from '@grafite/domain';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { type Ator, type EventoDeAuditoria, registrarNaAuditoria } from '../auditoria.ts';

export interface ContextoDaMudanca {
  ator: Ator;
  origem?: EventoDeAuditoria['origem'];
  momento: Date;
  arvore: ArvoreDeLocais;
}

export interface AtribuicaoLida {
  id: string;
  perfilId: string;
  perfil: string;
  contaId: string | null;
  grupoId: string | null;
  grupo: string | null;
  localId: string | null;
  encerradaEm: Date | null;
}

export const COLUNAS_DA_ATRIBUICAO = {
  id: atribuicoes.id,
  perfilId: atribuicoes.perfilId,
  perfil: perfis.nome,
  contaId: atribuicoes.contaId,
  grupoId: atribuicoes.grupoId,
  grupo: grupos.nome,
  localId: atribuicoes.localId,
  encerradaEm: atribuicoes.encerradaEm,
};

/** As atribuições com o nome do perfil e do grupo, para a auditoria e as fichas. */
export const lerAtribuicoes = (tx: Transacao) =>
  tx
    .select(COLUNAS_DA_ATRIBUICAO)
    .from(atribuicoes)
    .innerJoin(
      perfis,
      and(eq(perfis.orgId, atribuicoes.orgId), eq(perfis.id, atribuicoes.perfilId)),
    )
    .leftJoin(grupos, and(eq(grupos.orgId, atribuicoes.orgId), eq(grupos.id, atribuicoes.grupoId)));

/** O que a auditoria guarda de uma atribuição. */
export function visaoDaAtribuicao(atribuicao: AtribuicaoLida, arvore: ArvoreDeLocais) {
  return {
    perfilId: atribuicao.perfilId,
    perfil: atribuicao.perfil,
    contaId: atribuicao.contaId,
    grupoId: atribuicao.grupoId,
    grupo: atribuicao.grupo,
    localId: atribuicao.localId,
    local: atribuicao.localId === null ? null : arvore.caminho(atribuicao.localId),
    encerradaEm: atribuicao.encerradaEm?.toISOString() ?? null,
  };
}

/** Quem recebe o perfil: o registro da auditoria fica nele. */
export const alvoDaAtribuicao = ({ contaId, grupoId }: AtribuicaoLida) =>
  contaId === null ? { tipo: 'grupo', id: grupoId } : { tipo: 'conta', id: contaId };

/** Encerra as atribuições em vigor que atendem a `onde` e devolve quantas foram. */
export async function encerrarAtribuicoes(
  tx: Transacao,
  onde: SQL,
  { ator, origem, momento, arvore }: ContextoDaMudanca,
): Promise<number> {
  const emVigor = await lerAtribuicoes(tx).where(and(onde, isNull(atribuicoes.encerradaEm)));
  for (const atribuicao of emVigor) {
    await tx
      .update(atribuicoes)
      .set({ encerradaEm: momento })
      .where(eq(atribuicoes.id, atribuicao.id));
    await registrarNaAuditoria(tx, {
      acao: 'atribuicao.encerrada',
      ator,
      alvo: alvoDaAtribuicao(atribuicao),
      antes: visaoDaAtribuicao(atribuicao, arvore),
      depois: visaoDaAtribuicao({ ...atribuicao, encerradaEm: momento }, arvore),
      dados: { atribuicaoId: atribuicao.id },
      origem,
      momento,
    });
  }
  return emVigor.length;
}

/** Encerra as participações em vigor que atendem a `onde` e devolve quantas foram. */
export async function retirarDosGrupos(
  tx: Transacao,
  onde: SQL,
  { ator, origem, momento }: Omit<ContextoDaMudanca, 'arvore'>,
): Promise<number> {
  const emVigor = await tx
    .select({
      id: membrosDoGrupo.id,
      grupoId: membrosDoGrupo.grupoId,
      grupo: grupos.nome,
      contaId: membrosDoGrupo.contaId,
    })
    .from(membrosDoGrupo)
    .innerJoin(
      grupos,
      and(eq(grupos.orgId, membrosDoGrupo.orgId), eq(grupos.id, membrosDoGrupo.grupoId)),
    )
    .where(and(onde, isNull(membrosDoGrupo.encerradaEm)));
  for (const membro of emVigor) {
    await tx
      .update(membrosDoGrupo)
      .set({ encerradaEm: momento })
      .where(eq(membrosDoGrupo.id, membro.id));
    await registrarNaAuditoria(tx, {
      acao: 'membro.retirado',
      ator,
      alvo: { tipo: 'conta', id: membro.contaId },
      dados: { grupoId: membro.grupoId, grupo: membro.grupo },
      origem,
      momento,
    });
  }
  return emVigor.length;
}
