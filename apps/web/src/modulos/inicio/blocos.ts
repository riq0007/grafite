// A ordem e os ocultos dos blocos do Início (spec tela-inicial, "Personalizar o Início"; change
// inicio-ajustavel, design, decisões 2 e 3): a lista salva nas preferências, resolvida contra os
// blocos que os módulos registram, e as mudanças do modo Personalizar, que gravam a lista inteira.
import type { BlocoDoInicioSalvo } from '@grafite/domain';

export interface BlocosOrdenados<T extends { id: string }> {
  visiveis: T[];
  ocultos: T[];
  /** A lista inteira, como ela vai gravada: os registrados que faltavam entram no fim, à vista. */
  lista: BlocoDoInicioSalvo[];
}

/**
 * Os blocos registrados na ordem salva: os que a lista não traz entram no fim, à vista, na ordem do
 * registro, e os ids salvos que ninguém registra ficam de fora.
 */
export function ordenarBlocos<T extends { id: string }>(
  registrados: readonly T[],
  salvos: readonly BlocoDoInicioSalvo[],
): BlocosOrdenados<T> {
  const porId = new Map(registrados.map((bloco) => [bloco.id, bloco]));
  const lista = salvos.filter((salvo) => porId.has(salvo.id));
  for (const bloco of registrados) {
    if (!lista.some((salvo) => salvo.id === bloco.id)) lista.push({ id: bloco.id, visivel: true });
  }
  const registrado = (salvo: BlocoDoInicioSalvo) => porId.get(salvo.id) as T;
  return {
    visiveis: lista.filter((salvo) => salvo.visivel).map(registrado),
    ocultos: lista.filter((salvo) => !salvo.visivel).map(registrado),
    lista,
  };
}

/**
 * Sobe (-1) ou desce (1) o bloco até o vizinho à vista, passando por cima dos ocultos: o bloco sai
 * do lugar dele e entra antes do vizinho de cima, ou depois do de baixo.
 */
export function moverBloco(
  lista: readonly BlocoDoInicioSalvo[],
  id: string,
  sentido: -1 | 1,
): BlocoDoInicioSalvo[] {
  const indice = lista.findIndex((bloco) => bloco.id === id);
  let vizinho = indice + sentido;
  while (vizinho >= 0 && vizinho < lista.length && !lista[vizinho]?.visivel) vizinho += sentido;
  const doVizinho = lista[vizinho];
  const movido = lista[indice];
  if (indice < 0 || !doVizinho || !movido) return [...lista];
  const sem = lista.filter((bloco) => bloco.id !== id);
  const alvo = sem.findIndex((bloco) => bloco.id === doVizinho.id);
  sem.splice(sentido === -1 ? alvo : alvo + 1, 0, movido);
  return sem;
}

/** Oculta o bloco no lugar dele, ou o mostra de novo, no fim. */
export function ocultarBloco(
  lista: readonly BlocoDoInicioSalvo[],
  id: string,
  oculto: boolean,
): BlocoDoInicioSalvo[] {
  if (oculto) return lista.map((bloco) => (bloco.id === id ? { ...bloco, visivel: false } : bloco));
  return [...lista.filter((bloco) => bloco.id !== id), { id, visivel: true }];
}
