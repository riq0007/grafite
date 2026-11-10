// A ordem e os ocultos de uma lista das preferências: a lista salva de itens `{ id, visivel }`,
// resolvida contra o que o app registra, e as mudanças, que gravam a lista inteira. Serve aos blocos
// do Início (spec tela-inicial, "Personalizar o Início"; change inicio-ajustavel, design, decisões 2
// e 3) e aos módulos do dock (change dock-personalizavel, design, decisão 1).

/** Um item da lista salva: o id e se está à vista, como um bloco do Início ou um módulo do dock. */
export interface ItemDaLista {
  id: string;
  visivel: boolean;
}

export interface ItensOrdenados<T extends { id: string }> {
  visiveis: T[];
  ocultos: T[];
  /** A lista inteira, como ela vai gravada: os registrados que faltavam entram no fim, à vista. */
  lista: ItemDaLista[];
}

/**
 * Os itens registrados na ordem salva: os que a lista não traz entram no fim, à vista, na ordem do
 * registro, e os ids salvos que ninguém registra ficam de fora.
 */
export function ordenarItens<T extends { id: string }>(
  registrados: readonly T[],
  salvos: readonly ItemDaLista[],
): ItensOrdenados<T> {
  const porId = new Map(registrados.map((item) => [item.id, item]));
  const lista = salvos.filter((salvo) => porId.has(salvo.id));
  for (const item of registrados) {
    if (!lista.some((salvo) => salvo.id === item.id)) lista.push({ id: item.id, visivel: true });
  }
  const registrado = (salvo: ItemDaLista) => porId.get(salvo.id) as T;
  return {
    visiveis: lista.filter((salvo) => salvo.visivel).map(registrado),
    ocultos: lista.filter((salvo) => !salvo.visivel).map(registrado),
    lista,
  };
}

/**
 * Sobe (-1) ou desce (1) o item até o vizinho à vista, passando por cima dos ocultos: o item sai do
 * lugar dele e entra antes do vizinho de cima, ou depois do de baixo.
 */
export function moverItem(
  lista: readonly ItemDaLista[],
  id: string,
  sentido: -1 | 1,
): ItemDaLista[] {
  const indice = lista.findIndex((item) => item.id === id);
  let vizinho = indice + sentido;
  while (vizinho >= 0 && vizinho < lista.length && !lista[vizinho]?.visivel) vizinho += sentido;
  const doVizinho = lista[vizinho];
  const movido = lista[indice];
  if (indice < 0 || !doVizinho || !movido) return [...lista];
  const sem = lista.filter((item) => item.id !== id);
  const alvo = sem.findIndex((item) => item.id === doVizinho.id);
  sem.splice(sentido === -1 ? alvo : alvo + 1, 0, movido);
  return sem;
}

/** Oculta o item no lugar dele, ou o mostra de novo, no fim. */
export function ocultarItem(
  lista: readonly ItemDaLista[],
  id: string,
  oculto: boolean,
): ItemDaLista[] {
  if (oculto) return lista.map((item) => (item.id === id ? { ...item, visivel: false } : item));
  return [...lista.filter((item) => item.id !== id), { id, visivel: true }];
}
