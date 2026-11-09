// O foco pelo endereço nas telas dos indicadores (spec indicadores, "Tela dos indicadores"; spec
// indicadores-da-operacao, "Tela dos indicadores da operação"; change p4f-indicadores-da-operacao,
// design, decisão 10): o endereço da notificação do indicador fora da meta leva à seção dele.
import { useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { BuscaDaRaiz } from '../../rotas/raiz.tsx';

/**
 * Os indicadores só existem depois de ler o servidor: o foco do endereço, como o da notificação do
 * indicador fora da meta, vai à seção dele quando ela aparece.
 */
export function useFocoNoIndicador(apareceu: boolean) {
  const foco = useRouterState({
    select: (estado) => (estado.location.search as BuscaDaRaiz).foco,
  });
  useEffect(() => {
    if (!apareceu || !foco?.startsWith('indicador-')) return;
    document.querySelector<HTMLElement>(`[data-foco="${foco}"]`)?.focus();
  }, [apareceu, foco]);
}
