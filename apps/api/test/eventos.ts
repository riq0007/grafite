// A conexão de eventos nos testes de integração: a API ouvindo numa porta e um cliente HTTP que lê o
// fluxo text/event-stream como o EventSource do navegador, mensagem a mensagem.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ApiDeTeste, Entrada } from './integracao.ts';

/** Uma mensagem do fluxo: um evento, com o id e os dados, ou um comentário, como o sinal de vida. */
export interface Mensagem {
  id?: string;
  evento?: string;
  dados?: unknown;
  comentario?: string;
  retry?: number;
}

export interface FluxoDeEventos {
  status: number;
  cabecalhos: http.IncomingHttpHeaders;
  /** As mensagens recebidas até agora, em ordem. */
  mensagens: Mensagem[];
  /** O corpo inteiro de uma resposta que não é o fluxo, como uma recusa. */
  corpo: () => string;
  /** Se o servidor terminou a resposta. */
  terminou: () => boolean;
  fechar: () => void;
}

function lerBloco(bloco: string): Mensagem {
  const mensagem: Mensagem = {};
  const dados: string[] = [];
  for (const linha of bloco.split('\n')) {
    if (linha.startsWith(':')) {
      mensagem.comentario = linha.slice(1).trim();
      continue;
    }
    const separador = linha.indexOf(':');
    const campo = separador < 0 ? linha : linha.slice(0, separador);
    const valor = separador < 0 ? '' : linha.slice(separador + 1).replace(/^ /, '');
    if (campo === 'id') mensagem.id = valor;
    if (campo === 'event') mensagem.evento = valor;
    if (campo === 'data') dados.push(valor);
    if (campo === 'retry') mensagem.retry = Number(valor);
  }
  if (dados.length > 0) mensagem.dados = JSON.parse(dados.join('\n'));
  return mensagem;
}

/** A porta em que a API ouve, abrindo-a na primeira vez. */
export async function portaDa(api: ApiDeTeste): Promise<number> {
  if (!api.app.server.listening) await api.app.listen({ port: 0, host: '127.0.0.1' });
  return (api.app.server.address() as AddressInfo).port;
}

/** Abre a conexão de eventos com a sessão dada, pelo endereço da organização. */
export async function abrirEventos(
  api: ApiDeTeste,
  host: string,
  { cookie }: Entrada,
  {
    caminho = '/eventos',
    cabecalhos = {},
  }: { caminho?: string; cabecalhos?: http.OutgoingHttpHeaders } = {},
): Promise<FluxoDeEventos> {
  const porta = await portaDa(api);
  return new Promise((resolve, reject) => {
    const pedido = http.get(
      { host: '127.0.0.1', port: porta, path: caminho, headers: { host, cookie, ...cabecalhos } },
      (resposta) => {
        const mensagens: Mensagem[] = [];
        let texto = '';
        let resto = '';
        let terminou = false;
        resposta.setEncoding('utf8');
        resposta.on('data', (pedaco: string) => {
          texto += pedaco;
          resto += pedaco;
          for (let fim = resto.indexOf('\n\n'); fim >= 0; fim = resto.indexOf('\n\n')) {
            mensagens.push(lerBloco(resto.slice(0, fim)));
            resto = resto.slice(fim + 2);
          }
        });
        resposta.on('end', () => {
          terminou = true;
        });
        resposta.on('error', () => {
          terminou = true;
        });
        resolve({
          status: resposta.statusCode ?? 0,
          cabecalhos: resposta.headers,
          mensagens,
          corpo: () => texto,
          terminou: () => terminou,
          fechar: () => pedido.destroy(),
        });
      },
    );
    pedido.on('error', reject);
  });
}
