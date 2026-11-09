import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { comandoLocal, sqlDosPapeis, versaoMaiorDoPostgres } from './cluster-local.ts';

const raizDb = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('comandoLocal', () => {
  it('troca o endereço do contêiner pelo do cluster e a pasta compartilhada pela do host', () => {
    expect(
      comandoLocal(
        [
          'pg_dump',
          '--file=/compartilhada/dia/banco.dump',
          '--dbname=postgres://postgres@127.0.0.1:5432/grafite',
        ],
        { PGPASSWORD: 'segredo' },
        { porta: 61234, pasta: 'C:\\Temp\\backup' },
      ),
    ).toEqual({
      ferramenta: 'pg_dump',
      argumentos: [
        `--file=${join('C:\\Temp\\backup', 'dia', 'banco.dump')}`,
        '--dbname=postgres://postgres@127.0.0.1:61234/grafite',
      ],
      senha: 'segredo',
    });
  });

  it('desfaz o shell que entrega a entrada à ferramenta no contêiner', () => {
    expect(
      comandoLocal(
        ['sh', '-c', 'printf "%s" "$GRAFITE_ENTRADA" | "$@"', 'sh', 'psql', '--file=-'],
        { GRAFITE_ENTRADA: 'SELECT 1;' },
        { porta: 5555 },
      ),
    ).toEqual({ ferramenta: 'psql', argumentos: ['--file=-'], entrada: 'SELECT 1;' });
  });

  it('recusa um comando que não é uma ferramenta do PostgreSQL', () => {
    expect(() => comandoLocal(['rm', '-rf', '/'], {}, { porta: 1 })).toThrow(
      'O banco de teste local só roda as ferramentas do PostgreSQL, e não rm.',
    );
  });
});

describe('versaoMaiorDoPostgres', () => {
  it('lê a versão maior do postgres --version', () => {
    expect(versaoMaiorDoPostgres('postgres (PostgreSQL) 18.1\n')).toBe(18);
    expect(versaoMaiorDoPostgres('postgres (PostgreSQL) 17.6')).toBe(17);
    expect(versaoMaiorDoPostgres('outra coisa')).toBeUndefined();
  });
});

describe('sqlDosPapeis', () => {
  // O SQL do banco de teste é o mesmo do 01-papeis.sh do desenvolvimento, com as senhas no lugar
  // das variáveis do psql.
  const script = readFileSync(join(raizDb, 'docker', 'init', '01-papeis.sh'), 'utf8');
  const doScript = [...script.matchAll(/<<'EOSQL'\n([\s\S]*?)\nEOSQL/g)].map((bloco) =>
    (bloco[1] ?? '')
      .replaceAll(":'senha_owner'", "'d'")
      .replaceAll(":'senha_app'", "'a'")
      .replaceAll(":'senha_backup'", "'b'"),
  );
  const normalizar = (sql: string) => sql.replace(/\s+/g, ' ').trim();

  it('cria os papéis como o 01-papeis.sh, com o do backup', () => {
    expect(normalizar(sqlDosPapeis({ dono: 'd', app: 'a', backup: 'b' }))).toBe(
      normalizar(doScript.join('\n')),
    );
  });

  it('sem a senha do backup, não cria o papel do backup', () => {
    expect(normalizar(sqlDosPapeis({ dono: 'd', app: 'a' }))).toBe(normalizar(doScript[0] ?? ''));
  });

  it('dobra as aspas das senhas', () => {
    expect(sqlDosPapeis({ dono: "o'k", app: 'a' })).toContain("PASSWORD 'o''k'");
  });
});
