// As travas da organização (design do F2b, decisões 3 e 7): as mudanças que precisam do estado
// inteiro de uma parte da organização, como a árvore de locais, quem administra os acessos, a fila
// de um pacote de software (change software-por-pacote, design, decisão 10) ou a solicitação de
// Toner pendente de uma impressora (change chamados-da-ti, design, "A solicitação gerada pelo tipo
// (tarefa 4.18)"), rodam uma de cada vez.
// A trava transacional do PostgreSQL é solta no fim da transação, com o commit ou com o rollback, e
// a de uma organização não espera as de outra.
import type { Transacao } from '@grafite/db';
import { sql } from 'drizzle-orm';

export type Trava =
  | 'acessos'
  | 'locais'
  | 'respostas-prontas'
  | 'horario-da-ti'
  | `pacote:${string}`
  | `toner:${string}`
  /** O teto de 100 equipes e canais ativos do chat (change chat-com-chamados). */
  | 'equipes-e-canais'
  /** As reações de uma mensagem do chat, com o teto de 10 textos (change chat-com-chamados). */
  | `mensagem:${string}`;

/** Espera a trava na organização da transação. Toda leitura que decide vem depois dela. */
export async function travar(tx: Transacao, trava: Trava) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${trava} || ':' || app.current_org()::text, 0))`,
  );
}
