// Os serviços do Windows (design do F2d, decisão 2): cada um é um WinSW com o XML dele, que roda o
// Node com o config.env do ambiente, reinicia sozinho depois de uma falha e guarda o log com
// rotação por tamanho. Iniciar, parar e consultar passam pelo sc.exe, que também vale para o
// serviço do PostgreSQL do teste, registrado pelo pg_ctl. Os caminhos são os do Windows, onde o
// servidor roda.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, win32 } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { SERVICOS } from '../layout.ts';

export type ServicoDoGrafite = 'api-producao' | 'api-teste' | 'coletor' | 'proxy';

export interface DefinicaoDeServico {
  /** O nome do serviço no Windows, como `grafite`. */
  id: string;
  /** O nome que a lista de serviços mostra, como "Grafite". */
  nome: string;
  descricao: string;
  executavel: string;
  argumentos: string;
  pastaDeTrabalho: string;
  pastaDosLogs: string;
}

export interface FerramentasDosServicos {
  /** O node.exe que roda a API e o coletor. */
  node: string;
  /** O caddy.exe do pacote em uso. */
  caddy: string;
}

export function definicaoDoServico(
  servico: ServicoDoGrafite,
  raiz: string,
  { node, caddy }: FerramentasDosServicos,
): DefinicaoDeServico {
  const em = (...partes: string[]) => win32.join(raiz, ...partes);
  switch (servico) {
    case 'api-producao':
    case 'api-teste': {
      const ambiente = servico === 'api-producao' ? 'producao' : 'teste';
      const producao = ambiente === 'producao';
      return {
        id: producao ? SERVICOS.producao : SERVICOS.teste,
        nome: producao ? 'Grafite' : 'Grafite Teste',
        descricao: producao
          ? 'Grafite: a API e a web da produção, em 127.0.0.1:3000.'
          : 'Grafite: a API e a web do ambiente de teste, em 127.0.0.1:3001.',
        executavel: node,
        argumentos: `--env-file="${em(ambiente, 'config.env')}" "${em(ambiente, 'atual', 'apps', 'api', 'src', 'servidor.ts')}"`,
        pastaDeTrabalho: em(ambiente, 'atual'),
        pastaDosLogs: em(ambiente, 'logs'),
      };
    }
    case 'coletor':
      return {
        id: SERVICOS.coletor,
        nome: 'Grafite Coletor',
        descricao: 'Grafite: o coletor local da produção, em 127.0.0.1:3100.',
        executavel: node,
        argumentos: `--env-file="${em('producao', 'coletor.env')}" "${em('producao', 'atual', 'apps', 'collector', 'src', 'servidor.ts')}"`,
        pastaDeTrabalho: em('producao', 'atual'),
        pastaDosLogs: em('producao', 'logs'),
      };
    case 'proxy':
      return {
        id: SERVICOS.proxy,
        nome: 'Grafite Proxy',
        descricao: 'Grafite: o proxy HTTPS (Caddy), nas portas 80 e 443.',
        executavel: caddy,
        argumentos: `run --config "${em('caddy', 'Caddyfile')}" --adapter caddyfile --envfile "${em('caddy', 'config.env')}"`,
        pastaDeTrabalho: em('caddy'),
        pastaDosLogs: em('caddy', 'logs'),
      };
  }
}

/** O texto de um elemento do XML: as aspas ficam cruas, só o que abre marcação é escapado. */
const escapar = (texto: string) =>
  texto.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** O XML do WinSW: início automático, reinício 10 s depois de uma falha e log por tamanho. */
export function xmlDoWinSW(definicao: DefinicaoDeServico): string {
  return [
    '<service>',
    `  <id>${escapar(definicao.id)}</id>`,
    `  <name>${escapar(definicao.nome)}</name>`,
    `  <description>${escapar(definicao.descricao)}</description>`,
    `  <executable>${escapar(definicao.executavel)}</executable>`,
    `  <arguments>${escapar(definicao.argumentos)}</arguments>`,
    `  <workingdirectory>${escapar(definicao.pastaDeTrabalho)}</workingdirectory>`,
    '  <startmode>Automatic</startmode>',
    '  <onfailure action="restart" delay="10 sec"/>',
    '  <resetfailure>1 hour</resetfailure>',
    '  <stoptimeout>45 sec</stoptimeout>',
    `  <logpath>${escapar(definicao.pastaDosLogs)}</logpath>`,
    '  <log mode="roll-by-size">',
    '    <sizeThreshold>10240</sizeThreshold>',
    '    <keepFiles>8</keepFiles>',
    '  </log>',
    '</service>',
    '',
  ].join('\n');
}

export type EstadoDoServico = 'rodando' | 'parado' | 'mudando' | 'ausente';

export interface Servicos {
  /** Grava o XML e o WinSW com o nome do serviço e o instala; registrar de novo atualiza o XML. */
  registrar(definicao: DefinicaoDeServico): Promise<void>;
  iniciar(id: string): Promise<void>;
  /** Para o serviço e espera; o serviço já parado não é erro. */
  parar(id: string): Promise<void>;
  estado(id: string): Promise<EstadoDoServico>;
}

const NAO_EXISTE = 1060;
const JA_PARADO = 1062;
const JA_RODANDO = 1056;

export function servicosDoWindows({
  executar,
  pastaDosServicos,
  winsw,
  esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
  tentativas = 60,
}: {
  executar: ExecutarProcesso;
  pastaDosServicos: string;
  /** O WinSW do pacote, copiado com o nome de cada serviço. */
  winsw: string;
  esperar?: (ms: number) => Promise<void>;
  /** Quantas consultas, a 1 s uma da outra, até desistir de esperar. */
  tentativas?: number;
}): Servicos {
  const sc = (...argumentos: string[]) => executar('sc.exe', argumentos, { env: process.env });

  async function estado(id: string): Promise<EstadoDoServico> {
    const { codigo, saida } = await sc('query', id);
    if (codigo === NAO_EXISTE) return 'ausente';
    const situacao = /\b\d\s+(STOPPED|START_PENDING|STOP_PENDING|RUNNING|\w+)\b/.exec(saida)?.[1];
    if (situacao === 'RUNNING') return 'rodando';
    if (situacao === 'STOPPED') return 'parado';
    return 'mudando';
  }

  async function esperarAte(id: string, esperado: EstadoDoServico, verbo: string) {
    for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
      if ((await estado(id)) === esperado) return;
      await esperar(1000);
    }
    throw new Error(`O serviço ${id} não ficou ${verbo} a tempo. Veja o log dele na pasta logs.`);
  }

  return {
    async registrar(definicao) {
      await mkdir(pastaDosServicos, { recursive: true });
      await writeFile(join(pastaDosServicos, `${definicao.id}.xml`), xmlDoWinSW(definicao));
      const exe = join(pastaDosServicos, `${definicao.id}.exe`);
      await copyFile(winsw, exe);
      if ((await estado(definicao.id)) !== 'ausente') return;
      const { codigo, saida, erro } = await executar(exe, ['install'], { env: process.env });
      if (codigo !== 0) {
        throw new Error(
          `Não foi possível registrar o serviço ${definicao.nome}: ${(erro || saida).trim()}`,
        );
      }
    },

    async iniciar(id) {
      const { codigo, saida, erro } = await sc('start', id);
      if (codigo !== 0 && codigo !== JA_RODANDO) {
        throw new Error(`Não foi possível iniciar o serviço ${id}: ${(saida || erro).trim()}`);
      }
      await esperarAte(id, 'rodando', 'rodando');
    },

    async parar(id) {
      const { codigo, saida, erro } = await sc('stop', id);
      if (codigo !== 0 && codigo !== JA_PARADO) {
        throw new Error(`Não foi possível parar o serviço ${id}: ${(saida || erro).trim()}`);
      }
      await esperarAte(id, 'parado', 'parado');
    },

    estado,
  };
}

/** O reinício depois de uma falha: 10 s nas duas primeiras, 1 min nas outras, zerado em um dia. */
const REINICIO_NA_FALHA = [
  'reset=',
  '86400',
  'actions=',
  'restart/10000/restart/10000/restart/60000',
];

/**
 * Acerta um serviço registrado fora do WinSW, como o PostgreSQL: o nome na lista de serviços, a
 * descrição e o reinício depois de uma falha. Devolve `false` quando o serviço não existe.
 */
export async function configurarServicoDoWindows(
  executar: ExecutarProcesso,
  id: string,
  { nome, descricao }: { nome?: string; descricao?: string } = {},
): Promise<boolean> {
  const comandos = [
    ...(nome === undefined ? [] : [['config', id, 'DisplayName=', nome]]),
    ...(descricao === undefined ? [] : [['description', id, descricao]]),
    ['failure', id, ...REINICIO_NA_FALHA],
  ];
  for (const argumentos of comandos) {
    const { codigo, saida, erro } = await executar('sc.exe', argumentos, { env: process.env });
    if (codigo === NAO_EXISTE) return false;
    if (codigo !== 0) {
      throw new Error(`Não foi possível configurar o serviço ${id}: ${(saida || erro).trim()}`);
    }
  }
  return true;
}
