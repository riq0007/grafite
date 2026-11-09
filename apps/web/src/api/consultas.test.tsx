import { QueryClientProvider, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consultar,
  criarClienteDeConsultas,
  FalhaDaConsulta,
  itensDasPaginas,
  paginar,
  tentarDeNovo,
} from './consultas.ts';
import { SEM_CONEXAO } from './pedir.ts';

afterEach(cleanup);

const resposta = (status: number) => new Response(null, { status });
const problema = (status: number, codigo: string) => ({
  type: `urn:grafite:problema:${codigo}`,
  title: 'Título',
  status,
  detail: 'Detalhe para a tela.',
  codigoDeRastreio: 'R7K2-9QXM',
});
const semConexao = async (): Promise<never> => {
  throw new TypeError('Failed to fetch');
};

describe('consultar', () => {
  it('entrega os dados', async () => {
    expect(
      await consultar(async () => ({ data: { nome: 'Ana' }, response: resposta(200) }), 'x'),
    ).toEqual({ nome: 'Ana' });
  });

  it('lança a falha com o texto para a tela e o código de rastreio', async () => {
    const corpo = problema(500, 'erro-interno');
    const falha = await consultar(
      async () => ({ error: corpo, response: resposta(500) }),
      'carregar as pessoas',
    ).catch((erro: unknown) => erro);
    expect(falha).toBeInstanceOf(FalhaDaConsulta);
    expect((falha as FalhaDaConsulta).message).toBe(
      'Não foi possível carregar as pessoas. Informe à TI o código R7K2-9QXM.',
    );
    expect((falha as FalhaDaConsulta).codigo).toBe('erro-interno');
  });

  it('na recusa, lança o detalhe da API e o código', async () => {
    const falha = (await consultar(
      async () => ({ error: problema(403, 'sem-permissao'), response: resposta(403) }),
      'x',
    ).catch((erro: unknown) => erro)) as FalhaDaConsulta;
    expect(falha.message).toBe('Detalhe para a tela.');
    expect(falha.codigo).toBe('sem-permissao');
  });
});

describe('nova tentativa', () => {
  const falhaDe = async (fazer: () => Promise<never>) =>
    consultar(fazer, 'x').catch((erro: unknown) => erro);

  it('só sem conexão, até três vezes', async () => {
    const semResposta = await falhaDe(semConexao);
    expect((semResposta as FalhaDaConsulta).message).toBe(SEM_CONEXAO);
    expect([0, 1, 2, 3].map((tentativas) => tentarDeNovo(tentativas, semResposta))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    for (const status of [500, 403, 404, 409]) {
      const falha = await falhaDe(async () => {
        return { error: problema(status, 'qualquer'), response: resposta(status) } as never;
      });
      expect(tentarDeNovo(0, falha), String(status)).toBe(false);
    }
    expect(tentarDeNovo(0, new Error('outra'))).toBe(false);
  });

  it('o cliente de consultas tenta de novo assim, e relê ao voltar o foco', () => {
    const consultas = criarClienteDeConsultas().getDefaultOptions().queries;
    expect(consultas?.retry).toBe(tentarDeNovo);
    expect(consultas?.refetchOnWindowFocus).toBe(true);
  });

  it('na tela, a falha do servidor aparece em texto, pedida uma vez só', async () => {
    const fazer = vi.fn(async () => ({
      error: problema(500, 'erro-interno'),
      response: resposta(500),
    }));
    function Pessoas() {
      const { error } = useQuery({
        queryKey: ['pessoas'],
        queryFn: () => consultar(fazer, 'carregar as pessoas'),
      });
      return <p>{error?.message ?? 'Carregando'}</p>;
    }
    render(
      <QueryClientProvider client={criarClienteDeConsultas()}>
        <Pessoas />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText(
        'Não foi possível carregar as pessoas. Informe à TI o código R7K2-9QXM.',
      ),
    ).toBeTruthy();
    expect(fazer).toHaveBeenCalledOnce();
  });
});

describe('paginar', () => {
  it('pede a página seguinte pelo proximo, até a última', async () => {
    const paginas: Record<string, { itens: string[]; proximo: string | null }> = {
      inicio: { itens: ['Ana', 'Bruno'], proximo: 'c2' },
      c2: { itens: ['Carla'], proximo: null },
    };
    const fazer = vi.fn(async (cursor: string | undefined) => ({
      data: paginas[cursor ?? 'inicio'],
      response: resposta(200),
    }));
    function Pessoas() {
      const consulta = useInfiniteQuery({
        queryKey: ['pessoas'],
        ...paginar(fazer, 'carregar as pessoas'),
      });
      return (
        <>
          <p>{itensDasPaginas(consulta.data).join(', ')}</p>
          {consulta.hasNextPage && (
            <button type="button" onClick={() => void consulta.fetchNextPage()}>
              Carregar mais
            </button>
          )}
        </>
      );
    }
    render(
      <QueryClientProvider client={criarClienteDeConsultas()}>
        <Pessoas />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Ana, Bruno')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Ana, Bruno, Carla')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
    expect(fazer.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, 'c2']);
  });
});
