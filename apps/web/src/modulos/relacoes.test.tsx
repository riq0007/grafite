import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { comApi } from '../teste/provedores.tsx';
import { resumoDaRelacao, useResumos } from './relacoes.tsx';
import type { RelacaoDoModulo } from './tipos.ts';

afterEach(cleanup);

const Nada = () => null;

/** Uma relação com o resumo de uma contagem, como a dos alertas. */
const relacao = (nome: string, quantos: number | null): RelacaoDoModulo => ({
  alvo: 'ativo',
  componente: Nada,
  resumo: resumoDaRelacao<number | null>({
    consulta: (id) => ({
      queryKey: ['teste', nome, id],
      queryFn: async () => quantos,
    }),
    texto: (dados) => (dados === null ? null : `${dados} ${nome}`),
  }),
});

const SEM_RESUMO: RelacaoDoModulo = { alvo: 'ativo', componente: Nada };

describe('useResumos', () => {
  it('junta os resumos das relações que dão um, na ordem do registro, sem os vazios', async () => {
    const { result } = renderHook(
      () => useResumos([relacao('alertas', 2), SEM_RESUMO, relacao('chamados', null)], 'a-1'),
      { wrapper: comApi() },
    );
    await waitFor(() => expect(result.current).toEqual(['2 alertas']));
  });

  it('acompanha a lista que muda com as permissões, sem quebrar a ordem dos hooks', async () => {
    const { result, rerender } = renderHook(
      ({ relacoes }: { relacoes: RelacaoDoModulo[] }) => useResumos(relacoes, 'a-1'),
      { wrapper: comApi(), initialProps: { relacoes: [relacao('alertas', 1)] } },
    );
    await waitFor(() => expect(result.current).toEqual(['1 alertas']));
    rerender({ relacoes: [relacao('alertas', 1), relacao('chamados', 4)] });
    await waitFor(() => expect(result.current).toEqual(['1 alertas', '4 chamados']));
    rerender({ relacoes: [] });
    await waitFor(() => expect(result.current).toEqual([]));
  });
});
