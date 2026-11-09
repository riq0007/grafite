// O ping do coletor (spec disponibilidade-de-rede, "Ping"; design do P2a, decisão 8 e riscos): o
// comando do sistema, com um pacote e até 2 segundos de espera, que dispensa o socket ICMP cru que o
// serviço do Windows e o CI não dão. A saída muda com o idioma, então a leitura procura o que não se
// traduz:
// - a resposta é a linha com o `TTL=` ou, no IPv6 do Windows, que vem sem ele, a linha com o IP do
//   alvo e o tempo; a latência é o número antes de `ms`;
// - sem a resposta, a estatística com o `%` da perda dá offline, mesmo quando o Windows sai com 0
//   porque o roteador respondeu que o destino está inacessível;
// - sem nenhuma das duas, o código de saída decide: 0 é online, e outro é sem dado.
// O ping que não pôde ser executado dá "sem dado", nunca offline.
import { execFile } from 'node:child_process';
import type { LeituraParaEnviar } from './lotes.ts';

export type ResultadoDoPing =
  | { resultado: 'online'; latencia: number | null }
  | { resultado: 'offline' }
  | { resultado: 'sem-dado'; motivo: string };

export interface SaidaDoComando {
  /** A saída e os erros do comando, juntos. */
  saida: string;
  codigo: number;
}

/** Roda o comando; rejeita quando ele não pôde ser executado ou não terminou sozinho. */
export type ExecutarComando = (comando: string, argumentos: string[]) => Promise<SaidaDoComando>;

const TTL = /\bttl[=:]\s*\d+/i;
const TEMPO = /([=<])\s*(\d+(?:[.,]\d+)?)\s*ms\b/i;
const PERDA = /\d+(?:[.,]\d+)?\s*%/;
/** O comando nunca deveria passar disso: o ping espera 2 s. */
const TEMPO_LIMITE_DO_COMANDO = 10_000;

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function latenciaDa(linha: string): number | null {
  const tempo = TEMPO.exec(linha);
  if (!tempo) return null;
  // "tempo<1ms": abaixo de 1 ms, que o próprio Windows resume como 0.
  return tempo[1] === '<' ? 0 : Number((tempo[2] ?? '').replace(',', '.'));
}

export function lerSaidaDoPing(
  saida: string,
  { ip, codigo }: { ip: string; codigo: number },
): ResultadoDoPing {
  const linhas = saida.split(/\r?\n/);
  const doAlvo = new RegExp(`(?:^|[^\\w.:])${escapar(ip)}:`, 'i');
  const resposta = linhas.find(
    (linha) => TTL.test(linha) || (doAlvo.test(linha) && TEMPO.test(linha)),
  );
  if (resposta !== undefined) return { resultado: 'online', latencia: latenciaDa(resposta) };
  if (PERDA.test(saida)) return { resultado: 'offline' };
  if (codigo === 0) return { resultado: 'online', latencia: null };
  const motivo = linhas.map((linha) => linha.trim()).find((linha) => linha !== '');
  return {
    resultado: 'sem-dado',
    motivo: motivo ?? `O ping terminou com o código ${codigo}, sem dizer o motivo.`,
  };
}

/** Um pacote e até 2 segundos de espera, no formato do Windows ou no do Linux e do BusyBox. */
export function argumentosDoPing(ip: string, plataforma: NodeJS.Platform): string[] {
  return plataforma === 'win32' ? ['-n', '1', '-w', '2000', ip] : ['-c', '1', '-W', '2', ip];
}

/** Roda o comando do sistema, com a saída em inglês no Linux; o código de erro não é falha. */
export const executarComando: ExecutarComando = (comando, argumentos) =>
  new Promise((resolver, rejeitar) => {
    execFile(
      comando,
      argumentos,
      {
        timeout: TEMPO_LIMITE_DO_COMANDO,
        windowsHide: true,
        env: { ...process.env, LC_ALL: 'C' },
      },
      (erro, saida, erros) => {
        if (erro && typeof erro.code !== 'number') return rejeitar(erro);
        resolver({ saida: `${saida}${erros}`, codigo: erro ? Number(erro.code) : 0 });
      },
    );
  });

export async function executarPing(
  ip: string,
  {
    executar = executarComando,
    plataforma = process.platform,
  }: { executar?: ExecutarComando; plataforma?: NodeJS.Platform } = {},
): Promise<ResultadoDoPing> {
  try {
    const { saida, codigo } = await executar('ping', argumentosDoPing(ip, plataforma));
    return lerSaidaDoPing(saida, { ip, codigo });
  } catch (erro) {
    return { resultado: 'sem-dado', motivo: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** O ping vira a disponibilidade e, só quando online, a latência (design do P2a, decisão 4). */
export function leiturasDoPing(
  ativoId: string,
  ping: ResultadoDoPing,
  momento: Date,
): LeituraParaEnviar[] {
  const quando = momento.toISOString();
  const disponibilidade: LeituraParaEnviar = {
    ativoId,
    metrica: 'rede.disponibilidade',
    momento: quando,
    valor: ping.resultado === 'sem-dado' ? null : ping.resultado,
  };
  if (ping.resultado !== 'online') return [disponibilidade];
  return [
    disponibilidade,
    { ativoId, metrica: 'rede.latencia', momento: quando, valor: ping.latencia },
  ];
}
