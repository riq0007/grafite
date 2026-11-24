// O que o `pnpm dev` garante na organização de desenvolvimento, e só ele roda este ponto de entrada,
// que fica fora da imagem (.dockerignore):
// - a senha do `admin` (change senha-do-admin-no-desenvolvimento);
// - o diretório de desenvolvimento e a chave da aba (change aba-dos-colaboradores, design, decisão
//   13), com a GRAFITE_DIRETORIO_DE_DESENVOLVIMENTO no .env.
// A conexão vem de GRAFITE_DATABASE_URL, a mesma da API (papel grafite_app), e só é aberta fora da
// produção.
import { criarBanco } from '@grafite/db';
import pg from 'pg';
import {
  garantirDiretorioDeDesenvolvimento,
  garantirSenhaDeDesenvolvimento,
  SENHA_DE_DESENVOLVIMENTO,
  USUARIO_DE_DESENVOLVIMENTO,
} from '../src/comando/desenvolvimento.ts';
import { ErroDoComando } from '../src/comando/erros.ts';
import {
  SENHA_DA_ABA_DE_DESENVOLVIMENTO,
  usuarioDoWindowsAtual,
} from '../src/diretorio/desenvolvimento.ts';

let pool: pg.Pool | undefined;
const banco = () => {
  if (pool) return criarBanco(pool);
  const url = process.env.GRAFITE_DATABASE_URL;
  if (!url) {
    throw new ErroDoComando(2, 'GRAFITE_DATABASE_URL: obrigatória (conexão do papel grafite_app).');
  }
  pool = new pg.Pool({ connectionString: url });
  return criarBanco(pool);
};

try {
  const resultado = await garantirSenhaDeDesenvolvimento({
    banco,
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

  const chaveDoCofre = process.env.GRAFITE_CHAVE_DO_COFRE;
  const chaveDaAba = process.env.GRAFITE_ABA_CHAVE_DE_DESENVOLVIMENTO;
  if (process.env.GRAFITE_DIRETORIO_DE_DESENVOLVIMENTO === '1' && chaveDoCofre && chaveDaAba) {
    const diretorio = await garantirDiretorioDeDesenvolvimento({
      banco,
      agora: () => new Date(),
      nodeEnv: process.env.NODE_ENV,
      chavesDoCofre: { atual: Buffer.from(chaveDoCofre, 'base64') },
      chaveDaAba,
    });
    const quem = usuarioDoWindowsAtual();
    if (diretorio === 'outro-diretorio') {
      console.log(
        'A organização de desenvolvimento tem outro diretório configurado: o diretório simulado fica desligado.',
      );
    } else if (quem) {
      console.log(
        `A aba entra pelo Windows com ${quem.usuario}, ou pela senha com ${quem.usuario} e ${SENHA_DA_ABA_DE_DESENVOLVIMENTO}.`,
      );
    } else {
      console.log('O diretório simulado pede o Windows, que diz o usuário e o SID.');
    }
  }
} catch (erro) {
  if (!(erro instanceof ErroDoComando)) throw erro;
  console.error(erro.message);
  process.exitCode = erro.codigoDeSaida;
} finally {
  await pool?.end();
}
