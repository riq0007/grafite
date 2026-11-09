// O pacote da versão (spec operacao-servicos, "Pacote da versão"; design do F2d, decisão 5): o zip
// que o CI publica na release, com o .sha256 ao lado. O servidor não compila nem instala nada, então
// o pacote leva:
// - a web compilada, em web\, e a página do painel da operação compilada, em painel\;
// - a instalação de produção da API, do coletor e do comando de operação, com o
//   node-linker=hoisted: as dependências de terceiros são pastas de verdade, e o sharp, o binário
//   da plataforma onde o pacote é montado (o Windows, no CI);
// - os pacotes do workspace no layout do repositório, fora do node_modules, onde o Node tira os
//   tipos do TypeScript;
// - o runbook, os lançadores na raiz e as ferramentas (o WinSW e o Caddy);
// - o atalho de instalação, o preparar-servidor.ps1, o atalho do menu, o ícone da marca e os
//   pré-requisitos com versão e hash (change instalador-e-menu-da-operacao, design, decisão 7). Os
//   .cmd vão com CRLF, que o cmd.exe exige, e o atalho de instalação vai também ao lado do zip.
// Os links do workspace, que um zip não carrega, vão listados no pacote.json, e o comando de
// operação os recria como junções.
// Uso: node apps/operacao/scripts/empacotar.ts --versao <x.y.z> --saida <pasta>
//        (--winsw <WinSW.exe> --caddy <caddy.exe> | --sem-ferramentas)
import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatarTamanho, sha256DoArquivo, ziparArquivos } from '@grafite/operacao';

/** Os apps cuja instalação de produção vai no pacote, com os pacotes do workspace que eles usam. */
const APPS = ['@grafite/api', '@grafite/collector', '@grafite/comando-de-operacao'];

/** O que vai do repositório para o pacote, e onde fica nele quando muda de lugar. */
const CONTEUDO: { de: string; para?: string }[] = [
  { de: 'apps/api/package.json' },
  { de: 'apps/api/src' },
  { de: 'apps/api/scripts/grafite.ts' },
  { de: 'apps/collector/package.json' },
  { de: 'apps/collector/src' },
  { de: 'apps/operacao/package.json' },
  { de: 'apps/operacao/prerequisitos.json' },
  { de: 'apps/operacao/src' },
  { de: 'apps/operacao/lancadores/grafite.ps1', para: 'grafite.ps1' },
  { de: 'apps/operacao/lancadores/instalar.ps1', para: 'instalar.ps1' },
  { de: 'apps/operacao/lancadores/preparar-servidor.ps1', para: 'preparar-servidor.ps1' },
  { de: 'apps/operacao/lancadores/Instalar-Grafite.cmd', para: 'Instalar-Grafite.cmd' },
  { de: 'apps/operacao/lancadores/Grafite.cmd', para: 'Grafite.cmd' },
  { de: 'apps/web/public/favicon.ico', para: 'grafite.ico' },
  { de: 'packages/db/package.json' },
  { de: 'packages/db/src' },
  { de: 'packages/db/migrations' },
  { de: 'packages/domain/package.json' },
  { de: 'packages/domain/src' },
  { de: 'packages/operacao/package.json' },
  { de: 'packages/operacao/src' },
  { de: 'apps/web/dist', para: 'web' },
  { de: 'apps/painel/dist', para: 'painel' },
  { de: 'docs/operacao' },
];

/** O que o pacote leva compilado, com o pacote que o compila. */
const COMPILADOS = [
  { pasta: 'apps/web/dist', nome: 'a web compilada', pacote: '@grafite/web' },
  { pasta: 'apps/painel/dist', nome: 'o painel compilado', pacote: '@grafite/painel' },
];

/** Os arquivos do pnpm que a instalação de produção pede, na raiz da montagem. */
const DO_PNPM = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'patches'];

const DE_TESTE = /\.test\.ts$/;
const naPasta = (raiz: string, caminho: string) => join(raiz, ...caminho.split('/'));

export interface ArquivoDoPacote {
  /** O arquivo no repositório. */
  de: string;
  /** O caminho no pacote, em barras normais. */
  para: string;
}

/** Os arquivos de uma pasta e das subpastas, sem o node_modules e sem os testes. */
async function arquivosDaPasta(pasta: string, prefixo: string): Promise<ArquivoDoPacote[]> {
  const lista: ArquivoDoPacote[] = [];
  for (const item of await readdir(pasta, { withFileTypes: true })) {
    const de = join(pasta, item.name);
    const para = `${prefixo}/${item.name}`;
    if (item.isDirectory()) {
      if (item.name !== 'node_modules') lista.push(...(await arquivosDaPasta(de, para)));
    } else if (item.isFile() && !DE_TESTE.test(item.name)) lista.push({ de, para });
  }
  return lista;
}

/** Os arquivos do repositório que vão no pacote, pelo caminho no pacote. */
export async function arquivosDoRepositorio(repositorio: string): Promise<ArquivoDoPacote[]> {
  for (const { pasta, nome, pacote } of COMPILADOS) {
    if (
      !(await stat(naPasta(repositorio, pasta)).then(
        (s) => s.isDirectory(),
        () => false,
      ))
    ) {
      throw new Error(`Falta ${nome} em ${pasta}: rode pnpm --filter ${pacote} build antes.`);
    }
  }
  const lista: ArquivoDoPacote[] = [];
  for (const { de, para = de } of CONTEUDO) {
    const origem = naPasta(repositorio, de);
    const informacoes = await stat(origem).catch(() => {
      throw new Error(`Falta ${de} no repositório.`);
    });
    if (informacoes.isDirectory()) lista.push(...(await arquivosDaPasta(origem, para)));
    else lista.push({ de: origem, para });
  }
  return lista.sort((a, b) => (a.para < b.para ? -1 : a.para > b.para ? 1 : 0));
}

export interface LinkDoPacote {
  caminho: string;
  alvo: string;
}

/**
 * Os arquivos e os links de uma pasta montada, pelos caminhos relativos a ela. Os links não são
 * seguidos: o readdir recursivo do Node entra nas junções, e o zip levaria os pacotes do workspace
 * duas vezes.
 */
export async function percorrerMontagem(
  pasta: string,
): Promise<{ arquivos: string[]; links: LinkDoPacote[] }> {
  const arquivos: string[] = [];
  const links: LinkDoPacote[] = [];
  async function percorrer(atual: string, prefixo: string) {
    for (const item of await readdir(atual, { withFileTypes: true })) {
      const caminho = join(atual, item.name);
      const relativo = prefixo === '' ? item.name : `${prefixo}/${item.name}`;
      if (item.isSymbolicLink()) {
        const alvo = resolve(dirname(caminho), (await readlink(caminho)).replace(/^\\\\\?\\/, ''));
        const noPacote = relative(pasta, alvo);
        if (noPacote.startsWith('..') || isAbsolute(noPacote)) {
          throw new Error(`O link ${relativo} aponta para fora do pacote: ${alvo}.`);
        }
        const alvoNoPacote = noPacote.split(sep).join('/');
        if (
          !(await stat(alvo).then(
            () => true,
            () => false,
          ))
        ) {
          throw new Error(
            `O link ${relativo} aponta para ${alvoNoPacote}, que não está no pacote.`,
          );
        }
        links.push({ caminho: relativo, alvo: alvoNoPacote });
      } else if (item.isDirectory()) await percorrer(caminho, relativo);
      else if (item.isFile()) arquivos.push(relativo);
    }
  }
  await percorrer(pasta, '');
  const ordem = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    arquivos: arquivos.sort(ordem),
    links: links.sort((a, b) => ordem(a.caminho, b.caminho)),
  };
}

/**
 * O lockfile só com os projetos que vão no pacote. Com o node-linker=hoisted, o pnpm instala as
 * dependências de todos os projetos do lockfile, mesmo com o --filter: sem a poda, a web e os
 * componentes iriam junto. Só as seções `importers` mudam.
 */
export function podarLockfile(texto: string, projetos: ReadonlySet<string>): string {
  const saida: string[] = [];
  let secao = '';
  let pulando = false;
  for (const linha of texto.split('\n')) {
    if (/^\S/.test(linha)) {
      secao = linha;
      pulando = false;
    } else if (secao === 'importers:') {
      const projeto = /^ {2}(\S+):$/.exec(linha)?.[1];
      if (projeto !== undefined) pulando = !projetos.has(projeto);
    }
    if (!pulando) saida.push(linha);
  }
  return saida.join('\n');
}

const VERSAO = /^\d+\.\d+\.\d+$/;

/** Recusa a versão pedida que não é a da API, que a saúde informa. */
export function conferirVersao(pedida: string, daApi: string): void {
  if (!VERSAO.test(pedida)) throw new Error(`A versão pedida, ${pedida}, não é uma versão x.y.z.`);
  if (pedida !== daApi) {
    throw new Error(
      `A versão pedida, ${pedida}, não é a da API, ${daApi}: mude a versão em apps/api/package.json ou peça a ${daApi}.`,
    );
  }
}

export const nomeDoPacote = (versao: string) => `grafite-${versao}-windows-x64.zip`;

/** Grava o pacote.json com os links, zipa a montagem e grava o .sha256 ao lado do zip. */
export async function montarZip({
  montagem,
  versao,
  saida,
}: {
  montagem: string;
  versao: string;
  saida: string;
}): Promise<{ zip: string; sha256: string; arquivos: number; links: number }> {
  const { arquivos, links } = await percorrerMontagem(montagem);
  await writeFile(join(montagem, 'pacote.json'), `${JSON.stringify({ versao, links }, null, 2)}\n`);
  await mkdir(saida, { recursive: true });
  const zip = join(saida, nomeDoPacote(versao));
  const nomes = ['pacote.json', ...arquivos.filter((arquivo) => arquivo !== 'pacote.json')];
  await ziparArquivos(montagem, nomes, zip);
  const sha256 = await sha256DoArquivo(zip);
  await writeFile(`${zip}.sha256`, `${sha256}  ${nomeDoPacote(versao)}\n`);
  // A release publica o atalho de instalação ao lado do zip, igual ao de dentro dele.
  if (arquivos.includes(ATALHO_DE_INSTALACAO)) {
    await copyFile(join(montagem, ATALHO_DE_INSTALACAO), join(saida, ATALHO_DE_INSTALACAO));
  }
  return { zip, sha256, arquivos: nomes.length, links: links.length };
}

/** O atalho de instalação, na raiz do pacote e ao lado do zip. */
const ATALHO_DE_INSTALACAO = 'Instalar-Grafite.cmd';

/** Copia um arquivo para a montagem; um .cmd vai com CRLF, que o cmd.exe exige. */
export async function copiarParaOPacote(de: string, para: string): Promise<void> {
  await mkdir(dirname(para), { recursive: true });
  if (!para.endsWith('.cmd')) {
    await copyFile(de, para);
    return;
  }
  await writeFile(para, (await readFile(de, 'utf8')).replace(/\r?\n/g, '\r\n'));
}

async function copiar(de: string, para: string): Promise<void> {
  if ((await stat(de)).isDirectory()) {
    await mkdir(para, { recursive: true });
    for (const item of await readdir(de)) await copiar(join(de, item), join(para, item));
    return;
  }
  await copiarParaOPacote(de, para);
}

export interface PedidoDoPacote {
  repositorio: string;
  versao: string;
  saida: string;
  /** O WinSW e o Caddy; sem eles, o pacote não instala, e só serve para testar a montagem. */
  ferramentas?: { winsw: string; caddy: string };
  escrever?: (texto: string) => void;
}

export async function empacotar({
  repositorio,
  versao,
  saida,
  ferramentas,
  escrever = (texto) => process.stdout.write(`${texto}\n`),
}: PedidoDoPacote) {
  const { version: daApi } = JSON.parse(
    await readFile(naPasta(repositorio, 'apps/api/package.json'), 'utf8'),
  ) as { version: string };
  conferirVersao(versao, daApi);
  const lista = await arquivosDoRepositorio(repositorio);

  const montagem = join(saida, `montagem-${versao}`);
  await rm(montagem, { recursive: true, force: true });
  for (const arquivo of DO_PNPM)
    await copiar(naPasta(repositorio, arquivo), join(montagem, arquivo));
  for (const { de, para } of lista) await copiar(de, naPasta(montagem, para));
  const projetos = new Set([
    '.',
    ...lista
      .filter(({ para }) => para.endsWith('/package.json'))
      .map(({ para }) => para.slice(0, -'/package.json'.length)),
  ]);
  const lockfile = join(montagem, 'pnpm-lock.yaml');
  await writeFile(lockfile, podarLockfile(await readFile(lockfile, 'utf8'), projetos));

  escrever('Instalando as dependências de produção na montagem...');
  // O pnpm do Windows é um .cmd, que só roda pelo shell; o comando não tem nada de fora.
  const comando = [
    'pnpm install --frozen-lockfile --prod --config.node-linker=hoisted',
    ...APPS.map((app) => `--filter "${app}..."`),
  ].join(' ');
  const instalacao = spawnSync(comando, {
    cwd: montagem,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, LEFTHOOK: '0' },
  });
  if (instalacao.status !== 0) throw new Error('A instalação de produção na montagem falhou.');
  // O que só a instalação usava não vai no pacote.
  for (const arquivo of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'patches']) {
    await rm(join(montagem, arquivo), { recursive: true, force: true });
  }

  if (ferramentas !== undefined) {
    await copiar(ferramentas.winsw, join(montagem, 'ferramentas', 'WinSW.exe'));
    await copiar(ferramentas.caddy, join(montagem, 'ferramentas', 'caddy.exe'));
  } else {
    escrever('Sem as ferramentas (--sem-ferramentas): este pacote não serve para instalar.');
  }

  const resultado = await montarZip({ montagem, versao, saida });
  await rm(montagem, { recursive: true, force: true });
  escrever(
    `Pacote ${resultado.zip} (${formatarTamanho((await stat(resultado.zip)).size)}): ${resultado.arquivos} arquivos e ${resultado.links} links do workspace.`,
  );
  escrever(`SHA-256: ${resultado.sha256}`);
  return resultado;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      versao: { type: 'string' },
      saida: { type: 'string' },
      winsw: { type: 'string' },
      caddy: { type: 'string' },
      'sem-ferramentas': { type: 'boolean' },
    },
  });
  const repositorio = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  if (!values.versao || !values.saida) {
    console.error(
      'Uso: node apps/operacao/scripts/empacotar.ts --versao <x.y.z> --saida <pasta> (--winsw <exe> --caddy <exe> | --sem-ferramentas)',
    );
    process.exit(2);
  }
  if (!values['sem-ferramentas'] && (!values.winsw || !values.caddy)) {
    console.error('Diga o --winsw e o --caddy, ou --sem-ferramentas para um pacote só de teste.');
    process.exit(2);
  }
  try {
    await empacotar({
      repositorio,
      versao: values.versao,
      saida: resolve(values.saida),
      ferramentas:
        values.winsw && values.caddy
          ? { winsw: resolve(values.winsw), caddy: resolve(values.caddy) }
          : undefined,
    });
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  }
}
