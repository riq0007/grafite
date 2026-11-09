// Os textos das importações nas telas (spec importacao-de-ativos): a situação, com o tom que a
// reforça, e o resumo de cada uma, em texto.
import {
  type AcaoDaLinha,
  mostrarDecimal,
  ROTULOS_DAS_ACOES_DA_LINHA,
  ROTULOS_DAS_SITUACOES_DA_IMPORTACAO,
  type SituacaoDaImportacao,
} from '@grafite/domain';
import type { Situacao } from '@grafite/ui';
import type { ImportacaoNaLista } from './consultas.ts';

const TOM_DA_SITUACAO = {
  rascunho: 'neutra',
  'na-fila': 'info',
  aplicando: 'info',
  concluida: 'sucesso',
  'com-falha': 'critico',
  descartada: 'neutra',
} as const satisfies Record<SituacaoDaImportacao, Situacao>;

/** A situação da importação em texto, com o tom. */
export const situacaoDaImportacao = (situacao: SituacaoDaImportacao) => ({
  texto: ROTULOS_DAS_SITUACOES_DA_IMPORTACAO[situacao],
  tom: TOM_DA_SITUACAO[situacao],
});

const TOM_DA_ACAO = {
  novo: 'sucesso',
  alterar: 'info',
  'sem-mudanca': 'neutra',
  'com-erro': 'critico',
} as const satisfies Record<AcaoDaLinha, Situacao>;

/** A ação de uma linha em texto, com o tom, como a prévia mostra. */
export const acaoDaLinha = (acao: AcaoDaLinha) => ({
  rotulo: ROTULOS_DAS_ACOES_DA_LINHA[acao],
  situacao: TOM_DA_ACAO[acao],
});

/** "1 linha", "3 linhas", com os milhares. */
export const linhas = (quantas: number) =>
  `${mostrarDecimal(quantas)} ${quantas === 1 ? 'linha' : 'linhas'}`;

/** Os totais que não são zero, como "4.990 novos · 1 alterado · 9 com erro". */
export function totaisEmTexto(totais: ImportacaoNaLista['totais']): string {
  const partes = [
    totais.novos > 0 && `${mostrarDecimal(totais.novos)} ${totais.novos === 1 ? 'novo' : 'novos'}`,
    totais.alterados > 0 &&
      `${mostrarDecimal(totais.alterados)} ${totais.alterados === 1 ? 'alterado' : 'alterados'}`,
    totais.semMudanca > 0 && `${mostrarDecimal(totais.semMudanca)} sem mudança`,
    totais.comErro > 0 && `${mostrarDecimal(totais.comErro)} com erro`,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : 'Nenhuma linha';
}

/** O resumo da importação na lista: as linhas, o avanço ou os totais, conforme a situação. */
export function resumoDaImportacao(importacao: ImportacaoNaLista): string {
  switch (importacao.situacao) {
    case 'aplicando':
    case 'com-falha':
      return `${mostrarDecimal(importacao.processadas)} de ${linhas(importacao.linhas)}`;
    case 'concluida':
      return totaisEmTexto(importacao.totais);
    default:
      return linhas(importacao.linhas);
  }
}
