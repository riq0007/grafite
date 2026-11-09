// O comando no servidor: `pnpm grafite <comando>` (design do F2a, decisão 11). A conexão vem de
// GRAFITE_DATABASE_URL, a mesma da API (papel grafite_app), e só é aberta se o comando precisar.
import { criarBanco } from '@grafite/db';
import pg from 'pg';
import { ErroDoComando } from '../src/comando/erros.ts';
import { executarComando } from '../src/comando/executar.ts';

let pool: pg.Pool | undefined;
const codigo = await executarComando(process.argv.slice(2), {
  banco: () => {
    const url = process.env.GRAFITE_DATABASE_URL;
    if (!url) {
      throw new ErroDoComando(
        2,
        'GRAFITE_DATABASE_URL: obrigatória (conexão do papel grafite_app).',
      );
    }
    pool = new pg.Pool({ connectionString: url });
    return criarBanco(pool);
  },
  agora: () => new Date(),
  escrever: (texto) => process.stdout.write(`${texto}\n`),
  escreverErro: (texto) => process.stderr.write(`${texto}\n`),
  variavel: (nome) => process.env[nome],
});
await pool?.end();
process.exitCode = codigo;
