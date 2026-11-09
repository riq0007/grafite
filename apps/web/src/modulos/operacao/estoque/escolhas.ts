// As escolhas do lançamento (spec modulo-operacao, "Lançamento das movimentações"; change
// p4c-estoque, design, decisões 6 e 7): os consumíveis e os ativos pela busca, como referência, sem
// as permissões deles, o consumível e o ativo que o endereço traz, o saldo do consumível na origem e
// os locais em que a conta movimenta o estoque.
import { montarArvore } from '@grafite/domain';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import type {
  ContaDoSeletor,
  ResultadoDoSeletor,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import { rotuloDoAtivo } from './apresentacao.ts';
import { CHAVE_DO_ESTOQUE } from './consultas.ts';
import { locaisForaDoAlcance } from './locais.ts';

/** Quantos consumíveis e ativos a escolha traz de uma vez. */
const NA_ESCOLHA = 20;

/** A busca dos consumíveis ativos pelo código e pelo nome, com o código como rótulo. */
export function useBuscarConsumiveis() {
  const api = useApi();
  return useCallback(
    async (busca: string, sinal: AbortSignal): Promise<ContaDoSeletor[]> => {
      const { data, error } = await api.GET('/consumiveis/escolha', {
        params: { query: { busca, limite: NA_ESCOLHA } },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os consumíveis.');
      return data.consumiveis.map((consumivel) => ({
        id: consumivel.id,
        rotulo: consumivel.codigo,
      }));
    },
    [api],
  );
}

/** O consumível que o endereço traz, pelo id, mesmo inativo. */
export function useConsumivelDoEndereco(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_ESTOQUE, 'consumivel-do-endereco', id],
    enabled: id !== undefined,
    queryFn: async () => {
      const { consumiveis } = await consultar(
        () => api.GET('/consumiveis/escolha', { params: { query: { id } } }),
        'carregar o consumível',
      );
      const [consumivel] = consumiveis;
      return consumivel ? { id: consumivel.id, rotulo: consumivel.codigo } : null;
    },
  });
}

/**
 * A busca dos ativos para a saída: os que a conta vê, com os de modelo compatível com o consumível
 * primeiro, como sugeridos.
 */
export function useBuscarAtivosParaSaida(consumivel: string | null) {
  const api = useApi();
  return useCallback(
    async (busca: string, sinal: AbortSignal): Promise<ResultadoDoSeletor> => {
      const { data, error } = await api.GET('/estoque/ativos-para-saida', {
        params: {
          query: { busca, limite: NA_ESCOLHA, ...(consumivel ? { consumivel } : {}) },
        },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os ativos.');
      return {
        itens: data.ativos.map((ativo) => ({ id: ativo.id, rotulo: rotuloDoAtivo(ativo) })),
        sugeridas: {
          ids: data.ativos.filter((ativo) => ativo.sugerido).map((ativo) => ativo.id),
          origem: 'Compatíveis com o consumível',
        },
      };
    },
    [api, consumivel],
  );
}

/** O ativo que o endereço traz, pelo resumo dele. */
export function useAtivoDoEndereco(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_ESTOQUE, 'ativo-do-endereco', id],
    enabled: id !== undefined,
    queryFn: async () => {
      const resumo = await consultar(
        () => api.GET('/ativos/{id}/resumo', { params: { path: { id: id ?? '' } } }),
        'carregar o ativo',
      );
      return { id: resumo.id, rotulo: rotuloDoAtivo(resumo) };
    },
  });
}

/** O saldo do consumível no local de origem, ou nada enquanto os dois não foram escolhidos. */
export function useSaldoNaOrigem(consumivel: string | null, local: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_ESTOQUE, 'saldo-na-origem', consumivel, local],
    enabled: consumivel !== null && local !== null,
    queryFn: async () => {
      const { itens } = await consultar(
        () =>
          api.GET('/estoque/saldos', {
            params: { query: { consumivel: consumivel ?? '', local: local ?? '', limite: 100 } },
          }),
        'carregar o saldo',
      );
      return itens.find((saldo) => saldo.local.id === local)?.saldo ?? 0;
    },
  });
}

/** Os locais que o lançamento não oferece: os fora dos ramos em que a conta movimenta o estoque. */
export function useLocaisForaDoAlcance(): ReadonlySet<string> {
  const api = useApi();
  const { permissoes } = useAcesso();
  const locais = useQuery({
    queryKey: ['locais'],
    queryFn: () => consultar(() => api.GET('/locais'), 'carregar os locais'),
  });
  return useMemo(() => {
    const lista = locais.data?.locais ?? [];
    return locaisForaDoAlcance(
      lista,
      montarArvore(lista),
      permissoes.find((permissao) => permissao.chave === 'estoque.movimentar'),
    );
  }, [locais.data, permissoes]);
}
