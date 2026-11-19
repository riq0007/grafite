// O termo da busca dos chamados (spec modulo-chamados, "Busca dos chamados"; change chamados-da-ti,
// design, decisão 17, "A rota da busca (tarefa 4.20)"): com o "#", só o número; só os algarismos
// pedem o número e também os títulos que os têm, porque o modelo do equipamento aparece no título;
// o resto são as palavras do título, sem acento e em qualquer ordem.
import { normalizarTexto } from '../texto.ts';

/** O maior número de chamado que o banco guarda. */
export const MAIOR_NUMERO_DE_CHAMADO = 2_147_483_647;

/** O que o termo pede: o número, se é um, e as palavras do título. */
export interface TermoDaBusca {
  numero: number | null;
  palavras: string[];
}

/** O número e as palavras que o termo da busca pede. */
export function termoDaBusca(termo: string): TermoDaBusca {
  const numerico = /^(#?)(\d+)$/.exec(termo.trim());
  const numero = numerico ? Number(numerico[2]) : null;
  const naFaixa =
    numero !== null && numero >= 1 && numero <= MAIOR_NUMERO_DE_CHAMADO ? numero : null;
  // Com o "#", quem digita quer o número, e o título fica de fora.
  if (numerico?.[1] === '#') return { numero: naFaixa, palavras: [] };
  return { numero: naFaixa, palavras: normalizarTexto(termo).split(' ').filter(Boolean) };
}
