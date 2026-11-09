// Os dados do servidor nas telas (design do F2b, decisão 14): o TanStack Query, com o `pedir()` por
// baixo, para a falha chegar à tela em texto, com o código de rastreio num erro do servidor.
import { type InfiniteData, QueryClient } from '@tanstack/react-query';
import { type FalhaDoPedido, pedir, type RespostaDaApi } from './pedir.ts';

/** A falha de uma consulta: a mensagem é o texto para a tela. */
export class FalhaDaConsulta extends Error {
  readonly falha: FalhaDoPedido;

  constructor(falha: FalhaDoPedido) {
    super(falha.erro);
    this.name = 'FalhaDaConsulta';
    this.falha = falha;
  }

  /** O código do problema, como `sem-permissao`; sem resposta da API, nenhum. */
  get codigo(): string | null {
    return this.falha.codigo;
  }
}

/** Para o `queryFn`: os dados, ou a falha lançada com o texto para a tela. */
export async function consultar<T>(
  fazer: () => Promise<RespostaDaApi<T>>,
  acao: string,
): Promise<T> {
  const resultado = await pedir(fazer, acao);
  if ('dados' in resultado) return resultado.dados;
  throw new FalhaDaConsulta(resultado);
}

const TENTATIVAS_SEM_CONEXAO = 3;

/**
 * Tenta de novo só a consulta que não chegou à API. Uma recusa ou um erro do servidor teriam a
 * mesma resposta.
 */
export function tentarDeNovo(tentativas: number, erro: unknown): boolean {
  return (
    tentativas < TENTATIVAS_SEM_CONEXAO &&
    erro instanceof FalhaDaConsulta &&
    erro.falha.problema === null
  );
}

/**
 * O cliente das consultas do app: relê ao voltar o foco e tenta de novo só sem conexão. Os testes
 * passam a espera entre as tentativas, para não esperar o tempo de verdade.
 */
export function criarClienteDeConsultas({
  esperaEntreTentativas,
}: {
  esperaEntreTentativas?: number;
} = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: tentarDeNovo,
        refetchOnWindowFocus: true,
        ...(esperaEntreTentativas !== undefined && { retryDelay: esperaEntreTentativas }),
      },
    },
  });
}

/** Uma página de uma lista da API: os itens e o cursor da próxima, ou `null` na última. */
export interface PaginaDaApi<T> {
  itens: T[];
  proximo: string | null;
}

/** As opções de uma lista paginada pelo `proximo`, para o `useInfiniteQuery`. */
export function paginar<P extends PaginaDaApi<unknown>>(
  pedirPagina: (cursor: string | undefined) => Promise<RespostaDaApi<P>>,
  acao: string,
) {
  return {
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      consultar(() => pedirPagina(pageParam), acao),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima: P) => ultima.proximo,
  };
}

/** Os itens de todas as páginas já carregadas, na ordem. */
export function itensDasPaginas<T>(dados: InfiniteData<PaginaDaApi<T>> | undefined): T[] {
  return dados?.pages.flatMap((pagina) => pagina.itens) ?? [];
}
