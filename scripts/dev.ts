// Ambiente de desenvolvimento com um comando (spec plataforma-base):
// .env (criado com senhas aleatórias se faltar) → Docker → banco → papel do backup → migrations →
// organização de desenvolvimento (na primeira vez) → a senha da conta admin (admin123) → o coletor
// de desenvolvimento, com a faixa do próprio computador → API, coletor e web. O e-mail vai para o
// Mailpit, que o guarda sem entregar, e as chaves do push são geradas uma vez no .env (change
// p3c-email-e-push, design, decisão 11).
// Uso: pnpm dev
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORTA_DO_BANCO = 5433;

const CHAVE_DOIS_PASSOS = 'GRAFITE_CHAVE_DOIS_PASSOS';
const CHAVE_DO_COFRE = 'GRAFITE_CHAVE_DO_COFRE';
const PASTA_DOS_ARQUIVOS = 'GRAFITE_ARQUIVOS_PASTA';
const SENHA_DO_BACKUP = 'GRAFITE_DB_BACKUP_PASSWORD';
const AMBIENTE = 'GRAFITE_AMBIENTE';
const TOKEN_DO_COLETOR = 'GRAFITE_COLETOR_TOKEN';
/** A pasta das fotos no desenvolvimento, relativa à raiz do repositório e ignorada pelo Git. */
const PASTA_DOS_ARQUIVOS_NO_DESENVOLVIMENTO = '.grafite/arquivos';

/** Os serviços do compose do desenvolvimento: o banco e o Mailpit. */
export const SERVICOS_DO_COMPOSE = ['db', 'email'] as const;

/** O par das chaves do push, em base64url. */
export interface ChavesDoPush {
  publica: string;
  privada: string;
}

/** Um par novo das chaves do push, da curva P-256. */
export function gerarChavesDoPush(): ChavesDoPush {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { d = '', x = '', y = '' } = privateKey.export({ format: 'jwk' });
  const publica = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(x, 'base64url'),
    Buffer.from(y, 'base64url'),
  ]).toString('base64url');
  return { publica, privada: d };
}

/** O e-mail do Mailpit e a origem dos links da web do Vite: sem segredo, iguais em todo computador. */
const CANAIS_SEM_SEGREDO: ReadonlyArray<[string, string]> = [
  ['GRAFITE_SMTP_URL', 'smtp://127.0.0.1:1025'],
  ['GRAFITE_EMAIL_REMETENTE', '"Grafite <grafite@grafite.localhost>"'],
  ['GRAFITE_ORIGEM_DOS_LINKS', 'http://localhost:5173'],
  ['GRAFITE_PUSH_CONTATO', 'mailto:grafite@grafite.localhost'],
];

export function gerarEnvDeDesenvolvimento(
  senha: () => string,
  chave: () => string,
  token: () => string,
  chavesDoPush: () => ChavesDoPush = gerarChavesDoPush,
): string {
  const [superusuario, dono, app, backup] = [senha(), senha(), senha(), senha()];
  const push = chavesDoPush();
  const endereco = `localhost:${PORTA_DO_BANCO}/grafite`;
  return [
    '# Gerado por pnpm dev. Nunca versionar.',
    `${AMBIENTE}=desenvolvimento`,
    `GRAFITE_DB_PORT=${PORTA_DO_BANCO}`,
    `GRAFITE_DB_SUPERUSER_PASSWORD=${superusuario}`,
    `GRAFITE_DB_OWNER_PASSWORD=${dono}`,
    `GRAFITE_DB_APP_PASSWORD=${app}`,
    `${SENHA_DO_BACKUP}=${backup}`,
    `GRAFITE_DATABASE_URL=postgres://grafite_app:${app}@${endereco}`,
    `GRAFITE_DATABASE_URL_MIGRACOES=postgres://grafite_owner:${dono}@${endereco}`,
    `${CHAVE_DOIS_PASSOS}=${chave()}`,
    `${PASTA_DOS_ARQUIVOS}=${PASTA_DOS_ARQUIVOS_NO_DESENVOLVIMENTO}`,
    `${TOKEN_DO_COLETOR}=${token()}`,
    `${CHAVE_DO_COFRE}=${chave()}`,
    ...CANAIS_SEM_SEGREDO.map(([nome, valor]) => `${nome}=${valor}`),
    `GRAFITE_PUSH_CHAVE_PUBLICA=${push.publica}`,
    `GRAFITE_PUSH_CHAVE_PRIVADA=${push.privada}`,
    '',
  ].join('\n');
}

/** Preenche a variável deixada vazia, no mesmo lugar, ou a acrescenta no fim; nunca troca um valor. */
function completarVariavel(conteudo: string, nome: string, valor: () => string): string {
  const vazia = new RegExp(`^${nome}=[ \\t]*(?=\\r?$)`, 'm');
  if (vazia.test(conteudo)) return conteudo.replace(vazia, `${nome}=${valor()}`);
  if (new RegExp(`^${nome}=`, 'm').test(conteudo)) return conteudo;
  const separador = conteudo === '' || conteudo.endsWith('\n') ? '' : '\n';
  return `${conteudo}${separador}${nome}=${valor()}\n`;
}

/**
 * Um .env anterior ganha o que veio depois dele: a chave da verificação em dois passos, a pasta dos
 * arquivos, a senha do papel do backup, o ambiente, o token do coletor e a chave mestra do cofre. Uma
 * chave que já existe nunca é trocada: as chaves dos apps autenticadores e os segredos do cofre já
 * cifrados com ela deixariam de abrir. O token também não: o coletor de desenvolvimento está ligado
 * a ele no banco.
 */
export function completarEnvDeDesenvolvimento(
  conteudo: string,
  chave: () => string,
  senha: () => string,
  token: () => string,
): string {
  const comChave = completarVariavel(conteudo, CHAVE_DOIS_PASSOS, chave);
  const comPasta = completarVariavel(
    comChave,
    PASTA_DOS_ARQUIVOS,
    () => PASTA_DOS_ARQUIVOS_NO_DESENVOLVIMENTO,
  );
  const comSenha = completarVariavel(comPasta, SENHA_DO_BACKUP, senha);
  const comAmbiente = completarVariavel(comSenha, AMBIENTE, () => 'desenvolvimento');
  const comToken = completarVariavel(comAmbiente, TOKEN_DO_COLETOR, token);
  return completarVariavel(comToken, CHAVE_DO_COFRE, chave);
}

/**
 * Um .env de antes do e-mail e do push ganha o Mailpit, a origem dos links e as chaves do push, sem
 * trocar o que já tem. O par das chaves é gerado uma vez, só com as duas faltando: um par novo ao
 * lado de uma chave que ficou não abriria, e a API recusaria iniciar dizendo o motivo.
 */
export function completarCanaisDoDesenvolvimento(
  conteudo: string,
  chavesDoPush: () => ChavesDoPush = gerarChavesDoPush,
): string {
  let completo = conteudo;
  for (const [nome, valor] of CANAIS_SEM_SEGREDO) {
    completo = completarVariavel(completo, nome, () => valor);
  }
  const tem = (nome: string) => new RegExp(`^${nome}=[^\\s]`, 'm').test(completo);
  if (!tem('GRAFITE_PUSH_CHAVE_PUBLICA') && !tem('GRAFITE_PUSH_CHAVE_PRIVADA')) {
    const { publica, privada } = chavesDoPush();
    completo = completarVariavel(completo, 'GRAFITE_PUSH_CHAVE_PUBLICA', () => publica);
    completo = completarVariavel(completo, 'GRAFITE_PUSH_CHAVE_PRIVADA', () => privada);
  }
  return completo;
}

/**
 * Os argumentos do `pnpm grafite` que criam a organização de desenvolvimento na primeira vez: os
 * endereços locais da web e da API e a conta `admin`, sem exigir os dois passos. Nas execuções
 * seguintes, o `--se-nao-existir` não faz nada nem mostra senha.
 */
export function organizacaoDeDesenvolvimento(): string[] {
  return [
    'organizacao',
    'criar',
    '--se-nao-existir',
    '--sem-exigir-dois-passos',
    '--nome',
    'Desenvolvimento',
    '--endereco',
    'localhost',
    '--endereco',
    '127.0.0.1',
    '--pessoa',
    'Administrador',
    '--usuario',
    'admin',
  ];
}

/**
 * Os argumentos do `pnpm grafite` que ligam o coletor de desenvolvimento à organização de
 * desenvolvimento, com a faixa do próprio computador e o token do .env, sem mostrá-lo (design do
 * P2a, decisão 9). Nas execuções seguintes, o `--se-nao-existir` acha o coletor pelo token e não
 * muda nada, nem as faixas que a pessoa mudou na tela.
 */
export function coletorDeDesenvolvimento(): string[] {
  return [
    'coletor',
    'criar',
    '--endereco',
    'localhost',
    '--nome',
    'Coletor de desenvolvimento',
    '--faixa',
    '127.0.0.0/8',
    '--token-do-ambiente',
    '--se-nao-existir',
  ];
}

/** Um passo do banco: os argumentos do Node e se a saída padrão fica fora do terminal. */
export interface PassoDoBanco {
  argumentos: string[];
  semSaida?: boolean;
}

/**
 * Os passos do banco, em ordem, depois de ele subir: o papel do backup (antes das migrations, que
 * dão a leitura a ele; um banco criado antes do F2d o ganha aqui), as migrations, a organização de
 * desenvolvimento e a senha da conta `admin` (change senha-do-admin-no-desenvolvimento). A criação
 * da organização roda sem a saída padrão: a senha temporária que ela mostraria é trocada logo
 * depois, e o último passo diz como entrar.
 */
export function passosDoBanco(): PassoDoBanco[] {
  return [
    { argumentos: ['--env-file=.env', 'packages/db/scripts/papel-do-backup.ts'] },
    { argumentos: ['--env-file=.env', 'packages/db/src/migrar.ts'] },
    {
      argumentos: [
        '--env-file=.env',
        'apps/api/scripts/grafite.ts',
        ...organizacaoDeDesenvolvimento(),
      ],
      semSaida: true,
    },
    { argumentos: ['--env-file=.env', 'apps/api/scripts/desenvolvimento.ts'] },
    {
      argumentos: ['--env-file=.env', 'apps/api/scripts/grafite.ts', ...coletorDeDesenvolvimento()],
    },
  ];
}

/**
 * O coletor de desenvolvimento fala com a API local pelo endereço da organização de
 * desenvolvimento, como o da produção fala pelo da organização dele, e guarda a fila numa pasta
 * que o Git ignora. O token vem do .env.
 */
export const AMBIENTE_DO_COLETOR = {
  GRAFITE_COLETOR_API_URL: 'http://127.0.0.1:3000',
  GRAFITE_COLETOR_ENDERECO: 'localhost',
  GRAFITE_COLETOR_PASTA: '.grafite/coletor',
};

/** Um processo do desenvolvimento, que fica no ar até o Ctrl+C. */
export interface ProcessoDoDesenvolvimento {
  nome: string;
  comando: string;
  argumentos: string[];
  /** O que vai para o ambiente do processo, além do ambiente do comando. */
  ambiente?: Record<string, string>;
  /** Pelo shell, como o pnpm no Windows. */
  shell?: boolean;
  /** Sobe só depois de a API responder, para não começar com uma falha. */
  depoisDaApi?: boolean;
}

/** A API e o coletor, que reiniciam quando o código muda, e a web. */
export function processosDoDesenvolvimento(
  plataforma: NodeJS.Platform,
): ProcessoDoDesenvolvimento[] {
  return [
    {
      nome: 'api',
      comando: process.execPath,
      argumentos: ['--watch', '--env-file=.env', 'apps/api/src/servidor.ts'],
    },
    {
      nome: 'coletor',
      comando: process.execPath,
      argumentos: ['--watch', '--env-file=.env', 'apps/collector/src/servidor.ts'],
      ambiente: AMBIENTE_DO_COLETOR,
      depoisDaApi: true,
    },
    {
      nome: 'web',
      comando: 'pnpm',
      argumentos: ['--filter', '@grafite/web', 'dev'],
      shell: plataforma === 'win32',
    },
  ];
}

/** Espera a saúde da API responder, por até 1 minuto; depois, segue mesmo assim. */
async function esperarAApi(): Promise<void> {
  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    try {
      if ((await fetch('http://127.0.0.1:3000/health')).status < 500) return;
    } catch {
      // A API ainda não está no ar.
    }
    await new Promise((pronto) => setTimeout(pronto, 500));
  }
}

export function dockerEmExecucao(env: NodeJS.ProcessEnv): boolean {
  const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    env,
    encoding: 'utf8',
  });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function executar(comando: string, argumentos: string[], semSaida = false): void {
  // Sem a saída padrão, os erros continuam aparecendo.
  const r = spawnSync(comando, argumentos, {
    stdio: semSaida ? ['inherit', 'ignore', 'inherit'] : 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function comPrefixo(nome: string, processo: ChildProcess): void {
  for (const fluxo of [processo.stdout, processo.stderr]) {
    fluxo?.on('data', (dados: Buffer) => {
      for (const linha of dados.toString().split(/\r?\n/)) {
        if (linha) process.stdout.write(`[${nome}] ${linha}\n`);
      }
    });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const novaChave = () => randomBytes(32).toString('base64');
  const novaSenha = () => randomBytes(24).toString('hex');
  const novoToken = () => randomBytes(32).toString('base64url');
  if (!existsSync('.env')) {
    writeFileSync('.env', gerarEnvDeDesenvolvimento(novaSenha, novaChave, novoToken));
    console.log('.env criado com senhas aleatórias (fica fora do Git).');
  } else {
    const atual = readFileSync('.env', 'utf8');
    const completo = completarCanaisDoDesenvolvimento(
      completarEnvDeDesenvolvimento(atual, novaChave, novaSenha, novoToken),
    );
    if (completo !== atual) {
      writeFileSync('.env', completo);
      console.log('.env completado com as variáveis que faltavam.');
    }
  }
  if (!dockerEmExecucao(process.env)) {
    console.error(
      'O Docker não está em execução. Abra o Docker Desktop e rode `pnpm dev` de novo.',
    );
    process.exit(1);
  }
  executar('docker', ['compose', 'up', '-d', '--wait', ...SERVICOS_DO_COMPOSE]);
  for (const { argumentos, semSaida } of passosDoBanco()) {
    executar(process.execPath, argumentos, semSaida);
  }

  const processos: ChildProcess[] = [];
  const subir = ({ nome, comando, argumentos, ambiente, shell }: ProcessoDoDesenvolvimento) => {
    const processo = spawn(comando, argumentos, {
      shell: shell ?? false,
      env: { ...process.env, ...ambiente },
    });
    comPrefixo(nome, processo);
    processos.push(processo);
  };
  const todos = processosDoDesenvolvimento(process.platform);
  for (const processo of todos.filter(({ depoisDaApi }) => !depoisDaApi)) subir(processo);
  console.log('API em http://127.0.0.1:3000 · web em http://localhost:5173 (Ctrl+C encerra)');
  await esperarAApi();
  for (const processo of todos.filter(({ depoisDaApi }) => depoisDaApi)) subir(processo);
  console.log('Coletor em http://127.0.0.1:3100/health, com a faixa 127.0.0.0/8');
  console.log('E-mails do desenvolvimento em http://localhost:8025 (o Mailpit não entrega nenhum)');

  const encerrar = () => {
    for (const processo of processos) processo.kill();
    process.exit(0);
  };
  process.once('SIGINT', encerrar);
  process.once('SIGTERM', encerrar);
}
