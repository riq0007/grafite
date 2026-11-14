// Utilitário de teste do catálogo: a fonte de um token como o navegador a calcula, para comparar com
// a que o elemento recebeu.

/**
 * A família da fonte de um token, como o `getComputedStyle` a devolve. Mexe no DOM: calcule antes
 * do waitFor, nunca dentro dele (o waitFor reage a mutações e entraria em laço).
 */
export function fonteDoToken(token: string): string {
  const amostra = document.createElement('span');
  amostra.style.fontFamily = `var(${token})`;
  document.body.append(amostra);
  const fonte = getComputedStyle(amostra).fontFamily;
  amostra.remove();
  return fonte;
}
