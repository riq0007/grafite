import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarCliente } from './cliente.ts';
import { type PedidoDeEnvio, transportarPeloNavegador } from './envio.ts';
import { miniaturasDaConta, miniaturasDaPessoa } from './fotos.ts';
import { pedir } from './pedir.ts';

afterEach(() => vi.unstubAllGlobals());

const PNG = () => new File([new Uint8Array([137, 80, 78, 71])], 'foto.png', { type: 'image/png' });

function montar(responder: (pedido: Request) => Response | Promise<Response>) {
  const pedidos: Request[] = [];
  const aoPerderASessao = vi.fn();
  const cliente = criarCliente({
    csrf: () => 'token-csrf',
    aoPerderASessao,
    aoMudarOAcesso: () => {},
    buscar: async (pedido) => {
      pedidos.push(pedido);
      return responder(pedido);
    },
  });
  return { cliente, pedidos, aoPerderASessao };
}

describe('enviarArquivo', () => {
  it('envia os bytes crus, com o CSRF, e devolve o que a API respondeu', async () => {
    const { cliente, pedidos } = montar(() => Response.json({ foto: { id: 'f1' } }));
    const progresso = vi.fn();
    const resposta = await cliente.enviarArquivo('/conta/foto', PNG(), progresso);
    expect(resposta.data).toEqual({ foto: { id: 'f1' } });
    const [pedido] = pedidos;
    expect(pedido?.method).toBe('PUT');
    expect(new URL(pedido?.url ?? '').pathname).toBe('/api/conta/foto');
    expect(pedido?.headers.get('x-grafite-csrf')).toBe('token-csrf');
    expect(pedido?.headers.get('content-type')).toBe('application/octet-stream');
    expect(new Uint8Array(await (pedido as Request).arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
    expect(progresso).toHaveBeenLastCalledWith(100);
  });

  it('envia num POST quando pedido, como a planilha da importação', async () => {
    const { cliente, pedidos } = montar(() => Response.json({ id: 'i1' }, { status: 201 }));
    const resposta = await cliente.enviarArquivo('/ativos/importacoes', PNG(), vi.fn(), 'POST');
    expect(resposta.data).toEqual({ id: 'i1' });
    expect(pedidos[0]?.method).toBe('POST');
  });

  it('a recusa chega como as das outras requisições, com o texto da API', async () => {
    const { cliente } = montar(() =>
      Response.json(
        {
          type: 'urn:grafite:problema:formato-nao-aceito',
          title: 'Formato não aceito',
          status: 415,
          detail: 'Formato não aceito. Envie uma imagem PNG, JPG, WebP, AVIF ou SVG.',
          codigoDeRastreio: 'R7K2-9QXM',
        },
        { status: 415 },
      ),
    );
    const resultado = await pedir(
      () => cliente.enviarArquivo('/conta/foto', PNG(), () => {}),
      'trocar a foto',
    );
    expect(resultado).toMatchObject({
      erro: 'Formato não aceito. Envie uma imagem PNG, JPG, WebP, AVIF ou SVG.',
    });
  });

  it('sem sessão, avisa a sessão, como as outras requisições', async () => {
    const { cliente, aoPerderASessao } = montar(() =>
      Response.json(
        {
          type: 'urn:grafite:problema:sem-sessao',
          title: 'Sem sessão',
          status: 401,
          detail: 'Entre de novo.',
          codigoDeRastreio: 'R7K2-9QXM',
        },
        { status: 401 },
      ),
    );
    await cliente.enviarArquivo('/conta/foto', PNG(), () => {});
    expect(aoPerderASessao).toHaveBeenCalledOnce();
  });
});

describe('transportarPeloNavegador', () => {
  /** Um XMLHttpRequest simulado, que guarda o pedido e deixa o teste mandar o progresso. */
  class XhrSimulado {
    static ultimo: XhrSimulado;
    metodo = '';
    endereco = '';
    cabecalhos: Record<string, string> = {};
    corpo: unknown;
    status = 0;
    responseText = '';
    readonly ouvintes = new Map<string, (evento: ProgressEvent) => void>();
    readonly upload = {
      addEventListener: (tipo: string, ouvinte: (evento: ProgressEvent) => void) =>
        this.ouvintes.set(`upload:${tipo}`, ouvinte),
    };
    constructor() {
      XhrSimulado.ultimo = this;
    }
    open(metodo: string, endereco: string) {
      this.metodo = metodo;
      this.endereco = endereco;
    }
    setRequestHeader(nome: string, valor: string) {
      this.cabecalhos[nome] = valor;
    }
    addEventListener(tipo: string, ouvinte: (evento: ProgressEvent) => void) {
      this.ouvintes.set(tipo, ouvinte);
    }
    getAllResponseHeaders() {
      return 'content-type: application/json\r\n';
    }
    send(corpo: unknown) {
      this.corpo = corpo;
    }
    disparar(tipo: string, evento = new ProgressEvent(tipo)) {
      this.ouvintes.get(tipo)?.(evento);
    }
  }

  it('informa o progresso do envio e devolve a resposta', async () => {
    vi.stubGlobal('XMLHttpRequest', XhrSimulado);
    const arquivo = PNG();
    const progresso = vi.fn();
    const pedido: PedidoDeEnvio = {
      metodo: 'PUT',
      endereco: '/api/conta/foto',
      corpo: arquivo,
      cabecalhos: { 'x-grafite-csrf': 'token-csrf' },
      aoProgredir: progresso,
    };
    const resposta = transportarPeloNavegador(pedido);
    const xhr = XhrSimulado.ultimo;
    expect([xhr.metodo, xhr.endereco, xhr.cabecalhos, xhr.corpo]).toEqual([
      'PUT',
      '/api/conta/foto',
      { 'x-grafite-csrf': 'token-csrf' },
      arquivo,
    ]);
    xhr.disparar(
      'upload:progress',
      new ProgressEvent('progress', { lengthComputable: true, loaded: 2, total: 4 }),
    );
    expect(progresso).toHaveBeenCalledWith(50);
    xhr.status = 200;
    xhr.responseText = '{"foto":{"id":"f1"}}';
    xhr.disparar('load');
    const recebida = await resposta;
    expect(recebida.status).toBe(200);
    expect(await recebida.json()).toEqual({ foto: { id: 'f1' } });
  });

  it('sem rede, o envio falha como o fetch', async () => {
    vi.stubGlobal('XMLHttpRequest', XhrSimulado);
    const resposta = transportarPeloNavegador({
      metodo: 'PUT',
      endereco: '/api/conta/foto',
      corpo: PNG(),
      cabecalhos: {},
      aoProgredir: () => {},
    });
    XhrSimulado.ultimo.disparar('error');
    await expect(resposta).rejects.toBeInstanceOf(TypeError);
  });
});

describe('endereços das miniaturas', () => {
  it('monta as miniaturas da foto da pessoa e da própria conta pelo tamanho', () => {
    expect(miniaturasDaPessoa('p1', { id: 'f1' })).toEqual({
      64: '/api/pessoas/p1/foto/f1/64',
      128: '/api/pessoas/p1/foto/f1/128',
      256: '/api/pessoas/p1/foto/f1/256',
      512: '/api/pessoas/p1/foto/f1/512',
    });
    expect(miniaturasDaConta({ id: 'f2' })?.[128]).toBe('/api/conta/foto/f2/128');
  });

  it('sem foto, não há miniaturas', () => {
    expect(miniaturasDaPessoa('p1', null)).toBeUndefined();
    expect(miniaturasDaConta(null)).toBeUndefined();
  });
});
