// A situação do backup e das operações por extenso, com o tom do rótulo (spec backup-do-control-id,
// "Histórico dos backups"): a cor nunca vai sozinha.
import type { Situacao } from '@grafite/ui';
import type { SituacaoDoBackup } from './consultas.ts';

export const SITUACOES_NA_TELA: Record<SituacaoDoBackup, { texto: string; tom: Situacao }> = {
  'na-fila': { texto: 'Na fila', tom: 'info' },
  'em-andamento': { texto: 'Em andamento', tom: 'info' },
  sucesso: { texto: 'Sucesso', tom: 'sucesso' },
  parcial: { texto: 'Parcial', tom: 'atencao' },
  falha: { texto: 'Falha', tom: 'critico' },
};
