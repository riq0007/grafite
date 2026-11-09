// As peças do Windows que a preparação do servidor usa (change instalador-e-menu-da-operacao,
// design, decisão 3): os discos fixos e os serviços do Windows que não são do Grafite, como o
// PostgreSQL da produção e o IIS. Os testes as simulam.
import { readdir } from 'node:fs/promises';
import type { ExecutarProcesso, ResultadoDaFerramenta } from '@grafite/operacao';

export interface Discos {
  /** As letras dos discos fixos do servidor, como C e D. Um D: de CD ou de rede não conta. */
  fixos(): Promise<string[]>;
  /** Se a pasta existe e tem alguma coisa dentro. */
  temArquivos(pasta: string): Promise<boolean>;
}

export interface ServicoDoSistema {
  nome: string;
  rodando: boolean;
}

export interface ServicosDoSistema {
  /** Os serviços cujo nome começa pelo prefixo, com o estado de cada um. */
  listar(prefixo: string): Promise<ServicoDoSistema[]>;
  parar(nome: string): Promise<void>;
  reiniciar(nome: string): Promise<void>;
  /** O início do serviço com o Windows. */
  inicio(nome: string, modo: 'automatico' | 'desligado'): Promise<void>;
}

/** Um texto entre aspas simples do PowerShell. */
const entreAspas = (texto: string) => `'${texto.replaceAll("'", "''")}'`;

const powershell = (executar: ExecutarProcesso, comando: string) =>
  executar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando], {
    env: process.env,
  });

async function conferir(acao: string, resultado: Promise<ResultadoDaFerramenta>): Promise<string> {
  const { codigo, saida, erro } = await resultado;
  if (codigo !== 0) throw new Error(`Não foi possível ${acao}: ${(erro || saida).trim()}`);
  return saida;
}

export function discosDoSistema(executar: ExecutarProcesso): Discos {
  return {
    async fixos() {
      const saida = await conferir(
        'listar os discos do servidor',
        powershell(
          executar,
          "$ProgressPreference = 'SilentlyContinue'; Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { $_.DeviceID }",
        ),
      );
      return saida
        .split(/\r?\n/)
        .map((linha) => /^([a-z]):$/i.exec(linha.trim())?.[1]?.toUpperCase())
        .filter((letra) => letra !== undefined);
    },
    async temArquivos(pasta) {
      try {
        return (await readdir(pasta)).length > 0;
      } catch (erro) {
        const codigo = (erro as NodeJS.ErrnoException).code;
        if (codigo === 'ENOENT') return false;
        // Um arquivo no lugar da pasta também não serve para os dados.
        if (codigo === 'ENOTDIR') return true;
        throw erro;
      }
    },
  };
}

export function servicosDoSistema(executar: ExecutarProcesso): ServicosDoSistema {
  return {
    async listar(prefixo) {
      const saida = await conferir(
        `listar os serviços ${prefixo}`,
        powershell(
          executar,
          `Get-Service -Name ${entreAspas(`${prefixo}*`)} -ErrorAction SilentlyContinue | ForEach-Object { $_.Name + '|' + $_.Status }`,
        ),
      );
      return saida
        .split(/\r?\n/)
        .map((linha) => linha.trim())
        .filter((linha) => linha !== '')
        .map((linha) => {
          const [nome = '', estado] = linha.split('|');
          return { nome, rodando: estado === 'Running' };
        });
    },
    async parar(nome) {
      await conferir(
        `parar o serviço ${nome}`,
        powershell(executar, `Stop-Service -Name ${entreAspas(nome)} -Force -ErrorAction Stop`),
      );
    },
    async reiniciar(nome) {
      await conferir(
        `reiniciar o serviço ${nome}`,
        powershell(executar, `Restart-Service -Name ${entreAspas(nome)} -Force -ErrorAction Stop`),
      );
    },
    async inicio(nome, modo) {
      await conferir(
        `mudar o início do serviço ${nome}`,
        executar(
          'sc.exe',
          ['config', nome, 'start=', modo === 'automatico' ? 'auto' : 'disabled'],
          {
            env: process.env,
          },
        ),
      );
    },
  };
}
