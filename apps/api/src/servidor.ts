// Ponto de entrada da API. A configuração vem do ambiente e é validada antes de tudo.
import { criarBanco, enderecosDeAcesso, naOrganizacao } from '@grafite/db';
import pg from 'pg';
import pacote from '../package.json' with { type: 'json' };
import { criarApp } from './app.ts';
import { ArmazenamentoEmDisco } from './arquivos/armazenamento.ts';
import { prepararPastaDosArquivos } from './arquivos/pasta.ts';
import { criarPoolDoBanco } from './banco.ts';
import { criarCarteiroDeEmail } from './canais/email.ts';
import { criarEntregadorDePush } from './canais/push.ts';
import { type Configuracao, carregarConfiguracao, ErroDeConfiguracao } from './config.ts';
import type { ConectarDiretorio } from './diretorio/cliente.ts';
import { conectarPeloLdap } from './diretorio/ldap.ts';
import { FilaSemEsquema } from './fila/fila.ts';
import { tarefasDaApi } from './fila/tarefas.ts';

let config: Configuracao;
try {
  config = carregarConfiguracao(process.env);
  await prepararPastaDosArquivos(config.pastaDosArquivos);
} catch (erro) {
  if (erro instanceof ErroDeConfiguracao) {
    console.error(erro.message);
    process.exit(1);
  }
  throw erro;
}

const pool = criarPoolDoBanco(config.urlBanco, (erro) =>
  app.log.warn({ err: erro }, 'conexão com o banco perdida'),
);
const banco = criarBanco(pool);

/**
 * O diretório de desenvolvimento (change aba-dos-colaboradores, design, decisão 13): o módulo só é
 * carregado com a variável, que a configuração recusa fora do desenvolvimento.
 */
async function conectarDiretorio(): Promise<ConectarDiretorio> {
  if (!config.diretorioDeDesenvolvimento) return conectarPeloLdap;
  const desenvolvimento = await import('./diretorio/desenvolvimento.ts');
  const quem = desenvolvimento.usuarioDoWindowsAtual();
  if (!quem) {
    console.warn('O diretório de desenvolvimento pede o Windows, que diz o usuário e o SID.');
    return conectarPeloLdap;
  }
  return desenvolvimento.conectarDiretorioDeDesenvolvimento({
    quem,
    enderecosDa: (orgId) =>
      naOrganizacao(banco, orgId, (tx) =>
        tx.select({ endereco: enderecosDeAcesso.endereco }).from(enderecosDeAcesso),
      ).then((linhas) => linhas.map(({ endereco }) => endereco)),
    outro: conectarPeloLdap,
    avisar: (dados, mensagem) => app.log.warn(dados, mensagem),
  });
}

const app = await criarApp({
  ambiente: config.ambiente,
  proxiesConfiaveis: config.proxiesConfiaveis,
  organizacaoOperadora: config.organizacaoOperadora,
  versao: pacote.version,
  verificarBanco: async () => {
    await pool.query('select 1');
  },
  banco,
  conectarDiretorio: await conectarDiretorio(),
  chaveDoisPassos: config.chaveDoisPassos,
  chavesDoCofre: config.chavesDoCofre,
  armazenamento: new ArmazenamentoEmDisco(config.pastaDosArquivos),
  canais: {
    carteiro: config.email && criarCarteiroDeEmail(config.email),
    entregador:
      config.push &&
      criarEntregadorDePush(config.push, { extras: config.servicosDePushExtras ?? [] }),
    origemDosLinks: config.origemDosLinks,
  },
  conectarOuvinte: () =>
    new pg.Client({ connectionString: config.urlBanco, connectionTimeoutMillis: 2000 }),
  fila: { conexao: config.urlBanco, tarefas: tarefasDaApi, agendarAlertas: true },
  agora: () => new Date(),
  pastaDaWeb: config.pastaDaWeb,
  logger: true,
  operacao: {
    pastaDosArquivos: config.pastaDosArquivos,
    backup: config.backup,
    certificadoVigiar: config.certificadoVigiar,
  },
});

if (config.canaisIgnoradosNoTeste) {
  app.log.warn('O ambiente de teste não envia e-mail nem push: a configuração deles fica sem uso.');
}

try {
  await app.listen({ port: config.porta, host: config.host });
} catch (erro) {
  // A partida sem o esquema da fila para com a instrução, sem a pilha.
  if (erro instanceof FilaSemEsquema) {
    console.error(erro.message);
    await pool.end();
    process.exit(1);
  }
  throw erro;
}

async function encerrar() {
  await app.close();
  await pool.end();
}
process.once('SIGINT', encerrar);
process.once('SIGTERM', encerrar);
