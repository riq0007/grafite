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
import { fraseDaAba, usuarioDoWindowsAtual } from '../src/diretorio/desenvolvimento.ts';

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
    // O usuário do Windows lido antes: sem ele, o diretório simulado não tem quem atender, e só a
    // chave da aba é gravada.
    const quem = usuarioDoWindowsAtual();
    const diretorio = await garantirDiretorioDeDesenvolvimento({
      banco,
      agora: () => new Date(),
      nodeEnv: process.env.NODE_ENV,
      chavesDoCofre: { atual: Buffer.from(chaveDoCofre, 'base64') },
      chaveDaAba,
      usuarioDoWindows: quem?.usuario ?? null,
    });
    if (diretorio.tipo === 'so-a-chave') {
      console.log(
        'O diretório simulado pede o Windows, que diz o usuário e o SID: só a chave da aba foi gravada.',
      );
    } else if (diretorio.tipo === 'outro-diretorio') {
      console.log(
        'A organização de desenvolvimento tem outro diretório ligado: o diretório simulado fica desligado.',
      );
    } else if (quem) {
      if (diretorio.tipo === 'gravado' && diretorio.desligadoSubstituido) {
        console.log(
          `O diretório desligado ${diretorio.desligadoSubstituido} deu lugar ao simulado.`,
        );
      }
      console.log(fraseDaAba(quem.usuario, diretorio.contaLocal));
    }
  }
} catch (erro) {
  if (!(erro instanceof ErroDoComando)) throw erro;
  console.error(erro.message);
  process.exitCode = erro.codigoDeSaida;
} finally {
  await pool?.end();
}
