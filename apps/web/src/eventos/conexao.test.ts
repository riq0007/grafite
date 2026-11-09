import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarLojaDaSessao, type LojaDaSessao } from '../sessao/loja.ts';
import { CONTA_DE_EXEMPLO } from '../teste/sessao.ts';
import { criarCanalDeEventos, type EventoRecebido } from './canal.ts';
import { criarConexaoDeEventos, type FonteDeEventos } from './conexao.ts';

/** Um EventSource simulado: o teste abre, manda eventos e derruba a conexão. */
class FonteSimulada implements FonteDeEventos {
  readyState = 0;
  readonly ouvintes = new Map<string, Set<(evento: MessageEvent) => void>>();
  onerror: (() => void) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(tipo: string, ouvinte: (evento: MessageEvent) => void) {
    const doTipo = this.ouvintes.get(tipo) ?? new Set();
    doTipo.add(ouvinte);
    this.ouvintes.set(tipo, doTipo);
  }

  close() {
    this.readyState = 2;
  }

  /** O servidor aceitou a conexão. */
  abrir() {
    this.readyState = 1;
    for (const ouvinte of this.ouvintes.get('open') ?? []) ouvinte(new MessageEvent('open'));
  }

  get fechada() {
    return this.readyState === 2;
  }

  /** Uma mensagem do fluxo, com o `event`, o `data` e o `id`. */
  mandar(tipo: string, dados: unknown, id = '') {
    const mensagem = new MessageEvent(tipo, { data: JSON.stringify(dados), lastEventId: id });
    for (const ouvinte of this.ouvintes.get(tipo) ?? []) ouvinte(mensagem);
  }
}

let fontes: FonteSimulada[] = [];
let sessaoValendo = true;
let leituras = 0;
let loja: LojaDaSessao;
const paradas: Array<() => void> = [];

const evento = (tipo: EventoRecebido['tipo'], id: string): EventoRecebido => ({
  id,
  tipo,
  momento: '2026-10-07T12:00:00.000Z',
  alvo: { tipo: 'pessoa', id: '0199a6e0-0000-7000-8000-0000000000a1' },
});

const ultima = () => fontes.at(-1) as FonteSimulada;

function ocultar(oculta: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    value: oculta ? 'hidden' : 'visible',
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Liga a conexão a uma loja já validada, com a sessão valendo ou não, e devolve o canal. */
async function ligar({ sortear = () => 0 }: { sortear?: () => number } = {}) {
  loja = criarLojaDaSessao({
    buscar: async (pedido) => {
      const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
      if (caminho !== 'GET /api/sessao') throw new Error(`Sem resposta para ${caminho}.`);
      leituras++;
      return Response.json({
        organizacao: { nome: 'Empresa de exemplo', preferencias: {} },
        sessao: sessaoValendo && {
          conta: CONTA_DE_EXEMPLO,
          pendencia: null,
          csrf: 'csrf-de-teste',
          expiraEm: '2099-01-01T00:00:00.000Z',
          acesso: { permissoes: [] },
        },
      });
    },
  });
  await loja.validar();
  leituras = 0;
  const canal = criarCanalDeEventos();
  const recebidos: EventoRecebido[] = [];
  for (const tipo of ['pessoas.mudaram', 'acessos.mudaram', 'sessao.encerrada'] as const) {
    canal.ouvir(tipo, (recebido) => recebidos.push(recebido));
  }
  const aoReiniciar = vi.fn();
  const conexao = criarConexaoDeEventos({
    loja,
    canal,
    aoReiniciar,
    sortear,
    criarFonte: (url) => {
      const fonte = new FonteSimulada(url);
      fontes.push(fonte);
      return fonte;
    },
  });
  paradas.push(conexao.ligar(), () => loja.parar());
  return { canal, recebidos, aoReiniciar, conexao };
}

beforeEach(() => {
  vi.useFakeTimers();
  fontes = [];
  sessaoValendo = true;
  leituras = 0;
});

afterEach(() => {
  for (const parar of paradas.splice(0)) parar();
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('conexão de eventos da casca', () => {
  it('abre só com a sessão que vale, e fecha quando ela deixa de valer', async () => {
    sessaoValendo = false;
    await ligar();
    expect(fontes).toHaveLength(0);

    sessaoValendo = true;
    await loja.validar();
    expect(fontes).toHaveLength(1);
    expect(ultima().url).toBe('/api/eventos');

    sessaoValendo = false;
    await loja.validar();
    expect(ultima().fechada).toBe(true);
  });

  it('diz quando a conexão abriu: na abertura, e na hora se ela já abriu', async () => {
    const { conexao } = await ligar();
    const espera = { terminou: false };
    void conexao.aberta().then(() => {
      espera.terminou = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(espera.terminou).toBe(false);
    ultima().abrir();
    await vi.advanceTimersByTimeAsync(0);
    expect(espera.terminou).toBe(true);
    // Aberta uma vez, a reconexão do próprio navegador não a faz esperar de novo.
    ultima().readyState = 0;
    await expect(conexao.aberta()).resolves.toBeUndefined();
  });

  it('a conexão da sessão seguinte espera a sua própria abertura', async () => {
    const { conexao } = await ligar();
    ultima().abrir();
    sessaoValendo = false;
    await loja.validar();
    sessaoValendo = true;
    await loja.validar();
    expect(fontes).toHaveLength(2);
    const espera = { terminou: false };
    void conexao.aberta().then(() => {
      espera.terminou = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(espera.terminou).toBe(false);
    ultima().abrir();
    await vi.advanceTimersByTimeAsync(0);
    expect(espera.terminou).toBe(true);
  });

  it('publica cada evento no canal uma vez só, descartando os repetidos', async () => {
    const { recebidos } = await ligar();
    ultima().mandar('pessoas.mudaram', evento('pessoas.mudaram', 'e1'), 'e1');
    ultima().mandar('pessoas.mudaram', evento('pessoas.mudaram', 'e1'), 'e1');
    ultima().mandar('pessoas.mudaram', evento('pessoas.mudaram', 'e2'), 'e2');
    expect(recebidos.map(({ id }) => id)).toEqual(['e1', 'e2']);
  });

  it('fecha depois de 5 min oculta e, ao voltar, reabre de onde parou', async () => {
    await ligar();
    ultima().mandar('pessoas.mudaram', evento('pessoas.mudaram', 'e7'), 'e7');
    ocultar(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
    expect(ultima().fechada).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(ultima().fechada).toBe(true);

    ocultar(false);
    expect(fontes).toHaveLength(2);
    expect(ultima().url).toBe('/api/eventos?desde=e7');
  });

  it('oculta por menos de 5 min, a mesma conexão continua', async () => {
    await ligar();
    ocultar(true);
    await vi.advanceTimersByTimeAsync(60_000);
    ocultar(false);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fontes).toHaveLength(1);
    expect(ultima().fechada).toBe(false);
  });

  it('acessos.mudaram valida a sessão de novo depois da espera aleatória, de até 1 s', async () => {
    const { recebidos } = await ligar({ sortear: () => 0.5 });
    ultima().mandar('acessos.mudaram', evento('acessos.mudaram', 'e3'), 'e3');
    expect(recebidos).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(leituras).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(leituras).toBe(1);
  });

  it('modulos.mudaram valida a sessão de novo depois da espera aleatória, de até 1 s', async () => {
    await ligar({ sortear: () => 0.25 });
    ultima().mandar('modulos.mudaram', evento('modulos.mudaram', 'e9'), 'e9');
    await vi.advanceTimersByTimeAsync(249);
    expect(leituras).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(leituras).toBe(1);
  });

  it('sessao.encerrada valida a sessão, e sem ela a entrada aparece e a conexão fecha', async () => {
    await ligar();
    sessaoValendo = false;
    ultima().mandar('sessao.encerrada', evento('sessao.encerrada', 'e4'), 'e4');
    await vi.advanceTimersByTimeAsync(0);
    expect(loja.ler()).toMatchObject({ tipo: 'sem-sessao', terminou: true });
    expect(ultima().fechada).toBe(true);
  });

  it('o fim da sessão avisado pela conexão também valida a sessão', async () => {
    await ligar();
    sessaoValendo = false;
    ultima().mandar('sessao', {});
    await vi.advanceTimersByTimeAsync(0);
    expect(loja.ler().tipo).toBe('sem-sessao');
  });

  it('a mudança na própria pessoa ou na própria conta relê a sessão, e a de outra pessoa não', async () => {
    await ligar();
    const comAlvo = (id: string, alvo: EventoRecebido['alvo']) => ({
      ...evento('pessoas.mudaram', id),
      alvo,
    });
    ultima().mandar(
      'pessoas.mudaram',
      comAlvo('e5', { tipo: 'pessoa', id: CONTA_DE_EXEMPLO.pessoaId }),
      'e5',
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(leituras).toBe(1);
    ultima().mandar(
      'pessoas.mudaram',
      comAlvo('e6', { tipo: 'conta', id: CONTA_DE_EXEMPLO.id }),
      'e6',
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(leituras).toBe(2);
    ultima().mandar('pessoas.mudaram', comAlvo('e7', { tipo: 'pessoa', id: 'outra' }), 'e7');
    await vi.advanceTimersByTimeAsync(0);
    expect(leituras).toBe(2);
  });

  it('reiniciar invalida todas as consultas e valida a sessão', async () => {
    const { aoReiniciar } = await ligar();
    ultima().mandar('reiniciar', {});
    await vi.advanceTimersByTimeAsync(0);
    expect(aoReiniciar).toHaveBeenCalledOnce();
    expect(leituras).toBe(1);
  });

  it('a conexão recusada é tentada de novo depois, enquanto a sessão vale', async () => {
    await ligar();
    ultima().readyState = 2;
    ultima().onerror?.();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fontes).toHaveLength(2);
    expect(ultima().fechada).toBe(false);
  });
});
