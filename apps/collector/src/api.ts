// O cliente da API no coletor (spec coletor-local; design do P2a, decisões 1 e 8): cada pedido vai
// pelo endereço de acesso da organização, no cabeçalho Host, com o token e a versão do coletor. O
// `fetch` do Node ignora o Host pedido, então o pedido sai pelo `request` do `node:http` e do
// `node:https`, com o servername do endereço no TLS. A resposta vira o que o coletor faz com ela.
import { request as pedirHttp } from 'node:http';
import { request as pedirHttps } from 'node:https';

/** O que o coletor faz com a resposta: usa, para de coletar, descarta ou tenta de novo depois. */
export type RespostaDaApi<T> =
  | { tipo: 'ok'; dados: T }
  | { tipo: 'token-recusado' }
  | { tipo: 'recusado'; motivo: string }
  | { tipo: 'indisponivel'; motivo: string };

export interface OpcoesDoCliente {
  urlDaApi: string;
  endereco: string;
  token: string;
  versao: string;
  /** Em ms; o padrão é 10 s. */
  tempoLimite?: number;
}

const TEMPO_LIMITE = 10_000;

export function criarClienteDaApi({
  urlDaApi,
  endereco,
  token,
  versao,
  tempoLimite = TEMPO_LIMITE,
}: OpcoesDoCliente) {
  const base = new URL(urlDaApi);
  const seguro = base.protocol === 'https:';
  const prefixo = base.pathname.replace(/\/+$/, '');

  function pedir<T>(
    metodo: 'GET' | 'POST' | 'PUT',
    caminho: string,
    corpo?: unknown,
    {
      bytes,
      espera = tempoLimite,
      binario = false,
    }: { bytes?: { conteudo: Buffer; tipo: string }; espera?: number; binario?: boolean } = {},
  ) {
    const conteudo = bytes
      ? bytes.conteudo
      : corpo === undefined
        ? undefined
        : Buffer.from(JSON.stringify(corpo));
    const tipo = bytes?.tipo ?? 'application/json';
    return new Promise<RespostaDaApi<T>>((resolver) => {
      const opcoes = {
        method: metodo,
        hostname: base.hostname,
        port: base.port || (seguro ? 443 : 80),
        path: `${prefixo}/api${caminho}`,
        headers: {
          host: endereco,
          authorization: `Bearer ${token}`,
          'x-grafite-versao-do-coletor': versao,
          accept: 'application/json',
          ...(conteudo ? { 'content-type': tipo, 'content-length': conteudo.length } : {}),
        },
        ...(seguro ? { servername: endereco } : {}),
      };
      const pedido = (seguro ? pedirHttps : pedirHttp)(opcoes, (resposta) => {
        const partes: Buffer[] = [];
        resposta.on('data', (parte: Buffer) => partes.push(parte));
        resposta.on('end', () => {
          const status = resposta.statusCode ?? 0;
          // A resposta em bytes, como o ZIP do backup de uma operação (change p5b).
          if (binario && status >= 200 && status < 300) {
            return resolver({ tipo: 'ok', dados: Buffer.concat(partes) as T });
          }
          let lido: unknown = null;
          try {
            lido = JSON.parse(Buffer.concat(partes).toString('utf8'));
          } catch {
            // Sem JSON: o status decide.
          }
          if (status >= 200 && status < 300) return resolver({ tipo: 'ok', dados: lido as T });
          if (status === 401) return resolver({ tipo: 'token-recusado' });
          const detalhe = (lido as { detail?: unknown } | null)?.detail;
          const motivo = typeof detalhe === 'string' ? detalhe : `HTTP ${status}`;
          if (status >= 400 && status < 500) return resolver({ tipo: 'recusado', motivo });
          resolver({ tipo: 'indisponivel', motivo });
        });
        resposta.on('error', (erro) => resolver({ tipo: 'indisponivel', motivo: erro.message }));
      });
      pedido.setTimeout(espera, () => {
        pedido.destroy(new Error(`sem resposta em ${espera} ms`));
      });
      pedido.on('error', (erro) => resolver({ tipo: 'indisponivel', motivo: erro.message }));
      pedido.end(conteudo);
    });
  }

  return {
    configuracao: <T>() => pedir<T>('GET', '/coleta/configuracao'),
    lote: <T>(lote: unknown) => pedir<T>('POST', '/coleta/lotes', lote),
    // Os pedidos de trabalho, como o backup do Control iD (change p5a-backup-do-control-id).
    pedidos: <T>() => pedir<T>('GET', '/coleta/pedidos'),
    arquivoDoPedido: <T>(id: string, conteudo: Buffer) =>
      pedir<T>('PUT', `/coleta/pedidos/${id}/arquivo`, undefined, {
        bytes: { conteudo, tipo: 'application/zip' },
        espera: 300_000,
      }),
    falhaDoPedido: <T>(id: string, mensagem: string) =>
      pedir<T>('POST', `/coleta/pedidos/${id}/falha`, { mensagem }),
    zipDoPedido: (id: string) =>
      pedir<Buffer>('GET', `/coleta/pedidos/${id}/arquivo`, undefined, {
        binario: true,
        espera: 300_000,
      }),
    resultadoDoPedido: <T>(id: string, categorias: unknown[]) =>
      pedir<T>('POST', `/coleta/pedidos/${id}/resultado`, { categorias }),
  };
}

export type ClienteDaApi = ReturnType<typeof criarClienteDaApi>;
