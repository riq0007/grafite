import { montarArvore } from '@grafite/domain';
import { EscolhaEmArvore } from '@grafite/ui';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { ClienteDaApi } from '../../../api/cliente.ts';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { itensDaArvoreDeLocais } from '../locais/itensDaArvore.ts';

/** Os locais da organização, que a escolha lê. */
const opcoesDosLocais = (api: ClienteDaApi) =>
  queryOptions({
    queryKey: ['locais'],
    queryFn: () => consultar(() => api.GET('/locais'), 'carregar os locais'),
  });

/**
 * O caminho de um local, como "Jundiaí › RH", pelos locais que a escolha já trouxe, sem pedir de
 * novo: o resumo do cartão da ficha mostra o local escolhido antes de salvar (change
 * ficha-em-cartoes). Sem os locais, ou com um local que eles não têm, nada.
 */
export function useCaminhoDoLocal(): (id: string) => string | undefined {
  const api = useApi();
  const { data } = useQuery({ ...opcoesDosLocais(api), enabled: false });
  const arvore = useMemo(() => (data ? montarArvore(data.locais) : null), [data]);
  return useCallback((id) => (arvore?.local(id) ? arvore.caminho(id) : undefined), [arvore]);
}

export interface PropsDoSeletorDeLocal {
  rotulo: string;
  /** O id do local escolhido, ou `null`. */
  valor: string | null;
  aoMudar: (id: string | null) => void;
  /**
   * Os locais que não podem ser escolhidos, como o ramo do local que se move: à vista na árvore,
   * apagados, e fora do filtro.
   */
  excluir?: ReadonlySet<string>;
  /** O local provável, no topo do painel, com a origem, como "local de trabalho de Bruno". */
  sugerido?: { id: string; origem: string } | null;
  descricao?: string;
  obrigatorio?: boolean;
  erro?: string;
  desabilitado?: boolean;
  limpavel?: boolean;
  placeholder?: string;
}

/**
 * A escolha de um local ativo na árvore dos locais (spec componentes-base, "Escolha de local em
 * árvore"; design do escolhas-a-vista, decisão 3): o campo mostra o caminho, como "Jundiaí ›
 * Expedição", e o painel traz o filtro, que ignora os acentos, o local sugerido pela tela e a
 * árvore, sem os ramos inativos.
 */
export function SeletorDeLocal({
  rotulo,
  valor,
  aoMudar,
  excluir,
  sugerido,
  descricao,
  obrigatorio,
  erro,
  desabilitado,
  limpavel,
  placeholder,
}: PropsDoSeletorDeLocal) {
  const api = useApi();
  const locais = useQuery(opcoesDosLocais(api));
  const itens = useMemo(
    () => itensDaArvoreDeLocais(montarArvore(locais.data?.locais ?? []), null),
    [locais.data],
  );
  return (
    <EscolhaEmArvore
      rotulo={rotulo}
      itens={itens}
      valor={valor}
      aoMudar={aoMudar}
      sugerido={sugerido}
      desabilitados={excluir}
      desabilitado={desabilitado || !locais.data}
      aoLimpar={limpavel ? () => aoMudar(null) : undefined}
      placeholder={placeholder}
      descricao={descricao}
      obrigatorio={obrigatorio}
      erro={erro ?? locais.error?.message}
    />
  );
}
