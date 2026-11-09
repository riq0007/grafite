// As linhas de cada tabela da aplicação, para o manifesto do backup e para conferir a restauração.
// São os esquemas que o papel do backup lê (migration 0017).
import type pg from 'pg';

export const ESQUEMAS_DO_BACKUP = ['public', 'fila', 'operacao', 'drizzle'] as const;

/** As linhas de cada tabela (`esquema.tabela`), na transação ou no instantâneo da conexão. */
export async function contarLinhasNaConexao(
  cliente: pg.ClientBase,
): Promise<Record<string, number>> {
  const { rows: tabelas } = await cliente.query<{ esquema: string; tabela: string }>(
    `select n.nspname as esquema, c.relname as tabela
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname = any($1::text[])
      order by 1, 2`,
    [ESQUEMAS_DO_BACKUP],
  );
  const linhas: Record<string, number> = {};
  for (const { esquema, tabela } of tabelas) {
    const { rows } = await cliente.query<{ n: string }>(
      `select count(*) as n from ${cliente.escapeIdentifier(esquema)}.${cliente.escapeIdentifier(tabela)}`,
    );
    linhas[`${esquema}.${tabela}`] = Number(rows[0]?.n ?? 0);
  }
  return linhas;
}
