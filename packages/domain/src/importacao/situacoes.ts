// As situações de uma importação de ativos (spec importacao-de-ativos, "Importações da conta"): o
// rascunho, que ainda não foi aplicado, a fila, a aplicação e o fim. A tela mostra cada uma em texto.

export const SITUACOES_DA_IMPORTACAO = [
  'rascunho',
  'na-fila',
  'aplicando',
  'concluida',
  'com-falha',
  'descartada',
] as const;

export type SituacaoDaImportacao = (typeof SITUACOES_DA_IMPORTACAO)[number];

export const ROTULOS_DAS_SITUACOES_DA_IMPORTACAO = {
  rascunho: 'Rascunho',
  'na-fila': 'Na fila',
  aplicando: 'Importando',
  concluida: 'Concluída',
  'com-falha': 'Com falha',
  descartada: 'Descartada',
} as const satisfies Record<SituacaoDaImportacao, string>;
