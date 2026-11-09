import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import * as schema from './schema.ts';

/**
 * O banco da aplicação: o Drizzle sobre o pool do papel `grafite_app`, que fica em `$client` para o
 * que roda fora do Drizzle, como os registros da operação.
 */
export type Banco = NodePgDatabase<typeof schema> & { $client: pg.Pool };

/** A transação que `naOrganizacao` entrega: toda escrita e a auditoria dela usam a mesma. */
export type Transacao = Parameters<Parameters<Banco['transaction']>[0]>[0];

export function criarBanco(pool: pg.Pool): Banco {
  return drizzle(pool, { schema });
}

/**
 * Roda `fn` numa transação com a organização no contexto (`app.org_id`), que o RLS lê. O
 * contexto vale só dentro dela (`set_config` local): a conexão volta ao pool sem ele, e um erro
 * desfaz tudo o que a transação gravou.
 */
export function naOrganizacao<T>(
  banco: Banco,
  orgId: string,
  fn: (tx: Transacao) => Promise<T>,
): Promise<T> {
  return banco.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
