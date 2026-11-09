// Os segredos na ficha do ativo (spec cadastro-de-ativos, "Segredos na ficha do ativo"; design do
// P6, decisão 7): os ligados ao ativo que a conta vê no cofre, pelo nome, com o tipo e o
// identificador, sem nenhum valor. Eles só vêm com o Cofre ligado e a conta com `cofre.usar` e os
// dois passos ativos; fora disso, a ficha do ativo não tem a seção.
import { organizacoes, segredos, segredosDosAtivos, type Transacao } from '@grafite/db';
import { pode } from '@grafite/domain';
import { and, asc, eq, type SQL, sql } from 'drizzle-orm';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import { alcancadoPor, titularesDaConta } from './titulares.ts';

export interface SegredoNaFichaDoAtivo {
  id: string;
  nome: string;
  tipo: (typeof segredos.$inferSelect)['tipo'];
  identificador: string | null;
  situacao: (typeof segredos.$inferSelect)['situacao'];
}

/** Se a organização da transação tem o módulo Cofre ligado. */
export async function cofreLigadoNaOrganizacao(tx: Transacao): Promise<boolean> {
  const [organizacao] = await tx
    .select({ desligados: organizacoes.modulosDesligados })
    .from(organizacoes)
    .where(eq(organizacoes.id, sql`app.current_org()`));
  return organizacao !== undefined && !organizacao.desligados.includes('cofre');
}

export async function segredosDoAtivo(
  tx: Transacao,
  ativoId: string,
  {
    contaId,
    acesso,
    doisPassosAtivos,
  }: Pick<SessaoDaRequisicao, 'contaId' | 'acesso' | 'doisPassosAtivos'>,
): Promise<SegredoNaFichaDoAtivo[] | undefined> {
  if (!pode(acesso, 'cofre.usar') || !doisPassosAtivos) return undefined;
  if (!(await cofreLigadoNaOrganizacao(tx))) return undefined;
  const condicoes: SQL[] = [eq(segredosDosAtivos.ativoId, ativoId)];
  if (!pode(acesso, 'cofre.administrar')) {
    condicoes.push(eq(segredos.situacao, 'ativo'));
    condicoes.push(alcancadoPor(tx, await titularesDaConta(tx, contaId)));
  }
  return tx
    .select({
      id: segredos.id,
      nome: segredos.nome,
      tipo: segredos.tipo,
      identificador: segredos.identificador,
      situacao: segredos.situacao,
    })
    .from(segredosDosAtivos)
    .innerJoin(
      segredos,
      and(
        eq(segredos.orgId, segredosDosAtivos.orgId),
        eq(segredos.id, segredosDosAtivos.segredoId),
      ),
    )
    .where(and(...condicoes))
    .orderBy(asc(segredos.nomeNormalizado), asc(segredos.id));
}
