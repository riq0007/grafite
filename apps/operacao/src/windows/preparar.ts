// A preparação do servidor Windows na instalação pelo atalho (change instalador-e-menu-da-operacao,
// design, decisão 3; spec operacao-servicos, "Atalho de instalação"), antes das conferências de
// hoje, com a opção --preparar. O PostgreSQL 18 da produção que falta é instalado pelo instalador
// oficial da EDB, em silêncio:
// - a pasta dos dados é perguntada, no disco D: quando o servidor tem um, e recusada com arquivos;
// - a senha do postgres, digitada duas vezes, vai ao instalador num arquivo de opções, numa pasta só
//   dos administradores, apagada no fim e na execução seguinte, e nunca nos argumentos de um
//   processo; ela segue na memória até a instalação, que não a pergunta de novo;
// - depois, o servidor atende só no próprio computador e inicia com o Windows.
// Um PostgreSQL 18 que já existe fica como está; um de outra versão para tudo antes de mudar nada.
// O IIS que ocupa as portas do proxy é parado e deixa de iniciar com o Windows, com o sim de quem
// opera; a porta que continua ocupada, por ele ou por outro programa, para com a mensagem de hoje.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type ExecutarProcesso,
  type FerramentasDoPostgres,
  versaoDoPgDump,
} from '@grafite/operacao';
import {
  PG_BIN_PADRAO,
  PORTAS_DO_PROXY,
  SERVICO_DO_POSTGRES_DA_PRODUCAO,
  SERVICOS,
} from '../layout.ts';
import { restringirPasta } from './acl.ts';
import type { Baixador } from './baixador.ts';
import type { Console } from './console.ts';
import { instaladorConferido } from './instaladores.ts';
import { conferirPortasDoProxy, juntar, portasOcupadas } from './portas.ts';
import type { Prerequisitos } from './prerequisitos.ts';
import type { Discos, ServicosDoSistema } from './sistema.ts';

/** O serviço do IIS, o World Wide Web Publishing Service. */
const IIS = 'W3SVC';

/** Os programas do PostgreSQL 18, na pasta padrão do instalador oficial. */
const PROGRAMAS = 'C:\\Program Files\\PostgreSQL\\18';
const DADOS_NO_DISCO_D = 'D:\\PostgreSQL\\18\\data';
const DADOS_PADRAO = `${PROGRAMAS}\\data`;
const ARQUIVO_DAS_OPCOES = 'postgresql.opcoes';
const ATENDER_SO_NO_SERVIDOR =
  "listen_addresses = 'localhost'\t\t# só o próprio servidor (Grafite)";

export interface InstaladorDoPostgres {
  /** Roda o instalador da EDB em silêncio, com as opções do arquivo. */
  instalar(instalador: string, arquivoDeOpcoes: string): Promise<void>;
  /** Faz o servidor atender só no próprio computador, no postgresql.conf da pasta dos dados. */
  atenderSoNoServidor(pastaDosDados: string): Promise<void>;
}

/** O postgresql.conf com o listen_addresses só do próprio servidor, no lugar do do instalador. */
export function comListenAddressesLocal(conteudo: string): string {
  const ativa = /^[ \t]*listen_addresses[ \t]*=[^\r\n]*/m;
  if (ativa.test(conteudo)) return conteudo.replace(ativa, ATENDER_SO_NO_SERVIDOR);
  const fim = conteudo.includes('\r\n') ? '\r\n' : '\n';
  const comFim = conteudo === '' || conteudo.endsWith('\n') ? conteudo : `${conteudo}${fim}`;
  return `${comFim}${ATENDER_SO_NO_SERVIDOR}${fim}`;
}

export function instaladorDaEdb(executar: ExecutarProcesso): InstaladorDoPostgres {
  return {
    async instalar(instalador, arquivoDeOpcoes) {
      const { codigo, saida, erro } = await executar(
        instalador,
        ['--mode', 'unattended', '--unattendedmodeui', 'none', '--optionfile', arquivoDeOpcoes],
        { env: process.env },
      );
      if (codigo !== 0) {
        throw new Error(
          `O instalador do PostgreSQL terminou com o código ${codigo}: ${(erro || saida).trim()}`,
        );
      }
    },
    async atenderSoNoServidor(pastaDosDados) {
      const arquivo = join(pastaDosDados, 'postgresql.conf');
      await writeFile(arquivo, comListenAddressesLocal(await readFile(arquivo, 'utf8')));
    },
  };
}

/** As peças do Windows da preparação, que o grafite.ts monta no campo `windows` do ambiente. */
export interface PecasDaPreparacao {
  sistema: ServicosDoSistema;
  discos: Discos;
  instaladorDoPostgres: InstaladorDoPostgres;
  baixador: Baixador;
  /** A pasta do arquivo de opções, só dos administradores, apagada no fim e na execução seguinte. */
  pastaDaPreparacao: string;
}

export interface DependenciasDaPreparacao extends PecasDaPreparacao {
  console: Console;
  executar: ExecutarProcesso;
  /** As ferramentas do PostgreSQL de uma pasta de binários. */
  ferramentas: (pgBin: string) => FerramentasDoPostgres;
  prerequisitos: Prerequisitos;
  /** A pasta do zip, onde ficam os instaladores copiados por quem opera ou baixados. */
  pastaDoZip: string;
}

const postgres18Em = (ferramentas: FerramentasDoPostgres) =>
  versaoDoPgDump(ferramentas).then(
    ({ maior }) => maior === 18,
    () => false,
  );

/**
 * As tentativas de cada pergunta: sem um terminal, o console responde vazio quando a entrada acaba, e
 * a pergunta não repete para sempre.
 */
const TENTATIVAS = 3;

/** A senha nova do postgres, digitada duas vezes, sem eco. */
async function perguntarSenhaNova(console: Console): Promise<string> {
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const senha = await console.perguntarSegredo('Senha do usuário postgres do PostgreSQL 18');
    if (senha === '') {
      console.escrever('A senha não pode ficar em branco.');
      continue;
    }
    if ((await console.perguntarSegredo('Repita a senha do usuário postgres')) === senha) {
      return senha;
    }
    console.escrever('As duas senhas não são iguais. Digite de novo.');
  }
  throw new Error(
    'A senha do usuário postgres não foi confirmada depois de três tentativas. Nada foi instalado.',
  );
}

/** A pasta dos dados, vazia ou que ainda não existe. */
async function perguntarPastaDosDados(
  console: Console,
  discos: Discos,
  padrao: string,
): Promise<string> {
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const pasta = await console.perguntar('Pasta dos dados do PostgreSQL 18', padrao);
    if (!(await discos.temArquivos(pasta))) return pasta;
    console.escrever(
      `A pasta ${pasta} já tem arquivos: a pasta dos dados precisa estar vazia ou não existir.`,
    );
  }
  throw new Error(
    'Nenhuma pasta vazia foi informada para os dados do PostgreSQL depois de três tentativas. Nada foi instalado.',
  );
}

/**
 * Instala o PostgreSQL 18 da produção, se faltar. Devolve a senha do postgres quando instalou, para a
 * instalação seguir sem perguntá-la de novo.
 */
export async function prepararPostgres(
  dep: DependenciasDaPreparacao,
): Promise<{ senhaDoPostgres?: string }> {
  const { console, sistema, discos, prerequisitos } = dep;
  // O arquivo de opções que uma execução interrompida deixou sai antes de tudo.
  await rm(dep.pastaDaPreparacao, { recursive: true, force: true });

  if (await postgres18Em(dep.ferramentas(PG_BIN_PADRAO))) {
    console.escrever(`O PostgreSQL 18 já está instalado em ${PG_BIN_PADRAO}: fica como está.`);
    return {};
  }
  const existentes = await sistema.listar('postgresql');
  if (existentes.some(({ nome }) => nome === SERVICO_DO_POSTGRES_DA_PRODUCAO)) {
    console.escrever(
      `O PostgreSQL 18 já está instalado (o serviço ${SERVICO_DO_POSTGRES_DA_PRODUCAO}), fora da pasta padrão: fica como está, e a instalação pergunta a pasta dos programas dele.`,
    );
    return {};
  }
  const [outro] = existentes;
  if (outro !== undefined) {
    throw new Error(
      `Este servidor já tem outro PostgreSQL (o serviço ${outro.nome}), e a produção do Grafite precisa do PostgreSQL 18. O atalho não instala um segundo PostgreSQL: instale o 18 à mão e rode a instalação pelo comando, como diz o runbook.`,
    );
  }

  const padrao = (await discos.fixos()).includes('D') ? DADOS_NO_DISCO_D : DADOS_PADRAO;
  const pastaDosDados = await perguntarPastaDosDados(console, discos, padrao);
  const senha = await perguntarSenhaNova(console);
  const instalador = await instaladorConferido({
    prerequisito: prerequisitos.postgres,
    pastaDoZip: dep.pastaDoZip,
    baixador: dep.baixador,
    console,
  });

  try {
    await mkdir(dep.pastaDaPreparacao, { recursive: true });
    await restringirPasta(dep.executar, dep.pastaDaPreparacao);
    const opcoes = join(dep.pastaDaPreparacao, ARQUIVO_DAS_OPCOES);
    await writeFile(
      opcoes,
      [
        `superpassword=${senha}`,
        'serverport=5432',
        `prefix=${PROGRAMAS}`,
        `datadir=${pastaDosDados}`,
        `servicename=${SERVICO_DO_POSTGRES_DA_PRODUCAO}`,
        'enable-components=server,commandlinetools',
        'disable-components=pgAdmin,stackbuilder',
        '',
      ].join('\r\n'),
    );
    console.escrever(
      `Instalando o PostgreSQL ${prerequisitos.postgres.versao} em silêncio: isso leva alguns minutos.`,
    );
    await dep.instaladorDoPostgres.instalar(instalador, opcoes);
  } finally {
    await rm(dep.pastaDaPreparacao, { recursive: true, force: true });
  }

  await dep.instaladorDoPostgres.atenderSoNoServidor(pastaDosDados);
  await sistema.inicio(SERVICO_DO_POSTGRES_DA_PRODUCAO, 'automatico');
  await sistema.reiniciar(SERVICO_DO_POSTGRES_DA_PRODUCAO);
  console.escrever(
    `PostgreSQL ${prerequisitos.postgres.versao} instalado, com os dados em ${pastaDosDados}, atendendo só neste servidor.`,
  );
  return { senhaDoPostgres: senha };
}

/** Desliga o IIS que ocupa as portas do proxy, com o sim de quem opera, e confere as portas de novo. */
export async function prepararIis({
  console,
  executar,
  sistema,
}: {
  console: Console;
  executar: ExecutarProcesso;
  sistema: ServicosDoSistema;
}): Promise<void> {
  let ocupadas = await portasOcupadas(executar, PORTAS_DO_PROXY);
  if (ocupadas.length === 0) return;
  // Na retomada da instalação, o proxy do Grafite já rodando é quem segura as portas.
  const proxy = await sistema.listar(SERVICOS.proxy);
  if (proxy.some(({ nome, rodando }) => nome === SERVICOS.proxy && rodando)) return;
  const iis = (await sistema.listar(IIS)).find(({ nome }) => nome === IIS);
  if (iis?.rodando) {
    const portas = ocupadas.length === 1 ? 'a porta' : 'as portas';
    const resposta = await console.perguntar(
      `O IIS (serviço ${IIS}) ocupa ${portas} ${juntar(ocupadas)}, que o proxy do Grafite precisa. Parar o IIS e desligar o início automático dele? (sim/não)`,
      'não',
    );
    if (/^s(im)?$/i.test(resposta.trim())) {
      await sistema.parar(IIS);
      await sistema.inicio(IIS, 'desligado');
      console.escrever('IIS parado, sem iniciar com o Windows.');
      ocupadas = await portasOcupadas(executar, PORTAS_DO_PROXY);
    }
  }
  conferirPortasDoProxy(ocupadas);
}
