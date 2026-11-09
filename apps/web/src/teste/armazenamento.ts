// O navegador que recusa guardar dados, como na navegação privada de alguns navegadores. No
// happy-dom, espionar o Storage.prototype não alcança o localStorage: a troca é do objeto inteiro,
// e o afterEach de quem usa desfaz com vi.unstubAllGlobals().
import { vi } from 'vitest';

export function bloquearArmazenamento({ leitura = false } = {}): void {
  const recusar = () => {
    throw new DOMException('Armazenamento bloqueado', 'SecurityError');
  };
  const real = localStorage;
  vi.stubGlobal('localStorage', {
    getItem: leitura ? recusar : (chave: string) => real.getItem(chave),
    setItem: recusar,
    removeItem: recusar,
    clear: () => real.clear(),
    key: (indice: number) => real.key(indice),
    get length() {
      return real.length;
    },
  });
}
