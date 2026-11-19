// A avaliação do atendimento (spec chamados, "Avaliação do atendimento"; change chat-com-chamados,
// design, decisão 9): os quatro níveis, com os textos do banco, que a frase do evento cita. A
// conferência do nível e do comentário é da tarefa 2.7.

/** Os níveis da avaliação, do pior ao melhor, com os textos do banco. */
export const NIVEIS_DA_AVALIACAO = ['ruim', 'regular', 'bom', 'otimo'] as const;
export type NivelDaAvaliacao = (typeof NIVEIS_DA_AVALIACAO)[number];

/** O nome do nível e o que ele quer dizer, que a tela junta como "Ótimo · Resolveu muito bem". */
export const ROTULOS_DOS_NIVEIS_DA_AVALIACAO: Record<
  NivelDaAvaliacao,
  { nome: string; descricao: string }
> = {
  ruim: { nome: 'Ruim', descricao: 'Não resolveu' },
  regular: { nome: 'Regular', descricao: 'Resolveu em parte' },
  bom: { nome: 'Bom', descricao: 'Resolveu' },
  otimo: { nome: 'Ótimo', descricao: 'Resolveu muito bem' },
};

/** O nível gravado nos dados do evento, ou nulo, com outro valor. */
export function nivelDaAvaliacao(valor: unknown): NivelDaAvaliacao | null {
  return NIVEIS_DA_AVALIACAO.find((nivel) => nivel === valor) ?? null;
}
