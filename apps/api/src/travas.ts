// As travas da organização (design do F2b, decisões 3 e 7): as mudanças que precisam do estado
// inteiro de uma parte da organização, como a árvore de locais ou quem administra os acessos, rodam
// uma de cada vez. A trava transacional do PostgreSQL é solta no fim da transação, com o commit ou
// com o rollback, e a de uma organização não espera as de outra.
import type { Transacao } from '@grafite/db';
import { sql } from 'drizzle-orm';

export type Trava = 'acessos' | 'locais';

/** Espera a trava na organização da transação. Toda leitura que decide vem depois dela. */
export async function travar(tx: Transacao, trava: Trava) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${trava} || ':' || app.current_org()::text, 0))`,
  );
}
