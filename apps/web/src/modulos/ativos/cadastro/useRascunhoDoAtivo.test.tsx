import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { comApi } from '../../../teste/provedores.tsx';
import { CADASTRO_VAZIO, type EstadoDoCadastro } from './rascunho.ts';
import { useRascunhoDoAtivo } from './useRascunhoDoAtivo.ts';

/** O servidor do teste: guarda os corpos dos PUT e os DELETE, e responde quando o teste manda. */
function criarServidor() {
  const guardados: unknown[] = [];
  let apagados = 0;
  let falhar = false;
  let segurar: Promise<void> | null = null;
  return {
    guardados,
    apagados: () => apagados,
    falhar: (sim: boolean) => {
      falhar = sim;
    },
    /** Segura as respostas dos PUT até a função devolvida ser chamada. */
    segurar: () => {
      let soltar = () => {};
      segurar = new Promise((resolver) => {
        soltar = resolver;
      });
      return () => {
        segurar = null;
        soltar();
      };
    },
    rotas: {
      'PUT /api/ativos/rascunho': async (pedido: Request) => {
        guardados.push(await pedido.json());
        if (segurar) await segurar;
        if (falhar) return new Response(null, { status: 503 });
        return Response.json({ atualizadoEm: new Date().toISOString() });
      },
      'DELETE /api/ativos/rascunho': () => {
        apagados += 1;
        return new Response(null, { status: 204 });
      },
    },
  };
}

const comTipo = (patrimonio: string): EstadoDoCadastro => ({
  ...CADASTRO_VAZIO,
  tipoId: 't-impressora',
  entradas: { 'ativo.patrimonio': patrimonio },
  etapa: 'identificacao',
});

let servidor: ReturnType<typeof criarServidor>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-18T17:32:00.000Z'));
  servidor = criarServidor();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const montar = (guardadoEm: string | null = null) =>
  renderHook(() => useRascunhoDoAtivo({ guardadoEm }), { wrapper: comApi(servidor.rotas) });

const passar = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('useRascunhoDoAtivo', () => {
  it('guarda 1 s depois da última mudança, uma vez, com o que está na tela', async () => {
    const { result } = montar();
    act(() => result.current.guardar(comTipo('PAT-1')));
    await passar(500);
    act(() => result.current.guardar(comTipo('PAT-12')));
    await passar(999);
    expect(servidor.guardados).toEqual([]);
    expect(result.current.texto).toBe('Guardando o rascunho…');
    await passar(1);
    expect(servidor.guardados).toEqual([
      expect.objectContaining({
        tipoId: 't-impressora',
        valores: { 'ativo.patrimonio': 'PAT-12' },
      }),
    ]);
    expect(result.current.texto).toBe('Rascunho guardado agora');
  });

  it('manda um de cada vez: a mudança durante o envio vai depois dele', async () => {
    const { result } = montar();
    const soltar = servidor.segurar();
    act(() => result.current.guardar(comTipo('PAT-1')));
    await passar(1_000);
    act(() => result.current.guardar(comTipo('PAT-2')));
    await passar(1_000);
    expect(servidor.guardados).toHaveLength(1);
    soltar();
    await passar(0);
    expect(servidor.guardados.map((corpo) => (corpo as { valores: object }).valores)).toEqual([
      { 'ativo.patrimonio': 'PAT-1' },
      { 'ativo.patrimonio': 'PAT-2' },
    ]);
    expect(result.current.texto).toBe('Rascunho guardado agora');
  });

  it('sem o tipo, não guarda nada', async () => {
    const { result } = montar();
    act(() => result.current.guardar(CADASTRO_VAZIO));
    await passar(2_000);
    expect(servidor.guardados).toEqual([]);
    expect(result.current.texto).toBeNull();
  });

  it('depois de 1 min, diz a hora em que guardou', async () => {
    const { result } = montar();
    act(() => result.current.guardar(comTipo('PAT-1')));
    await passar(1_000);
    expect(result.current.texto).toBe('Rascunho guardado agora');
    await passar(60_000);
    expect(result.current.texto).toMatch(/^Rascunho guardado às \d{2}:\d{2}$/);
  });

  it('o rascunho retomado diz a hora em que foi guardado', () => {
    const { result } = montar('2026-10-18T15:10:00.000Z');
    expect(result.current.texto).toMatch(/^Rascunho guardado às \d{2}:\d{2}$/);
  });

  it('a falha diz que o rascunho não foi guardado, e "Tentar de novo" manda de novo', async () => {
    const { result } = montar();
    servidor.falhar(true);
    act(() => result.current.guardar(comTipo('PAT-1')));
    await passar(1_000);
    expect(result.current.texto).toBe('O rascunho não foi guardado.');
    expect(result.current.falhou).toBe(true);
    servidor.falhar(false);
    act(() => result.current.tentarDeNovo());
    await passar(0);
    expect(servidor.guardados).toHaveLength(2);
    expect(result.current.texto).toBe('Rascunho guardado agora');
  });

  it('ao sair da tela, manda na hora o que estava esperando', async () => {
    const { result, unmount } = montar();
    act(() => result.current.guardar(comTipo('PAT-1')));
    unmount();
    await passar(0);
    expect(servidor.guardados).toHaveLength(1);
  });

  it('antes de cadastrar e de descartar, a espera é cancelada', async () => {
    const { result } = montar();
    act(() => result.current.guardar(comTipo('PAT-1')));
    await act(() => result.current.antesDeCadastrar());
    await passar(2_000);
    expect(servidor.guardados).toEqual([]);

    act(() => result.current.guardar(comTipo('PAT-2')));
    let descarte: Awaited<ReturnType<typeof result.current.descartar>> | undefined;
    await act(async () => {
      descarte = await result.current.descartar();
    });
    await passar(2_000);
    expect(descarte).toEqual({ ok: true });
    expect(servidor.guardados).toEqual([]);
    expect(servidor.apagados()).toBe(1);
    expect(result.current.texto).toBeNull();
  });
});
