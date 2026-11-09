// Sobe a pilha da ponta a ponta (design do F2a, decisão 16): compila a web, sobe um PostgreSQL 18
// efêmero com as migrations, cria a organização pelo comando no servidor, de verdade, e inicia a
// API servindo a web compilada. A senha temporária sai da saída do comando, como para uma pessoa.
// Os canais de fora (change p3c-email-e-push) vão para um servidor SMTP de verdade, em processo, e
// para um serviço de push falso, em HTTPS; uma caixa em HTTP dá aos testes o que os dois receberam.
// Devolve a função que derruba tudo no fim.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iniciarBancoDeTeste } from '@grafite/db/teste';
import { parDoPush, servicoDePushFalso, servidorDeEmail } from '../../api/test/canais.ts';
import { PORTA_DA_PILHA } from '../playwright.pilha.config.ts';

const pastaDaWeb = join(dirname(fileURLToPath(import.meta.url)), '..');
const raiz = join(pastaDaWeb, '..', '..');

/** O endereço da organização: o mesmo pelo qual o navegador abre a web. */
export const ENDERECO_DA_PILHA = 'localhost';

async function esperarAApi(url: string, limite: number) {
  const fim = Date.now() + limite;
  while (Date.now() < fim) {
    try {
      const resposta = await fetch(url);
      if (resposta.ok) return;
    } catch {
      // A API ainda não abriu a porta.
    }
    await new Promise((resolver) => setTimeout(resolver, 250));
  }
  throw new Error(`A API não respondeu em ${url} em ${limite / 1000} s.`);
}

export default async function subir() {
  // A web compilada, como a imagem da aplicação a serve.
  execFileSync(
    process.execPath,
    [join(pastaDaWeb, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
    {
      cwd: pastaDaWeb,
      stdio: 'inherit',
    },
  );

  const banco = await iniciarBancoDeTeste();
  const pastaDosArquivos = mkdtempSync(join(tmpdir(), 'grafite-pilha-arquivos-'));
  const apagarArquivos = () => rmSync(pastaDosArquivos, { recursive: true, force: true });

  // Os canais de fora: o SMTP com uma senha só desta pilha, o serviço de push com o certificado dele
  // num arquivo que a API confia, e a caixa com o que os dois receberam, para os testes.
  const smtp = await servidorDeEmail({ senha: randomBytes(12).toString('hex') });
  const servicoDePush = await servicoDePushFalso();
  const certificadoDoPush = join(mkdtempSync(join(tmpdir(), 'grafite-pilha-push-')), 'push.pem');
  writeFileSync(certificadoDoPush, servicoDePush.certificado);
  const chavesDoPush = parDoPush();
  const caixa = createServer((pedido, resposta) => {
    resposta.setHeader('content-type', 'application/json');
    if (pedido.url === '/emails') {
      resposta.end(
        JSON.stringify(
          smtp.mensagens.map((mensagem) => ({
            assunto: mensagem.subject,
            para: mensagem.to && 'text' in mensagem.to ? mensagem.to.text : '',
            texto: mensagem.text,
          })),
        ),
      );
      return;
    }
    resposta.end(
      JSON.stringify(
        servicoDePush.pedidos.map(({ caminho, corpo }) => ({
          caminho,
          corpo: corpo.toString('base64'),
        })),
      ),
    );
  });
  await new Promise<void>((pronto) => caixa.listen(0, '127.0.0.1', pronto));
  const fecharCanais = async () => {
    await new Promise<void>((pronto) => caixa.close(() => pronto()));
    await smtp.fechar();
    await servicoDePush.fechar();
    rmSync(dirname(certificadoDoPush), { recursive: true, force: true });
  };
  let api: ChildProcess | undefined;
  try {
    const saida = execFileSync(
      process.execPath,
      [
        join(raiz, 'apps', 'api', 'scripts', 'grafite.ts'),
        'organizacao',
        'criar',
        '--nome',
        'Empresa da pilha',
        '--endereco',
        ENDERECO_DA_PILHA,
        '--pessoa',
        'Ana Souza',
        '--usuario',
        'ana.souza',
        '--email',
        'ana.souza@empresa.com.br',
      ],
      { cwd: raiz, env: { ...process.env, GRAFITE_DATABASE_URL: banco.urlApp }, encoding: 'utf8' },
    );
    const senha = /Senha temporária: (\S+)/.exec(saida)?.[1];
    if (!senha) throw new Error(`O comando não mostrou a senha temporária:\n${saida}`);

    const logs = join(pastaDaWeb, 'test-results');
    mkdirSync(logs, { recursive: true });
    const log = createWriteStream(join(logs, 'api-da-pilha.log'));
    api = spawn(process.execPath, [join(raiz, 'apps', 'api', 'src', 'servidor.ts')], {
      cwd: raiz,
      env: {
        ...process.env,
        GRAFITE_AMBIENTE: 'producao',
        GRAFITE_DATABASE_URL: banco.urlApp,
        GRAFITE_API_PORTA: String(PORTA_DA_PILHA),
        GRAFITE_API_HOST: '127.0.0.1',
        GRAFITE_WEB_PASTA: join(pastaDaWeb, 'dist'),
        GRAFITE_CHAVE_DOIS_PASSOS: randomBytes(32).toString('base64'),
        GRAFITE_CHAVE_DO_COFRE: randomBytes(32).toString('base64'),
        GRAFITE_ARQUIVOS_PASTA: pastaDosArquivos,
        GRAFITE_SMTP_URL: smtp.url(),
        GRAFITE_EMAIL_REMETENTE: 'Grafite <grafite@empresa.com.br>',
        GRAFITE_PUSH_CHAVE_PUBLICA: chavesDoPush.chavePublica,
        GRAFITE_PUSH_CHAVE_PRIVADA: chavesDoPush.chavePrivada,
        GRAFITE_PUSH_CONTATO: 'mailto:ti@empresa.com.br',
        GRAFITE_PUSH_SERVICOS_EXTRAS: servicoDePush.origem,
        GRAFITE_ORIGEM_DOS_LINKS: `http://localhost:${PORTA_DA_PILHA}`,
        NODE_EXTRA_CA_CERTS: certificadoDoPush,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    api.stdout?.pipe(log);
    api.stderr?.pipe(log);
    await esperarAApi(`http://127.0.0.1:${PORTA_DA_PILHA}/health`, 30_000);

    // Os testes leem daqui: o Playwright passa o ambiente do processo principal aos workers.
    process.env.GRAFITE_PILHA_SENHA_TEMPORARIA = senha;
    process.env.GRAFITE_PILHA_URL_DO_BANCO = banco.urlApp;
    process.env.GRAFITE_PILHA_CAIXA = `http://127.0.0.1:${(caixa.address() as AddressInfo).port}`;
    process.env.GRAFITE_PILHA_SERVICO_DE_PUSH = servicoDePush.origem;
  } catch (erro) {
    api?.kill();
    await banco.parar();
    apagarArquivos();
    await fecharCanais();
    throw erro;
  }

  return async () => {
    api?.kill();
    await banco.parar();
    apagarArquivos();
    await fecharCanais();
  };
}
