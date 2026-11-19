// A pergunta com opções (spec chamados, "Pergunta com opções"; change chat-com-chamados, design,
// decisão 10): as opções que a mensagem da TI e a resposta pronta levam, e as frases das recusas da
// escolha, que a ação de quem participa confere (`decidirAcaoDeQuemParticipa`).
import { lerTexto } from '../campos/textos.ts';
import { normalizarTexto } from '../texto.ts';

/** De 2 a 3 opções, cada uma de 1 a 40 caracteres, sem os espaços das pontas. */
export const LIMITES_DA_PERGUNTA = { minimo: 2, maximo: 3, opcao: 40 } as const;

export const MENSAGENS_DA_PERGUNTA = {
  quantas: `Use de ${LIMITES_DA_PERGUNTA.minimo} a ${LIMITES_DA_PERGUNTA.maximo} opções.`,
  vazia: 'Escreva a opção.',
  longa: `Use até ${LIMITES_DA_PERGUNTA.opcao} caracteres.`,
  repetidas: 'As opções precisam ser diferentes.',
  /** A pergunta que outra pessoa já respondeu: a primeira escolha vence. */
  respondida: 'Esta pergunta já foi respondida.',
  /** A opção que não é da pergunta, como ela foi gravada. */
  deFora: 'Escolha uma opção da pergunta.',
} as const;

/**
 * As opções, ao mandar a mensagem da TI e ao gravar a resposta pronta: nenhuma, a mensagem sem
 * pergunta, ou de 2 a 3, cada uma de 1 a 40 caracteres, contados em caracteres e sem os espaços das
 * pontas, e diferentes entre si sem contar os acentos e as maiúsculas, como "Sim" e "sim", que
 * seriam a mesma resposta (design, decisão 15). A quantidade confere primeiro; depois, cada opção,
 * na ordem.
 */
export function conferirOpcoes(
  opcoes: readonly string[],
): { ok: true; opcoes: string[] } | { ok: false; erro: string } {
  const M = MENSAGENS_DA_PERGUNTA;
  if (opcoes.length === 0) return { ok: true, opcoes: [] };
  if (opcoes.length < LIMITES_DA_PERGUNTA.minimo || opcoes.length > LIMITES_DA_PERGUNTA.maximo) {
    return { ok: false, erro: M.quantas };
  }
  const lidas: string[] = [];
  for (const opcao of opcoes) {
    const lida = lerTexto(opcao, LIMITES_DA_PERGUNTA.opcao);
    if (!lida.ok) return { ok: false, erro: M.longa };
    if (lida.valor === null) return { ok: false, erro: M.vazia };
    lidas.push(lida.valor);
  }
  if (new Set(lidas.map(normalizarTexto)).size < lidas.length) {
    return { ok: false, erro: M.repetidas };
  }
  return { ok: true, opcoes: lidas };
}
