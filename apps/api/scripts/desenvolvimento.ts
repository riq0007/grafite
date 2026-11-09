// A senha do ambiente de desenvolvimento (change senha-do-admin-no-desenvolvimento): só o `pnpm dev`
// roda este ponto de entrada, que fica fora da imagem (.dockerignore). A conexão vem de
// GRAFITE_DATABASE_URL, a mesma da API (papel grafite_app), e só é aberta fora da produção.
import { criarBanco } from '@grafite/db';
import pg from 'pg';
import {
  garantirSenhaDeDesenvolvimento,
  SENHA_DE_DESENVOLVIMENTO,
  USUARIO_DE_DESENVOLVIMENTO,
} from '../src/comando/desenvolvimento.ts';
import { ErroDoComando } from '../src/comando/erros.ts';

let pool: pg.Pool | undefined;
try {
  const resultado = await garantirSenhaDeDesenvolvimento({
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
    nodeEnv: process.env.NODE_ENV,
  });
  if (resultado === 'gravada') {
    console.log(
      `A conta ${USUARIO_DE_DESENVOLVIMENTO} passou a entrar com a senha ${SENHA_DE_DESENVOLVIMENTO}, e as sessões abertas dela foram encerradas.`,
    );
  }
  console.log(
    `Entre com o usuário ${USUARIO_DE_DESENVOLVIMENTO} e a senha ${SENHA_DE_DESENVOLVIMENTO}.`,
  );
} catch (erro) {
  if (!(erro instanceof ErroDoComando)) throw erro;
  console.error(erro.message);
  process.exitCode = erro.codigoDeSaida;
} finally {
  await pool?.end();
}
