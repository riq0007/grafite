// O código de uso único e a sessão do painel (change painel-da-operacao, design, decisão 2; spec
// painel-da-operacao, "Painel aberto só no próprio servidor"): a página troca o código pelo cookie
// HttpOnly e SameSite=Strict, uma vez só, e cada pedido da API sem a sessão é recusado sem rodar nada.
import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirServidorDoPainel, type ServidorDoPainel } from './servidor.ts';
import { comSessao, criarSessao } from './sessao.ts';

let servidor: ServidorDoPainel | undefined;

afterEach(async () => {
  await servidor?.fechar();
  servidor = undefined;
});

function pedir(
  porta: number,
  {
    metodo = 'GET',
    caminho,
    corpo,
    cookie,
  }: {
    metodo?: string;
    caminho: string;
    corpo?: unknown;
    cookie?: string;
  },
): Promise<{ status: number; cookie: string | undefined; corpo: unknown }> {
  return new Promise((resolver, recusar) => {
    const pedido = request(
      {
        host: '127.0.0.1',
        port: porta,
        method: metodo,
        path: caminho,
        headers: {
          host: `127.0.0.1:${porta}`,
          ...(cookie === undefined ? {} : { cookie }),
          ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
        },
      },
      (resposta) => {
        const partes: Buffer[] = [];
        resposta.on('data', (parte: Buffer) => partes.push(parte));
        resposta.on('end', () => {
          const texto = Buffer.concat(partes).toString('utf8');
          resolver({
            status: resposta.statusCode ?? 0,
            cookie: resposta.headers['set-cookie']?.[0],
            corpo: texto === '' ? undefined : JSON.parse(texto),
          });
        });
      },
    );
    pedido.on('error', recusar);
    if (corpo !== undefined) pedido.write(JSON.stringify(corpo));
    pedido.end();
  });
}

async function abrir() {
  const sessao = criarSessao();
  let chamadas = 0;
  servidor = await abrirServidorDoPainel({
    pagina: new Map(),
    api: comSessao(sessao, async () => {
      chamadas += 1;
      return { status: 200, corpo: { estado: 'ok' } };
    }),
  });
  return { sessao, porta: servidor.porta, chamadas: () => chamadas };
}

describe('a sessão do painel', () => {
  it('o código é aleatório, de 32 bytes, e cada abertura tem o dela', () => {
    const { codigo } = criarSessao();
    expect(Buffer.from(codigo, 'base64url')).toHaveLength(32);
    expect(criarSessao().codigo).not.toBe(codigo);
  });

  it('Pedido sem o código: a API recusa o pedido sem a sessão, sem rodar nada', async () => {
    const { porta, chamadas } = await abrir();
    const semSessao = await pedir(porta, { caminho: '/api/estado' });
    expect(semSessao.status).toBe(401);
    expect(semSessao.corpo).toEqual({
      mensagem: 'Abra o painel pelo comando: o endereço que ele abre traz o código da sessão.',
    });
    const comOutra = await pedir(porta, {
      caminho: '/api/estado',
      cookie: 'grafite_painel=outra-sessao',
    });
    expect(comOutra.status).toBe(401);
    expect(chamadas()).toBe(0);
  });

  it('o código vira o cookie HttpOnly e SameSite=Strict uma vez só, e a sessão abre a API', async () => {
    const { sessao, porta, chamadas } = await abrir();
    const trocado = await pedir(porta, {
      metodo: 'POST',
      caminho: '/api/sessao',
      corpo: { codigo: sessao.codigo },
    });
    expect(trocado.status).toBe(200);
    expect(trocado.cookie).toMatch(
      /^grafite_painel=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict$/,
    );

    const deNovo = await pedir(porta, {
      metodo: 'POST',
      caminho: '/api/sessao',
      corpo: { codigo: sessao.codigo },
    });
    expect(deNovo.status).toBe(403);
    expect(deNovo.corpo).toEqual({
      mensagem: 'Este código já foi usado: abra o painel de novo pelo comando.',
    });

    const cookie = (trocado.cookie ?? '').split(';')[0] ?? '';
    const estado = await pedir(porta, { caminho: '/api/estado', cookie });
    expect(estado.status).toBe(200);
    expect(estado.corpo).toEqual({ estado: 'ok' });
    expect(chamadas()).toBe(1);
  });

  it('o código errado não abre a sessão', async () => {
    const { porta } = await abrir();
    const errado = await pedir(porta, {
      metodo: 'POST',
      caminho: '/api/sessao',
      corpo: { codigo: 'outro-codigo' },
    });
    expect(errado.status).toBe(403);
    expect(errado.cookie).toBeUndefined();
  });
});
