// A ordem e os ocultos de uma lista das preferências: a lista salva de itens `{ id, visivel }`,
// resolvida contra o que o app registra, e as mudanças, que gravam a lista inteira. Serve aos blocos
// do Início (spec tela-inicial, "Personalizar o Início"; change inicio-ajustavel, design, decisões 2
// e 3) e aos módulos do dock (change dock-personalizavel, design, decisão 1).
//
// O item pode trazer mais do que o id e a visibilidade, como a largura e as opções de um bloco do
// Início (change opcoes-dos-blocos-do-inicio, design, decisão 2): as funções o levam como veio. O
// item que elas criam, para o registrado que a lista não trazia, só tem o id e a visibilidade: o
// que o tipo do item tiver a mais tem de ser opcional.

/** Um item da lista salva: o id e se está à vista, como um bloco do Início ou um módulo do dock. */
export interface ItemDaLista {
  id: string;
  visivel: boolean;
}

export interface ItensOrdenados<T extends { id: string }, I extends ItemDaLista = ItemDaLista> {
  visiveis: T[];
  ocultos: T[];
  /** A lista inteira, como ela vai gravada: os registrados que faltavam entram no fim, à vista. */
  lista: I[];
}

/** O item do registrado que a lista não trazia: à vista, só com o id. */
const novoItem = <I extends ItemDaLista>(id: string) => ({ id, visivel: true }) as I;

/**
 * Os itens registrados na ordem salva: os que a lista não traz entram no fim, à vista, na ordem do
 * registro, e os ids salvos que ninguém registra ficam de fora.
 */
export function ordenarItens<T extends { id: string }, I extends ItemDaLista = ItemDaLista>(
  registrados: readonly T[],
  salvos: readonly I[],
): ItensOrdenados<T, I> {
  const porId = new Map(registrados.map((item) => [item.id, item]));
  const lista = salvos.filter((salvo) => porId.has(salvo.id));
  for (const item of registrados) {
    if (!lista.some((salvo) => salvo.id === item.id)) lista.push(novoItem<I>(item.id));
  }
  const registrado = (salvo: I) => porId.get(salvo.id) as T;
  return {
    visiveis: lista.filter((salvo) => salvo.visivel).map(registrado),
    ocultos: lista.filter((salvo) => !salvo.visivel).map(registrado),
    lista,
  };
}

/**
 * A lista inteira de quem guarda o que não está na tela, como o dock (change dock-personalizavel,
 * design, decisão 4): os ids salvos que o registro não traz continuam nela, no lugar deles, e os
 * registrados que faltavam entram no fim, à vista. Os ausentes só ficam enquanto cabem no limite
 * da lista, contados depois dos registrados, que ficam todos.
 */
export function listaComAusentes<I extends ItemDaLista>(
  registrados: ReadonlyArray<{ id: string }>,
  salvos: readonly I[],
  limite: number,
): I[] {
  const registrado = new Set(registrados.map((item) => item.id));
  let vagas = Math.max(0, limite - registrados.length);
  const lista = salvos.filter((salvo) => registrado.has(salvo.id) || vagas-- > 0);
  for (const item of registrados) {
    if (!lista.some((salvo) => salvo.id === item.id)) lista.push(novoItem<I>(item.id));
  }
  return lista;
}

/**
 * Sobe (-1) ou desce (1) o item até o vizinho à vista, passando por cima dos ocultos: o item sai do
 * lugar dele e entra antes do vizinho de cima, ou depois do de baixo. Com os ids da tela, passa por
 * cima também dos itens que a lista guarda e a tela não mostra.
 */
export function moverItem<I extends ItemDaLista>(
  lista: readonly I[],
  id: string,
  sentido: -1 | 1,
  naTela?: ReadonlySet<string>,
): I[] {
  const pula = (item: I | undefined) =>
    !item?.visivel || (naTela !== undefined && !naTela.has(item.id));
  const indice = lista.findIndex((item) => item.id === id);
  let vizinho = indice + sentido;
  while (vizinho >= 0 && vizinho < lista.length && pula(lista[vizinho])) vizinho += sentido;
  const doVizinho = lista[vizinho];
  const movido = lista[indice];
  if (indice < 0 || !doVizinho || !movido) return [...lista];
  const sem = lista.filter((item) => item.id !== id);
  const alvo = sem.findIndex((item) => item.id === doVizinho.id);
  sem.splice(sentido === -1 ? alvo : alvo + 1, 0, movido);
  return sem;
}

/** Oculta o item no lugar dele, ou o mostra de novo, no fim, com o que ele trazia. */
export function ocultarItem<I extends ItemDaLista>(
  lista: readonly I[],
  id: string,
  oculto: boolean,
): I[] {
  if (oculto) return lista.map((item) => (item.id === id ? { ...item, visivel: false } : item));
  const guardado = lista.find((item) => item.id === id);
  return [
    ...lista.filter((item) => item.id !== id),
    guardado ? { ...guardado, visivel: true } : novoItem<I>(id),
  ];
}
