// A casca na chegada (F1c, design, decisão 3): o estado que o app escreve no <html> e a espera da
// montagem, que o CSS de cada parte faz com os tempos dos tokens.
import { useEffect, useState } from 'react';

/** O estado da chegada, como o app o escreve em `<html data-chegada>`. */
export function useEstadoDaChegada(): string | null {
  const [estado, definirEstado] = useState(() =>
    document.documentElement.getAttribute('data-chegada'),
  );
  useEffect(() => {
    const raiz = document.documentElement;
    const ler = () => definirEstado(raiz.getAttribute('data-chegada'));
    const observador = new MutationObserver(ler);
    observador.observe(raiz, { attributes: true, attributeFilter: ['data-chegada'] });
    ler();
    return () => observador.disconnect();
  }, []);
  return estado;
}

/**
 * Espera a montagem terminar: as animações das partes marcadas com `data-montagem` (a barra, a
 * janela e o dock ou a barra de abas). Chame depois de pôr o <html> em "montando".
 */
export async function esperarMontagem(raiz: ParentNode = document): Promise<void> {
  // As animações começam no quadro seguinte à troca do estado.
  await new Promise((resolver) => requestAnimationFrame(() => resolver(undefined)));
  const animacoes = [...raiz.querySelectorAll('[data-montagem]')].flatMap(
    (parte) => parte.getAnimations?.() ?? [],
  );
  await Promise.all(animacoes.map((animacao) => animacao.finished.catch(() => undefined)));
}
