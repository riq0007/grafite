import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type EstadoDaRede, vigiarARede } from './rede.ts';

interface Chamada {
  responder: (status: number) => void;
  falhar: () => void;
  sinal: AbortSignal;
}

/**
 * Servidor simulado: cada chamada fica pendente até o teste responder. Por padrão, o cancelamento
 * rejeita a chamada, como no fetch; `ignorarCancelamento` simula uma resposta que chega mesmo assim.
 */
function servidorSimulado({ ignorarCancelamento = false } = {}) {
  const chamadas: Chamada[] = [];
  const buscar = vi.fn(
    (_endereco: string, opcoes: RequestInit) =>
      new Promise<Response>((resolver, rejeitar) => {
        const sinal = opcoes.signal as AbortSignal;
        if (!ignorarCancelamento) {
          sinal.addEventListener('abort', () =>
            rejeitar(new DOMException('Conferência cancelada', 'AbortError')),
          );
        }
        chamadas.push({
          responder: (status) => resolver(new Response(null, { status })),
          falhar: () => rejeitar(new TypeError('Failed to fetch')),
          sinal,
        });
      }),
  );
  return { buscar, chamadas };
}

let parar: (() => void) | undefined;

function vigiar(opcoes?: { ignorarCancelamento?: boolean }) {
  const servidor = servidorSimulado(opcoes);
  const estados: EstadoDaRede[] = [];
  parar = vigiarARede({ buscar: servidor.buscar, aoMudar: (estado) => estados.push(estado) });
  return { ...servidor, estados, ultimo: () => estados.at(-1) };
}

const semRede = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
const comRede = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
const disparar = (alvo: EventTarget, nome: string) => alvo.dispatchEvent(new Event(nome));
const pagina = (estado: DocumentVisibilityState) => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(estado);
  disparar(document, 'visibilitychange');
};
/** Deixa as promessas pendentes andarem, sem passar tempo. */
const assentar = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  parar?.();
  parar = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('item de rede', () => {
  it('na abertura, confere o /api/health e fica conectado quando o servidor responde', async () => {
    const { buscar, chamadas, estados } = vigiar();
    expect(estados).toEqual(['verificando']);
    expect(buscar).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ cache: 'no-store' }),
    );
    chamadas[0]?.responder(200);
    await assentar();
    expect(estados).toEqual(['verificando', 'conectado']);
  });

  it('uma resposta de erro do servidor conta como sem conexão', async () => {
    const { chamadas, ultimo } = vigiar();
    chamadas[0]?.responder(503);
    await assentar();
    expect(ultimo()).toBe('sem-conexao');
  });

  it('uma falha de rede na conferência conta como sem conexão', async () => {
    const { chamadas, ultimo } = vigiar();
    chamadas[0]?.falhar();
    await assentar();
    expect(ultimo()).toBe('sem-conexao');
  });

  it('sem resposta em 10 s, desiste da conferência e fica sem conexão', async () => {
    const { chamadas, ultimo } = vigiar();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(ultimo()).toBe('verificando');
    await vi.advanceTimersByTimeAsync(1);
    expect(ultimo()).toBe('sem-conexao');
    expect(chamadas[0]?.sinal.aborted).toBe(true);
  });

  it('confere de novo a cada 50 s com a página visível', async () => {
    const { buscar, chamadas } = vigiar();
    chamadas[0]?.responder(200);
    await vi.advanceTimersByTimeAsync(49_999);
    expect(buscar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(buscar).toHaveBeenCalledTimes(2);
    chamadas[1]?.responder(200);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(buscar).toHaveBeenCalledTimes(3);
  });

  it('quando o servidor para de responder, mostra sem conexão em até 1 minuto', async () => {
    const { chamadas, ultimo } = vigiar();
    chamadas[0]?.responder(200);
    await assentar();
    expect(ultimo()).toBe('conectado');
    // A próxima conferência fica sem resposta: o servidor travou.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ultimo()).toBe('sem-conexao');
  });

  it('com a página oculta não confere, e confere na hora quando ela volta a aparecer', async () => {
    const { buscar, chamadas } = vigiar();
    chamadas[0]?.responder(200);
    await assentar();
    pagina('hidden');
    await vi.advanceTimersByTimeAsync(300_000);
    expect(buscar).toHaveBeenCalledTimes(1);
    pagina('visible');
    expect(buscar).toHaveBeenCalledTimes(2);
    chamadas[1]?.responder(200);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(buscar).toHaveBeenCalledTimes(3);
  });

  it('o navegador sem rede mostra sem conexão na hora, sem esperar o servidor', async () => {
    const { chamadas, ultimo } = vigiar();
    chamadas[0]?.responder(200);
    await assentar();
    semRede();
    disparar(window, 'offline');
    expect(ultimo()).toBe('sem-conexao');
  });

  it('abrindo sem rede, fica sem conexão e não chama o servidor', () => {
    semRede();
    const { buscar, estados } = vigiar();
    expect(estados).toEqual(['sem-conexao']);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('quando a rede volta, confere o servidor e só volta ao normal quando ele responde', async () => {
    semRede();
    const { buscar, chamadas, ultimo } = vigiar();
    comRede();
    disparar(window, 'online');
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(ultimo()).toBe('sem-conexao');
    chamadas[0]?.responder(200);
    await assentar();
    expect(ultimo()).toBe('conectado');
  });

  it('uma resposta que chega depois da perda de rede não mostra conectado', async () => {
    const { chamadas, ultimo } = vigiar({ ignorarCancelamento: true });
    semRede();
    disparar(window, 'offline');
    chamadas[0]?.responder(200);
    await assentar();
    expect(ultimo()).toBe('sem-conexao');
  });

  it('parar desliga as conferências e os eventos', async () => {
    const { buscar, chamadas, estados } = vigiar();
    chamadas[0]?.responder(200);
    await assentar();
    parar?.();
    await vi.advanceTimersByTimeAsync(300_000);
    semRede();
    disparar(window, 'offline');
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(estados).toEqual(['verificando', 'conectado']);
  });
});
