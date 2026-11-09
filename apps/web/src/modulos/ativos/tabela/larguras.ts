// As larguras que o redimensionamento dá às colunas da visão.
import type { ColunaDaVisao } from '@grafite/domain';

/**
 * As colunas com as larguras novas, em px. A largura igual à padrão da coluna não fica guardada:
 * as colunas que o usuário não mexeu não marcam a visão como alterada.
 */
export function colunasComLarguras(
  colunas: readonly ColunaDaVisao[],
  larguras: ReadonlyMap<string, number>,
  padroes: ReadonlyMap<string, number>,
): ColunaDaVisao[] {
  return colunas.map((coluna) => {
    const largura = larguras.get(coluna.chave);
    if (largura === undefined) return { ...coluna };
    return largura === padroes.get(coluna.chave)
      ? { chave: coluna.chave }
      : { chave: coluna.chave, largura };
  });
}
