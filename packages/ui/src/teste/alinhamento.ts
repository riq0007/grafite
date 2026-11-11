// Utilitário de teste do catálogo: o alinhamento vertical de dois elementos, pelas caixas na tela.

/**
 * Quanto o centro de um elemento fica do centro vertical de outro, em px: positivo quando fica
 * abaixo. Mede a posição na tela, e não o CSS, para valer qualquer que seja a causa do desvio.
 */
export function desvioDoCentro(elemento: Element, referencia: Element): number {
  const caixa = elemento.getBoundingClientRect();
  const caixaDaReferencia = referencia.getBoundingClientRect();
  return caixa.top + caixa.height / 2 - (caixaDaReferencia.top + caixaDaReferencia.height / 2);
}
