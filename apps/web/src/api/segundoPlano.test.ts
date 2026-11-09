import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarLojaDaSessao, type LojaDaSessao } from '../sessao/loja.ts';
import { criarCliente } from './cliente.ts';
import { TEMPO_SEM_INTERACAO, type VigiaDaInteracao, vigiarInteracao } from './segundoPlano.ts';

let vigia: VigiaDaInteracao | undefined;
let loja: LojaDaSessao | undefined;

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vigia?.parar();
  loja?.parar();
  vigia = undefined;
  loja = undefined;
  vi.useRealTimers();
});

describe('vigia da interação', () => {
  it('sem interação há 5 min, a página está em segundo plano', () => {
    vigia = vigiarInteracao();
    vi.advanceTimersByTime(TEMPO_SEM_INTERACAO - 1);
    expect(vigia.emSegundoPlano()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(vigia.emSegundoPlano()).toBe(true);
  });

  it.each([
    ['uma tecla', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))],
    ['um clique', () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))],
    ['um toque', () => document.body.dispatchEvent(new Event('touchstart', { bubbles: true }))],
    ['a rolagem', () => document.body.dispatchEvent(new Event('wheel', { bubbles: true }))],
  ])('depois de %s, deixa de estar em segundo plano', (_interacao, interagir) => {
    vigia = vigiarInteracao();
    vi.advanceTimersByTime(TEMPO_SEM_INTERACAO);
    interagir();
    expect(vigia.emSegundoPlano()).toBe(false);
  });

  it('depois de parar, a interação não conta mais', () => {
    vigia = vigiarInteracao();
    vigia.parar();
    vi.advanceTimersByTime(TEMPO_SEM_INTERACAO);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(vigia.emSegundoPlano()).toBe(true);
  });
});

describe('a marca de segundo plano nas requisições', () => {
  it('o cliente marca a requisição só em segundo plano', async () => {
    let segundoPlano = false;
    const pedidos: Request[] = [];
    const cliente = criarCliente({
      csrf: () => null,
      aoPerderASessao: () => {},
      aoMudarOAcesso: () => {},
      emSegundoPlano: () => segundoPlano,
      buscar: async (pedido) => {
        pedidos.push(pedido);
        return Response.json({});
      },
    });
    await cliente.GET('/conta');
    segundoPlano = true;
    await cliente.GET('/conta');
    expect(pedidos.map((pedido) => pedido.headers.get('x-grafite-segundo-plano'))).toEqual([
      null,
      '1',
    ]);
  });

  it('a loja da sessão marca as próprias requisições depois de 5 min sem interação', async () => {
    const pedidos: Request[] = [];
    loja = criarLojaDaSessao({
      buscar: async (pedido) => {
        pedidos.push(pedido);
        return Response.json({ organizacao: { nome: 'Empresa', preferencias: {} }, sessao: null });
      },
    });
    await loja.validar();
    await vi.advanceTimersByTimeAsync(TEMPO_SEM_INTERACAO);
    await loja.validar();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await loja.validar();
    expect(pedidos.map((pedido) => pedido.headers.get('x-grafite-segundo-plano'))).toEqual([
      null,
      '1',
      null,
    ]);
  });
});
