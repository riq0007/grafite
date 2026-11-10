// O que a barra de rolagem própria pede ao código (spec componentes-base, "Barra de rolagem
// própria"; change barra-de-rolagem-propria, design, decisão 4). O desenho da barra é da folha de
// estilo (`base.css`); aqui fica o que ela não sabe sozinha.

/** Por quanto tempo o polegar continua à vista depois da última rolagem, em ms. */
export const TEMPO_DA_MARCA_DE_ROLAGEM = 1000;

const ehElemento = (alvo: unknown): alvo is Element =>
  typeof alvo === 'object' && alvo !== null && (alvo as Node).nodeType === 1;

/**
 * Marca com `data-rolando` a área que rola, enquanto ela rola e por 1 s depois da última rolagem:
 * a folha de estilo mostra o polegar nela também na rolagem pelo teclado, pelo toque ou pelo
 * próprio app, quando o ponteiro não está sobre a área. Quando quem rola é o documento, a marca vai
 * para a raiz. Devolve a função que desfaz o ouvinte.
 */
export function acompanharRolagem(documento: Document): () => void {
  // Um prazo por área: a que parou de rolar perde a marca sem esperar pelas outras.
  const prazos = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  const aoRolar = (evento: Event) => {
    const alvo = evento.target === documento ? documento.documentElement : evento.target;
    if (!ehElemento(alvo)) return;
    // A rolagem dispara muitas vezes por segundo: a marca só é escrita quando falta.
    if (!alvo.hasAttribute('data-rolando')) alvo.setAttribute('data-rolando', '');
    clearTimeout(prazos.get(alvo));
    prazos.set(
      alvo,
      setTimeout(() => {
        alvo.removeAttribute('data-rolando');
        prazos.delete(alvo);
      }, TEMPO_DA_MARCA_DE_ROLAGEM),
    );
  };
  // O evento de rolagem não sobe pela árvore: o ouvinte o pega na descida, uma vez para a página.
  documento.addEventListener('scroll', aoRolar, { capture: true, passive: true });
  return () => documento.removeEventListener('scroll', aoRolar, { capture: true });
}
