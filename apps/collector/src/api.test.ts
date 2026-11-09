import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { criarClienteDaApi } from './api.ts';

const TOKEN = `token-do-teste-${'x'.repeat(40)}`;

let servidor: Server | undefined;
let pedidos: {
  metodo: string;
  caminho: string;
  cabecalhos: IncomingMessage['headers'];
  corpo: string;
}[] = [];

/** Um servidor de teste que responde como a API, guardando cada pedido. */
async function apiDeTeste(
  responder: (pedido: IncomingMessage, resposta: ServerResponse, corpo: string) => void,
) {
  pedidos = [];
  servidor = createServer((pedido, resposta) => {
    let corpo = '';
    pedido.on('data', (parte) => {
      corpo += parte;
    });
    pedido.on('end', () => {
      pedidos.push({
        metodo: pedido.method ?? '',
        caminho: pedido.url ?? '',
        cabecalhos: pedido.headers,
        corpo,
      });
      responder(pedido, resposta, corpo);
    });
  });
  await new Promise<void>((pronto) => servidor?.listen(0, '127.0.0.1', pronto));
  const { port } = servidor.address() as AddressInfo;
  return criarClienteDaApi({
    urlDaApi: `http://127.0.0.1:${port}`,
    endereco: 'grafite.empresa.local',
    token: TOKEN,
    versao: '0.3.0',
    tempoLimite: 300,
  });
}

const json = (resposta: ServerResponse, status: number, corpo: unknown) => {
  resposta.writeHead(status, { 'content-type': 'application/json' });
  resposta.end(JSON.stringify(corpo));
};

afterEach(async () => {
  await new Promise((fechado) => (servidor ? servidor.close(fechado) : fechado(undefined)));
  servidor = undefined;
});

describe('o cliente da API', () => {
  it('pede pelo endereço da organização, com o token e a versão, e lê a resposta', async () => {
    const configuracao = { faixas: ['10.0.0.0/24'], alvos: [], proximaEm: 300 };
    const api = await apiDeTeste((_, resposta) => json(resposta, 200, configuracao));
    expect(await api.configuracao()).toEqual({ tipo: 'ok', dados: configuracao });
    expect(pedidos).toMatchObject([
      {
        metodo: 'GET',
        caminho: '/api/coleta/configuracao',
        cabecalhos: {
          host: 'grafite.empresa.local',
          authorization: `Bearer ${TOKEN}`,
          'x-grafite-versao-do-coletor': '0.3.0',
        },
      },
    ]);
  });

  it('manda o lote em JSON', async () => {
    const api = await apiDeTeste((_, resposta) =>
      json(resposta, 200, { gravadas: 1, ignoradas: 0, repetido: false }),
    );
    const lote = { chave: '0199d3a0-0000-7000-8000-000000000001', leituras: [] };
    expect(await api.lote(lote)).toEqual({
      tipo: 'ok',
      dados: { gravadas: 1, ignoradas: 0, repetido: false },
    });
    expect(pedidos[0]).toMatchObject({ metodo: 'POST', caminho: '/api/coleta/lotes' });
    expect(pedidos[0]?.cabecalhos['content-type']).toBe('application/json');
    expect(JSON.parse(pedidos[0]?.corpo ?? '')).toEqual(lote);
  });

  it('diz quando o token é recusado e quando o pedido é recusado, com o motivo', async () => {
    const recusado = await apiDeTeste((_, resposta) =>
      json(resposta, 401, { detail: 'Token do coletor recusado.' }),
    );
    expect(await recusado.configuracao()).toEqual({ tipo: 'token-recusado' });
    await new Promise((fechado) => servidor?.close(fechado));
    const invalido = await apiDeTeste((_, resposta) =>
      json(resposta, 400, { detail: 'Leitura 2: o momento está mais de 5 minutos no futuro.' }),
    );
    expect(await invalido.lote({ chave: 'x', leituras: [] })).toEqual({
      tipo: 'recusado',
      motivo: 'Leitura 2: o momento está mais de 5 minutos no futuro.',
    });
  });

  it('trata o erro do servidor, a API fora do ar e a espera esgotada como indisponível', async () => {
    const comErro = await apiDeTeste((_, resposta) => json(resposta, 503, { detail: 'Fora.' }));
    expect(await comErro.configuracao()).toMatchObject({ tipo: 'indisponivel' });
    await new Promise((fechado) => servidor?.close(fechado));
    const lenta = await apiDeTeste(() => {
      // Nunca responde: a espera de 300 ms se esgota.
    });
    expect(await lenta.configuracao()).toMatchObject({ tipo: 'indisponivel' });
    const { port } = (servidor as Server).address() as AddressInfo;
    await new Promise((fechado) => servidor?.close(fechado));
    servidor = undefined;
    const foraDoAr = criarClienteDaApi({
      urlDaApi: `http://127.0.0.1:${port}`,
      endereco: 'grafite.empresa.local',
      token: TOKEN,
      versao: '0.3.0',
    });
    expect(await foraDoAr.configuracao()).toMatchObject({ tipo: 'indisponivel' });
  });
});
