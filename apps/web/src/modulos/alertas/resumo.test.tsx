import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useApi } from '../../api/useApi.tsx';
import { comApi } from '../../teste/provedores.tsx';
import { resumoDosAlertas, textoDoResumoDosAlertas } from './resumo.ts';

afterEach(cleanup);

describe('textoDoResumoDosAlertas', () => {
  it('diz quantos alertas estão abertos e se estão silenciados, e nada sem eles', () => {
    expect(textoDoResumoDosAlertas({ ver: true, abertos: 1, silenciado: false })).toBe(
      '1 alerta aberto',
    );
    expect(textoDoResumoDosAlertas({ ver: true, abertos: 3, silenciado: true })).toBe(
      '3 alertas abertos · Alertas silenciados',
    );
    expect(textoDoResumoDosAlertas({ ver: true, abertos: 0, silenciado: true })).toBe(
      'Alertas silenciados',
    );
    expect(textoDoResumoDosAlertas({ ver: true, abertos: 0, silenciado: false })).toBeNull();
    expect(textoDoResumoDosAlertas({ ver: false, abertos: 0, silenciado: false })).toBeNull();
  });
});

/** O resumo da relação dos alertas lido pela consulta dela, como a ficha faz. */
function useResumo(id: string) {
  const api = useApi();
  const consultas = useQueryClient();
  return useQuery(resumoDosAlertas.consulta(id, { api, consultas }));
}

describe('resumoDosAlertas', () => {
  it('lê o silêncio e o total dos abertos do ativo, nas consultas do bloco', async () => {
    const pedidos: string[] = [];
    const { result } = renderHook(() => useResumo('a-1'), {
      wrapper: comApi({
        'GET /api/ativos/a-1/silencio': () =>
          Response.json({ silencio: null, permite: { ver: true, tratar: true } }),
        'GET /api/alertas': (pedido) => {
          pedidos.push(new URL(pedido.url).search);
          return Response.json({ itens: [], total: 2, proximo: null });
        },
      }),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(resumoDosAlertas.texto(result.current.data)).toBe('2 alertas abertos');
    expect(pedidos[0]).toContain('situacao=abertos');
    expect(pedidos[0]).toContain('ativo=a-1');
  });

  it('sem ver os alertas no local do ativo, não há resumo nem a lista', async () => {
    const pedidos: string[] = [];
    const { result } = renderHook(() => useResumo('a-1'), {
      wrapper: comApi({
        'GET /api/ativos/a-1/silencio': () =>
          Response.json({ silencio: null, permite: { ver: false, tratar: false } }),
        'GET /api/alertas': (pedido) => {
          pedidos.push(pedido.url);
          return Response.json({ itens: [], total: 0, proximo: null });
        },
      }),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(resumoDosAlertas.texto(result.current.data)).toBeNull();
    expect(pedidos).toEqual([]);
  });
});
