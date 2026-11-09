// Os papéis que só quem tem o superusuário cria (design do F2d, decisão 11): o pnpm dev e o
// comando de operação garantem o papel do backup com a senha da configuração.
import pg from 'pg';

/**
 * Cria o papel do backup (grafite_backup), ou troca a senha dele, e dá a leitura do banco, se as
 * migrations já rodaram. Só lê, por cima do RLS: sem escrita, sem criar nada e sem ser dono.
 */
export async function garantirPapelDoBackup(urlSuperusuario: string, senha: string): Promise<void> {
  const cliente = new pg.Client({ connectionString: urlSuperusuario });
  await cliente.connect();
  try {
    const { rowCount } = await cliente.query(
      "select 1 from pg_roles where rolname = 'grafite_backup'",
    );
    const senhaLiteral = cliente.escapeLiteral(senha);
    await cliente.query(
      rowCount === 0
        ? `create role grafite_backup login password ${senhaLiteral}
             nosuperuser nocreatedb nocreaterole noreplication bypassrls`
        : `alter role grafite_backup with login password ${senhaLiteral}
             nosuperuser nocreatedb nocreaterole noreplication bypassrls`,
    );
    const { rows } = await cliente.query<{ banco: string; funcao: boolean }>(
      `select current_database() as banco,
              to_regprocedure('app.conceder_leitura_ao_backup()') is not null as funcao`,
    );
    const [{ banco, funcao }] = rows as [{ banco: string; funcao: boolean }];
    await cliente.query(
      `grant connect on database ${cliente.escapeIdentifier(banco)} to grafite_backup`,
    );
    if (funcao) await cliente.query('select app.conceder_leitura_ao_backup()');
  } finally {
    await cliente.end();
  }
}
