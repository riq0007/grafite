// O servidor mínimo do painel (change painel-da-operacao, design, decisão 1; spec painel-da-operacao,
// "Painel aberto só no próprio servidor"): o node:http em 127.0.0.1, os arquivos da página por uma
// lista fechada, o corpo dos pedidos limitado e a recusa do Host e da origem que não são os dele.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirServidorDoPainel, lerPagina, type ServidorDoPainel } from './servidor.ts';

let servidor: ServidorDoPainel | undefined;

afterEach(async () => {
  await servidor?.fechar();
  servidor = undefined;
});

const PAGINA = new Map([
  ['/index.html', { tipo: 'text/html; charset=utf-8', conteudo: Buffer.from('<p>Painel</p>') }],
  ['/assets/painel.js', { tipo: 'text/javascript', conteudo: Buffer.from('console.log(1)') }],
]);

interface Resposta {
  status: number;
  cabecalhos: Record<string, string | string[] | undefined>;
  corpo: string;
}

/** Um pedido cru, com o Host e a origem que o teste quiser. */
function pedir(
  porta: number,
  {
    metodo = 'GET',
    caminho = '/',
    host,
    origem,
    corpo,
  }: {
    metodo?: string;
    caminho?: string;
    host?: string;
    origem?: string;
    corpo?: string;
  } = {},
): Promise<Resposta> {
  return new Promise((resolver, recusar) => {
    const pedido = request(
      {
        host: '127.0.0.1',
        port: porta,
        method: metodo,
        path: caminho,
        headers: {
          host: host ?? `127.0.0.1:${porta}`,
          ...(origem === undefined ? {} : { origin: origem }),
          ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
        },
      },
      (resposta) => {
        const partes: Buffer[] = [];
        resposta.on('data', (parte: Buffer) => partes.push(parte));
        resposta.on('end', () =>
          resolver({
            status: resposta.statusCode ?? 0,
            cabecalhos: resposta.headers,
            corpo: Buffer.concat(partes).toString('utf8'),
          }),
        );
      },
    );
    pedido.on('error', recusar);
    if (corpo !== undefined) pedido.write(corpo);
    pedido.end();
  });
}

describe('o servidor do painel', () => {
  it('atende só em 127.0.0.1, numa porta livre, e serve a página da lista fechada', async () => {
    servidor = await abrirServidorDoPainel({ pagina: PAGINA, api: async () => undefined });
    expect(servidor.endereco).toBe(`http://127.0.0.1:${servidor.porta}`);
    const raiz = await pedir(servidor.porta);
    expect(raiz.status).toBe(200);
    expect(raiz.corpo).toBe('<p>Painel</p>');
    expect(raiz.cabecalhos['content-type']).toBe('text/html; charset=utf-8');
    expect(raiz.cabecalhos['content-security-policy']).toContain("default-src 'self'");
    expect(raiz.cabecalhos['x-content-type-options']).toBe('nosniff');
    const script = await pedir(servidor.porta, { caminho: '/assets/painel.js' });
    expect(script.corpo).toBe('console.log(1)');
  });

  it('um caminho fora da lista é 404, sem ler nada do disco', async () => {
    servidor = await abrirServidorDoPainel({ pagina: PAGINA, api: async () => undefined });
    for (const caminho of ['/../operacao.json', '/assets/../../config.env', '/outro.html']) {
      expect((await pedir(servidor.porta, { caminho })).status, caminho).toBe(404);
    }
  });

  it('recusa o Host de outro nome, como o do DNS rebinding, e a origem de outro site', async () => {
    let chamadas = 0;
    servidor = await abrirServidorDoPainel({
      pagina: PAGINA,
      api: async () => {
        chamadas += 1;
        return { status: 200, corpo: { ok: true } };
      },
    });
    const { porta } = servidor;
    const outroHost = await pedir(porta, { host: `painel.atacante.com:${porta}` });
    expect(outroHost.status).toBe(421);
    expect((await pedir(porta, { host: `localhost:${porta}` })).status).toBe(421);
    const outraOrigem = await pedir(porta, {
      metodo: 'POST',
      caminho: '/api/estado',
      origem: 'https://atacante.com',
      corpo: '{}',
    });
    expect(outraOrigem.status).toBe(403);
    expect(chamadas).toBe(0);
    const daPagina = await pedir(porta, {
      metodo: 'POST',
      caminho: '/api/estado',
      origem: `http://127.0.0.1:${porta}`,
      corpo: '{}',
    });
    expect(daPagina.status).toBe(200);
    expect(JSON.parse(daPagina.corpo)).toEqual({ ok: true });
    expect(daPagina.cabecalhos['cache-control']).toBe('no-store');
    expect(chamadas).toBe(1);
  });

  it('limita o corpo dos pedidos e recusa o que não é JSON', async () => {
    servidor = await abrirServidorDoPainel({
      pagina: PAGINA,
      api: async ({ corpo }) => ({ status: 200, corpo: { recebido: corpo } }),
      limiteDoCorpo: 64,
    });
    const grande = await pedir(servidor.porta, {
      metodo: 'POST',
      caminho: '/api/tarefas',
      corpo: JSON.stringify({ texto: 'x'.repeat(100) }),
    });
    expect(grande.status).toBe(413);
    const quebrado = await pedir(servidor.porta, {
      metodo: 'POST',
      caminho: '/api/tarefas',
      corpo: '{nao e json',
    });
    expect(quebrado.status).toBe(400);
    const certo = await pedir(servidor.porta, {
      metodo: 'POST',
      caminho: '/api/tarefas',
      corpo: '{"a":1}',
    });
    expect(JSON.parse(certo.corpo)).toEqual({ recebido: { a: 1 } });
  });

  it('o pedido da API que nenhuma rota atende é 404', async () => {
    servidor = await abrirServidorDoPainel({ pagina: PAGINA, api: async () => undefined });
    expect((await pedir(servidor.porta, { caminho: '/api/nada' })).status).toBe(404);
  });
});

describe('a página compilada', () => {
  it('vira a lista fechada do servidor, com o tipo de cada arquivo, sem os mapas nem os ocultos', async () => {
    const pasta = await mkdtemp(join(tmpdir(), 'grafite-painel-'));
    try {
      await mkdir(join(pasta, 'assets'));
      await writeFile(join(pasta, 'index.html'), '<p>Painel</p>');
      await writeFile(join(pasta, 'assets', 'painel.js'), 'console.log(1)');
      await writeFile(join(pasta, 'assets', 'painel.js.map'), '{}');
      await writeFile(join(pasta, '.gitkeep'), '');
      const pagina = await lerPagina(pasta);
      expect([...pagina.keys()].sort()).toEqual(['/assets/painel.js', '/index.html']);
      expect(pagina.get('/assets/painel.js')?.tipo).toBe('text/javascript; charset=utf-8');
      expect(pagina.get('/index.html')?.conteudo.toString()).toBe('<p>Painel</p>');
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });
});
