// A avaliação do atendimento (spec chamados, "Avaliação do atendimento"; change chat-com-chamados,
// design, decisão 9): os quatro níveis, com os textos do banco, que a frase do evento cita, e a
// conferência do nível e do comentário.
import { lerTexto } from '../campos/textos.ts';

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

/** O comentário da avaliação, opcional, em caracteres sem os espaços das pontas. */
export const LIMITE_DO_COMENTARIO = 500;

/** A avaliação conferida, ou o motivo da recusa (`mensagemDaRecusaDeQuemParticipa`). */
export type ConferenciaDaAvaliacao =
  | { ok: true; nivel: NivelDaAvaliacao; comentario: string | null }
  | { ok: false; motivo: 'sem-nivel' | 'comentario-longo' };

/**
 * A avaliação que quem participa manda: um dos quatro níveis, pelo texto do banco, e o comentário
 * opcional, de até 500 caracteres, sem os espaços das pontas, com o vazio sem comentário. O nível
 * confere primeiro. A avaliação só do resolvido, uma por resolução, a ação confere
 * (`decidirAcaoDeQuemParticipa`).
 */
export function conferirAvaliacao(pedido: {
  nivel: string | null;
  comentario: string | null;
}): ConferenciaDaAvaliacao {
  const nivel = nivelDaAvaliacao(pedido.nivel);
  if (nivel === null) return { ok: false, motivo: 'sem-nivel' };
  const comentario = lerTexto(pedido.comentario, LIMITE_DO_COMENTARIO);
  if (!comentario.ok) return { ok: false, motivo: 'comentario-longo' };
  return { ok: true, nivel, comentario: comentario.valor };
}
