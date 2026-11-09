// Aplica as migrations com o papel dono das tabelas (grafite_owner).
// Uso: node packages/db/src/migrar.ts  (lê GRAFITE_DATABASE_URL_MIGRACOES)
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export const pastaMigracoes = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Aplica as migrations que faltam; a pasta só muda nos testes que aplicam uma parte delas. */
export async function migrar(urlDono: string, pasta = pastaMigracoes): Promise<void> {
  const pool = new pg.Pool({ connectionString: urlDono });
  try {
    await migrate(drizzle(pool), { migrationsFolder: pasta });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env.GRAFITE_DATABASE_URL_MIGRACOES;
  if (!url) {
    console.error('GRAFITE_DATABASE_URL_MIGRACOES: obrigatória (conexão do papel grafite_owner)');
    process.exit(1);
  }
  await migrar(url);
  console.log('Migrations aplicadas.');
}
