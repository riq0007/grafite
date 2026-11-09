// Proteção das escritas e limite de requisições (design do F2a, decisão 9). Uma escrita que vem de
// outro site, pela origem que o navegador informa, é recusada; uma escrita com sessão precisa do
// token dela no cabeçalho x-grafite-csrf. As rotas só aceitam JSON, então um formulário de outro
// site nem chega até elas sem a verificação prévia do navegador.
import { timingSafeEqual } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ProblemaDaApi } from './problemas.ts';

const ESCRITAS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MINUTO = 60_000;

/** O limite da entrada e do código do segundo passo, por IP: o `config.rateLimit` dessas rotas. */
export const LIMITE_DA_ENTRADA = { max: 20, timeWindow: MINUTO };
const LIMITE_GERAL = { max: 600, timeWindow: MINUTO };

/** O navegador diz de onde a requisição vem: o Sec-Fetch-Site e, nos mais antigos, a Origin. */
function deOutroSite(requisicao: FastifyRequest): boolean {
  const site = requisicao.headers['sec-fetch-site'];
  if (site !== undefined) return site !== 'same-origin';
  const origem = requisicao.headers.origin;
  if (origem === undefined) return false;
  return !doMesmoHost(origem, requisicao.host);
}

function tokenConfere(recebido: string | string[] | undefined, esperado: string): boolean {
  if (typeof recebido !== 'string') return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

const recusa = (detalhe: string) =>
  new ProblemaDaApi({ codigo: 'origem-recusada', status: 403, titulo: 'Origem recusada', detalhe });

function doMesmoHost(origem: string, host: string): boolean {
  try {
    return new URL(origem).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * A conexão WebSocket só passa da mesma origem (change acesso-remoto-vnc, design, decisão 2): o GET
 * da troca do protocolo não passa pela proteção das escritas, e o navegador sempre manda a Origin.
 */
export async function exigirMesmaOrigem(requisicao: FastifyRequest) {
  const origem = requisicao.headers.origin;
  if (origem === undefined || !doMesmoHost(origem, requisicao.host)) {
    throw recusa('A conexão veio de outro site.');
  }
}

export interface OpcoesDaProtecao {
  /** O token CSRF da sessão da requisição, ou `null` sem sessão. */
  tokenEsperado: (requisicao: FastifyRequest) => string | null;
}

/** As escritas do escopo só passam da mesma origem e, com sessão, com o token dela. */
export function protegerEscritas(escopo: FastifyInstance, { tokenEsperado }: OpcoesDaProtecao) {
  escopo.addHook('onRequest', async (requisicao) => {
    if (!ESCRITAS.has(requisicao.method)) return;
    if (deOutroSite(requisicao)) throw recusa('A requisição veio de outro site.');
    const esperado = tokenEsperado(requisicao);
    if (esperado !== null && !tokenConfere(requisicao.headers['x-grafite-csrf'], esperado)) {
      throw recusa('Falta o token da sessão nesta requisição.');
    }
  });
}

/** O limite geral por IP, em memória (um processo só); as rotas de entrada pedem o mais estreito. */
export async function registrarLimiteDeRequisicoes(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: true,
    ...LIMITE_GERAL,
    errorResponseBuilder: (_requisicao, contexto) =>
      new ProblemaDaApi({
        codigo: 'muitas-requisicoes',
        status: 429,
        titulo: 'Muitas requisições',
        detalhe: `Muitas requisições. Tente de novo em ${Math.max(1, Math.ceil(contexto.ttl / 1000))} s.`,
      }),
  });
}
