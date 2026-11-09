// As escolhas da peça da OS (spec modulo-operacao, "Formulários das ordens de serviço"; change
// p4e-ordens-de-servico, design, decisão 8): os consumíveis ativos pela busca, como referência, com
// as Peças primeiro, e o código e o nome como rótulo.
import { useCallback } from 'react';
import { useApi } from '../../../api/useApi.tsx';
import type { ResultadoDoSeletor } from '../../administracao/seletores/SeletorDeConta.tsx';

/** Quantos consumíveis a escolha traz de uma vez. */
const NA_ESCOLHA = 20;

/** "FNT-65W · Fonte 65W", ou só o código, sem o nome. */
export const consumivelEmTexto = ({ codigo, nome }: { codigo: string; nome: string | null }) =>
  nome ? `${codigo} · ${nome}` : codigo;

/** A busca dos consumíveis ativos pelo código e pelo nome, com as Peças de cada busca primeiro. */
export function useBuscarPecas() {
  const api = useApi();
  return useCallback(
    async (busca: string, sinal: AbortSignal): Promise<ResultadoDoSeletor> => {
      const { data, error } = await api.GET('/consumiveis/escolha', {
        params: { query: { busca, limite: NA_ESCOLHA } },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os consumíveis.');
      const pecas = data.consumiveis.filter(({ tipo }) => tipo === 'peca');
      return {
        itens: [...pecas, ...data.consumiveis.filter(({ tipo }) => tipo !== 'peca')].map(
          (consumivel) => ({ id: consumivel.id, rotulo: consumivelEmTexto(consumivel) }),
        ),
        sugeridas: { ids: pecas.map(({ id }) => id), origem: 'Peças' },
      };
    },
    [api],
  );
}
