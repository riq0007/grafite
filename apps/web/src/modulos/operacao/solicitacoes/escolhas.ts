// As escolhas da nova solicitação (spec modulo-operacao, "Formulários das solicitações"; spec
// administracao-de-pessoas, "Nomes das pessoas para a escolha"; change p4d-solicitacoes, design,
// decisões 7 e 8): quem pediu, com as pessoas do local primeiro, as impressoras que usam
// consumíveis, com o contador e os compatíveis de cada cor, os ativos do conserto, com o local de
// cada um, e os tipos de ativo do equipamento. Na entrega, os saldos de um consumível nos locais em
// que a conta movimenta o estoque.
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import type { ClienteDaApi } from '../../../api/cliente.ts';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import type {
  ContaDoSeletor,
  ResultadoDoSeletor,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import { rotuloDoAtivo } from '../estoque/apresentacao.ts';
import { CHAVE_DO_ESTOQUE } from '../estoque/consultas.ts';
import { CHAVE_DAS_SOLICITACOES } from './consultas.ts';

/** Quantas impressoras e ativos a escolha traz de uma vez. */
const NA_ESCOLHA = 20;

/** As pessoas ativas pelo nome, com as que trabalham no local, ou dentro dele, primeiro. */
export function useBuscarPessoas(local: string | null) {
  const api = useApi();
  return useCallback(
    async (busca: string, sinal: AbortSignal): Promise<ResultadoDoSeletor> => {
      const { data, error } = await api.GET('/pessoas/nomes', {
        params: { query: { busca, ...(local ? { local } : {}) } },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar as pessoas.');
      return {
        itens: data.pessoas.map((pessoa) => ({ id: pessoa.id, rotulo: pessoa.nome })),
        total: data.total,
        sugeridas: {
          ids: data.pessoas.filter((pessoa) => pessoa.doMesmoLocal).map((pessoa) => pessoa.id),
          origem: 'Do mesmo local',
        },
      };
    },
    [api, local],
  );
}

/** As impressoras ativas que a conta vê e que usam consumíveis, pelo nome e pelo patrimônio. */
export function useBuscarImpressoras() {
  const api = useApi();
  return useCallback(
    async (busca: string, sinal: AbortSignal): Promise<ContaDoSeletor[]> => {
      const { data, error } = await api.GET('/solicitacoes/impressoras', {
        params: { query: { busca, limite: NA_ESCOLHA } },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar as impressoras.');
      return data.itens.map((impressora) => ({
        id: impressora.id,
        rotulo: rotuloDoAtivo(impressora),
      }));
    },
    [api],
  );
}

/** O contador de agora da impressora e, para cada cor, os compatíveis com o sugerido. */
export const opcoesDaImpressora = (api: ClienteDaApi, id: string) =>
  queryOptions({
    queryKey: [...CHAVE_DAS_SOLICITACOES, 'impressora', id],
    queryFn: () =>
      consultar(
        () => api.GET('/solicitacoes/impressoras/{id}', { params: { path: { id } } }),
        'carregar a impressora',
      ),
  });

export function useImpressoraParaSolicitacao(id: string | undefined) {
  const api = useApi();
  return useQuery({ ...opcoesDaImpressora(api, id ?? ''), enabled: id !== undefined });
}

/**
 * Os locais em que a conta movimenta o estoque e que têm saldo do consumível, o de maior saldo
 * primeiro, para a origem da entrega. Debaixo da chave do estoque: uma movimentação os relê.
 */
export const opcoesDosSaldosParaEntrega = (api: ClienteDaApi, consumivel: string) =>
  queryOptions({
    queryKey: [...CHAVE_DO_ESTOQUE, 'saldos-para-entrega', consumivel],
    queryFn: async () => {
      const { itens } = await consultar(
        () => api.GET('/estoque/saldos', { params: { query: { consumivel, limite: 100 } } }),
        'carregar os saldos',
      );
      return itens
        .filter((saldo) => saldo.permite.movimentar && saldo.saldo > 0)
        .sort(
          (a, b) => b.saldo - a.saldo || a.local.caminho.localeCompare(b.local.caminho, 'pt-BR'),
        )
        .map(({ local, saldo }) => ({ local, saldo }));
    },
  });

/**
 * Os ativos ativos que a conta vê, para o conserto, e o local de cada um achado, para as pessoas
 * dele virem primeiro em "Pedida por".
 */
export function useBuscarAtivos() {
  const api = useApi();
  const locais = useRef(new Map<string, string | null>());
  const buscar = useCallback(
    async (busca: string, sinal: AbortSignal): Promise<ContaDoSeletor[]> => {
      const { data, error } = await api.GET('/ativos', {
        params: { query: { busca, limite: NA_ESCOLHA } },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os ativos.');
      for (const ativo of data.itens) locais.current.set(ativo.id, ativo.local?.id ?? null);
      return data.itens.map((ativo) => ({ id: ativo.id, rotulo: rotuloDoAtivo(ativo) }));
    },
    [api],
  );
  const localDe = useCallback((id: string) => locais.current.get(id) ?? null, []);
  return { buscar, localDe };
}

/** O ativo do conserto que o endereço traz, pela ficha dele, com o local. */
export function useAtivoDoEndereco(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_SOLICITACOES, 'ativo-do-endereco', id],
    enabled: id !== undefined,
    queryFn: async () => {
      const resumo = await consultar(
        () => api.GET('/ativos/{id}/resumo', { params: { path: { id: id ?? '' } } }),
        'carregar o ativo',
      );
      return {
        conta: { id: resumo.id, rotulo: rotuloDoAtivo(resumo) },
        local: resumo.local?.id ?? null,
      };
    },
  });
}

/** Os tipos de ativo ativos, para o equipamento, em ordem alfabética. */
export function useTiposDeAtivo() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_SOLICITACOES, 'tipos-de-ativo'],
    queryFn: async () => {
      const { tipos } = await consultar(
        () => api.GET('/tipos-de-ativo'),
        'carregar os tipos de ativo',
      );
      return tipos
        .filter((tipo) => tipo.situacao === 'ativo')
        .map((tipo) => ({ id: tipo.id, rotulo: tipo.nome }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
    },
  });
}
