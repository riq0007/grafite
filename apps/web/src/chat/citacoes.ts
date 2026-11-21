// Os chamados citados no texto de uma mensagem (spec chat, "Chamado citado numa mensagem"): a API
// manda, para a conta que lê, onde está cada "#1045" de um chamado de que ela vê o resumo, e a tela
// troca esses pedaços pelo chip.
import type { components } from '@grafite/api-client';

export type CitacaoNaMensagem = components['schemas']['CitacaoDeChamado'];

export type ParteDoTexto =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'chamado'; texto: string; citacao: CitacaoNaMensagem };

/**
 * O texto em partes, na ordem dele: o texto escrito e as citações. A citação que não confere com o
 * texto, que cruza a anterior ou que sai dele fica como o texto escrito.
 */
export function partesDoTexto(
  texto: string,
  citacoes: readonly CitacaoNaMensagem[],
): ParteDoTexto[] {
  const partes: ParteDoTexto[] = [];
  let ate = 0;
  const escrito = (fim: number) => {
    if (fim > ate) partes.push({ tipo: 'texto', texto: texto.slice(ate, fim) });
  };
  for (const citacao of [...citacoes].sort((a, b) => a.inicio - b.inicio)) {
    const { inicio, fim, numero } = citacao;
    if (inicio < ate || fim > texto.length || texto.slice(inicio, fim) !== `#${numero}`) continue;
    escrito(inicio);
    partes.push({ tipo: 'chamado', texto: texto.slice(inicio, fim), citacao });
    ate = fim;
  }
  escrito(texto.length);
  return partes;
}
