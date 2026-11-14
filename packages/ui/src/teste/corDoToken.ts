// Utilitário de teste do catálogo: a cor de um token como o navegador a calcula, para comparar com
// o estilo que o elemento recebeu.

/**
 * A cor computada de um token, no tema aberto. Mexe no DOM: calcule antes do waitFor, nunca
 * dentro dele (o waitFor reage a mutações e entraria em laço).
 */
export function corDoToken(token: string): string {
  const amostra = document.createElement('span');
  amostra.style.backgroundColor = `var(${token})`;
  document.body.append(amostra);
  const cor = getComputedStyle(amostra).backgroundColor;
  amostra.remove();
  return cor;
}
