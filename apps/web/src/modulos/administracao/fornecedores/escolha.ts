// A escolha do fornecedor nos campos e nos filtros dos ativos (spec fornecedores, "Quem vê e quem
// edita os fornecedores"; change p4a-fornecedores, design, decisões 3 e 5): os fornecedores ativos,
// pelo nome e pelo CNPJ, que quem edita os ativos lê sem ver a Administração. A lista vem inteira
// da API e a busca acontece aqui, pelo nome sem acento e maiúsculas, e pelo começo do CNPJ.
import { normalizarTexto } from '@grafite/domain';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { ClienteDaApi } from '../../../api/cliente.ts';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';

/** A chave da lista para escolher, que o evento `fornecedores.mudaram` invalida. */
export const CHAVE_DA_ESCOLHA_DOS_FORNECEDORES = ['fornecedores-para-escolher'] as const;

export interface FornecedorParaEscolher {
  id: string;
  nome: string;
  cnpj: string | null;
}

/** Os fornecedores ativos, guardados por 30 s: a busca de cada letra não pede de novo. */
export const opcoesDaEscolhaDosFornecedores = (api: ClienteDaApi) =>
  queryOptions({
    queryKey: CHAVE_DA_ESCOLHA_DOS_FORNECEDORES,
    queryFn: () => consultar(() => api.GET('/fornecedores/escolha'), 'carregar os fornecedores'),
    staleTime: 30_000,
  });

/** Os fornecedores cujo nome contém o texto ou cujo CNPJ começa pelos algarismos dele. */
export function filtrarFornecedores(
  fornecedores: readonly FornecedorParaEscolher[],
  texto: string,
): FornecedorParaEscolher[] {
  const busca = normalizarTexto(texto);
  if (busca === '') return [...fornecedores];
  const caracteres = texto.toUpperCase().replace(/[\s./-]/g, '');
  return fornecedores.filter(
    (fornecedor) =>
      normalizarTexto(fornecedor.nome).includes(busca) ||
      (caracteres !== '' &&
        (fornecedor.cnpj ?? '')
          .toUpperCase()
          .replace(/[\s./-]/g, '')
          .startsWith(caracteres)),
  );
}

/**
 * A busca dos fornecedores para a escolha de um ou de vários, com o nome como rótulo. A função fica
 * a mesma entre as renderizações, como a escolha pede.
 */
export function useBuscarFornecedores() {
  const api = useApi();
  const consultas = useQueryClient();
  return useCallback(
    async (texto: string) => {
      const { fornecedores } = await consultas.fetchQuery(opcoesDaEscolhaDosFornecedores(api));
      return filtrarFornecedores(fornecedores, texto).map((fornecedor) => ({
        id: fornecedor.id,
        rotulo: fornecedor.nome,
      }));
    },
    [api, consultas],
  );
}
