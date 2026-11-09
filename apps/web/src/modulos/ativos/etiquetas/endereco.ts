// O endereço da tela das etiquetas (design do P1f, decisão 5): os ativos, o formato e a etiqueta onde
// começar ficam na busca, para recarregar e voltar manterem a tela.
import type { FormatoDeEtiqueta } from '@grafite/ui';

export interface BuscaDasEtiquetas {
  /** Os ids dos ativos, separados por vírgula, na ordem escolhida. */
  ids?: string;
  formato?: FormatoDeEtiqueta;
  /** Na folha A4, a etiqueta onde começar, de 1 a 21. */
  inicio?: number;
}

export function lerEnderecoDasEtiquetas(busca: Record<string, unknown>): BuscaDasEtiquetas {
  const ids = typeof busca.ids === 'string' && busca.ids.trim() !== '' ? busca.ids : undefined;
  const formato = busca.formato === 'impressora' ? 'impressora' : undefined;
  const inicio = Number(busca.inicio);
  return {
    ...(ids ? { ids } : {}),
    ...(formato ? { formato } : {}),
    ...(Number.isInteger(inicio) && inicio >= 2 && inicio <= 21 ? { inicio } : {}),
  };
}

/** A busca que abre as etiquetas dos ativos dados, na ordem dada. */
export const buscaDasEtiquetas = (ids: readonly string[]): BuscaDasEtiquetas => ({
  ids: ids.join(','),
});
