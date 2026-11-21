// A volta da tela à lista, no celular (spec modulo-chat, "Chat no celular"; change chat-com-chamados,
// design, decisão 15, "O celular"): a seta de voltar da conversa, do chamado e da equipe. Vinda da
// lista, a tela volta pelo histórico, e a lista volta como estava, com a rolagem; aberta direto, como
// por um aviso, ou vinda de outra tela, a entrada dela dá lugar à lista, e o voltar do navegador não
// a reabre.
import type { HistoryLocation, RouterHistory } from '@tanstack/react-router';

/** O caminho de cada entrada do histórico, pelo índice dela, desde que o app abriu. */
const lembrados = new WeakMap<RouterHistory, Map<number, string>>();

/** O caminho como o roteador o casa: sem as barras do fim e sem diferenciar as maiúsculas. */
const comoORoteadorCasa = (caminho: string) => caminho.replace(/\/+$/, '').toLowerCase();

/**
 * Passa a lembrar o caminho de cada entrada do histórico, a de agora e as seguintes, também as
 * trocadas. O navegador não diz o endereço da entrada anterior; depois de recarregar a página, as
 * de antes ficam sem caminho.
 */
export function lembrarAsEntradas(historico: RouterHistory): () => void {
  const caminhos = new Map<number, string>();
  lembrados.set(historico, caminhos);
  const lembrar = ({ state, pathname }: HistoryLocation) => {
    caminhos.set(state.__TSR_index, pathname);
  };
  lembrar(historico.location);
  return historico.subscribe(({ location }) => lembrar(location));
}

/**
 * Volta à lista: pelo histórico, quando a entrada anterior é ela; senão, troca a entrada de agora
 * pela lista.
 */
export function voltarParaALista(
  historico: RouterHistory,
  lista: string,
  trocarPelaLista: (lista: string) => void,
) {
  const indice = historico.location.state.__TSR_index;
  const anterior = indice > 0 ? lembrados.get(historico)?.get(indice - 1) : undefined;
  if (anterior !== undefined && comoORoteadorCasa(anterior) === comoORoteadorCasa(lista)) {
    historico.back();
    return;
  }
  trocarPelaLista(lista);
}
