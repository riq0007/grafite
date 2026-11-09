import type pg from 'pg';

/**
 * Os esquemas sem dado de organização, que ficam sem RLS (spec isolamento-organizacoes,
 * "Infraestrutura fora das organizações"): a fila de tarefas, os registros da operação do servidor
 * e o diário das migrations. As funções de `app` não têm tabelas.
 */
export const ESQUEMAS_DE_INFRAESTRUTURA = ['fila', 'operacao', 'drizzle'] as const;

/**
 * Tabelas de negócio sem RLS ativo e forçado, em qualquer esquema que não seja do sistema nem de
 * infraestrutura. Deve ser sempre vazio: toda tabela nova é isolada com
 * `app.isolar_por_organizacao()` na própria migration.
 */
export async function tabelasSemIsolamento(
  pool: pg.Pool,
  excecoes: string[] = [],
): Promise<string[]> {
  const { rows } = await pool.query<{ tabela: string }>(
    `select n.nspname || '.' || c.relname as tabela
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and n.nspname not in ('pg_catalog', 'information_schema')
        and n.nspname !~ '^pg_'
        and n.nspname <> all ($2::text[])
        and not (c.relrowsecurity and c.relforcerowsecurity)
        and n.nspname || '.' || c.relname <> all ($1::text[])
      order by 1`,
    [excecoes, ESQUEMAS_DE_INFRAESTRUTURA],
  );
  return rows.map((r) => r.tabela);
}
