// O servidor do painel da operação (change painel-da-operacao, design, decisão 1; spec
// painel-da-operacao, "Painel aberto só no próprio servidor"): o node:http em 127.0.0.1, numa porta
// livre. Ele serve a página compilada por uma lista fechada, montada na partida, então nenhum caminho
// do pedido chega ao disco, e passa os pedidos de /api à API do painel, com o corpo limitado e em
// JSON. Todo pedido precisa do Host 127.0.0.1:<porta> e, quando há origem, da origem do painel:
// assim, um site aberto no navegador não fala com ele, nem pelo DNS rebinding.
import { readdir, readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, sep } from 'node:path';

export interface ArquivoDaPagina {
  tipo: string;
  conteudo: Buffer;
}

export interface PedidoDaApi {
  metodo: string;
  /** O caminho depois do /api, como /estado. */
  caminho: string;
  consulta: URLSearchParams;
  /** O corpo em JSON, ou `undefined` sem corpo. */
  corpo: unknown;
  cabecalhos: IncomingMessage['headers'];
  /** A resposta crua, para a rota que responde aos poucos, como o canal de eventos. */
  resposta: ServerResponse;
}

export interface RespostaDaApi {
  status: number;
  corpo?: unknown;
  cabecalhos?: Record<string, string>;
}

export interface OpcoesDoServidorDoPainel {
  /** Os arquivos da página, pelo caminho, como /index.html e /assets/x.js. */
  pagina: ReadonlyMap<string, ArquivoDaPagina>;
  /**
   * Atende um pedido do /api. `undefined` é a rota que não existe, e `'respondido'`, a que já
   * respondeu pela resposta crua.
   */
  api: (pedido: PedidoDaApi) => Promise<RespostaDaApi | 'respondido' | undefined>;
  /** O tamanho máximo do corpo de um pedido, em bytes. */
  limiteDoCorpo?: number;
  /** A porta; sem ela, uma livre. */
  porta?: number;
  /**
   * Onde escutar: 127.0.0.1, ou todas as interfaces do contêiner no Linux, cuja porta o lançador
   * publica só no 127.0.0.1 do servidor.
   */
  host?: string;
  /**
   * A origem aceita além da do painel: a do servidor da página no desenvolvimento, que repassa o
   * /api ao servidor simulado.
   */
  origemDoDesenvolvimento?: string;
}

export interface ServidorDoPainel {
  porta: number;
  /** O endereço do painel, como http://127.0.0.1:51234. */
  endereco: string;
  fechar(): Promise<void>;
}

const LIMITE_DO_CORPO = 64 * 1024;

/** Os tipos dos arquivos que a página compilada tem; o resto, como os mapas do código, fica fora. */
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

/** Os arquivos da página compilada, lidos uma vez na partida: a lista fechada do servidor. */
export async function lerPagina(pasta: string): Promise<Map<string, ArquivoDaPagina>> {
  const pagina = new Map<string, ArquivoDaPagina>();
  for (const relativo of await readdir(pasta, { recursive: true })) {
    const tipo = TIPOS[extname(relativo).toLowerCase()];
    const partes = relativo.split(sep);
    if (tipo === undefined || partes.some((parte) => parte.startsWith('.'))) continue;
    pagina.set(`/${partes.join('/')}`, { tipo, conteudo: await readFile(join(pasta, relativo)) });
  }
  return pagina;
}

// O estilo em linha aceito é só o que o usePress do React Aria põe no <head> (o touch-action dos
// elementos pressionáveis), pelo hash do texto dele: se uma versão nova o mudar, as pontas a ponta
// do painel reprovam pela recusa no console da página.
const SEGURANCA = {
  'content-security-policy':
    "default-src 'self'; style-src 'self' 'sha256-38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o='; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

class PedidoRecusado extends Error {
  readonly status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

function responderJson(
  resposta: ServerResponse,
  status: number,
  corpo: unknown,
  cabecalhos: Record<string, string> = {},
) {
  resposta.writeHead(status, {
    ...SEGURANCA,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...cabecalhos,
  });
  resposta.end(corpo === undefined ? undefined : JSON.stringify(corpo));
}

/** O corpo do pedido em JSON, até o limite. */
async function lerCorpo(pedido: IncomingMessage, limite: number): Promise<unknown> {
  const partes: Buffer[] = [];
  let tamanho = 0;
  for await (const parte of pedido) {
    tamanho += (parte as Buffer).length;
    if (tamanho > limite)
      throw new PedidoRecusado(413, 'O pedido passou do tamanho que o painel aceita.');
    partes.push(parte as Buffer);
  }
  if (tamanho === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch {
    throw new PedidoRecusado(400, 'O pedido não é um JSON.');
  }
}

export async function abrirServidorDoPainel({
  pagina,
  api,
  limiteDoCorpo = LIMITE_DO_CORPO,
  porta: portaPedida = 0,
  host: hostDeEscuta = '127.0.0.1',
  origemDoDesenvolvimento,
}: OpcoesDoServidorDoPainel): Promise<ServidorDoPainel> {
  let porta = 0;
  const servidor = createServer(async (pedido, resposta) => {
    try {
      const host = `127.0.0.1:${porta}`;
      if (pedido.headers.host !== host) {
        throw new PedidoRecusado(421, 'O painel só atende pelo endereço que o comando abriu.');
      }
      const origem = pedido.headers.origin;
      if (
        origem !== undefined &&
        origem !== `http://${host}` &&
        origem !== origemDoDesenvolvimento
      ) {
        throw new PedidoRecusado(403, 'O painel não atende pedidos de outro site.');
      }
      const url = new URL(pedido.url ?? '/', `http://${host}`);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        const corpo = await lerCorpo(pedido, limiteDoCorpo);
        const resultado = await api({
          metodo: pedido.method ?? 'GET',
          caminho: url.pathname.slice('/api'.length) || '/',
          consulta: url.searchParams,
          corpo,
          cabecalhos: pedido.headers,
          resposta,
        });
        if (resultado === 'respondido') return;
        if (resultado === undefined) throw new PedidoRecusado(404, 'Não há nada neste endereço.');
        responderJson(resposta, resultado.status, resultado.corpo, resultado.cabecalhos);
        return;
      }
      // A página: só os arquivos da lista, montada na partida; qualquer outro caminho é 404.
      const arquivo = pagina.get(url.pathname === '/' ? '/index.html' : url.pathname);
      if (arquivo === undefined || pedido.method !== 'GET') {
        throw new PedidoRecusado(404, 'Não há nada neste endereço.');
      }
      resposta.writeHead(200, {
        ...SEGURANCA,
        'content-type': arquivo.tipo,
        'cache-control': 'no-cache',
      });
      resposta.end(arquivo.conteudo);
    } catch (erro) {
      if (resposta.headersSent) {
        resposta.destroy();
        return;
      }
      if (erro instanceof PedidoRecusado) {
        responderJson(resposta, erro.status, { mensagem: erro.message });
        return;
      }
      responderJson(resposta, 500, {
        mensagem: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });
  await new Promise<void>((resolver, recusar) => {
    servidor.once('error', recusar);
    servidor.listen(portaPedida, hostDeEscuta, () => {
      servidor.off('error', recusar);
      resolver();
    });
  });
  porta = (servidor.address() as AddressInfo).port;
  return {
    porta,
    endereco: `http://127.0.0.1:${porta}`,
    fechar: () =>
      new Promise((resolver) => {
        servidor.closeAllConnections();
        servidor.close(() => resolver());
      }),
  };
}
