// O navegador que recusa guardar dados, como na navegação privada de alguns navegadores. No
// happy-dom, espionar o Storage.prototype não alcança o localStorage nem o sessionStorage: a troca
// é do objeto inteiro, e o afterEach de quem usa desfaz com vi.unstubAllGlobals().
import { vi } from 'vitest';

export function bloquearArmazenamento({
  leitura = false,
  qual = 'localStorage',
}: {
  /** Também a leitura recusa, e não só a gravação. */
  leitura?: boolean;
  /** O armazenamento que recusa: o da origem, de fábrica, ou o da aba. */
  qual?: 'localStorage' | 'sessionStorage';
} = {}): void {
  const recusar = () => {
    throw new DOMException('Armazenamento bloqueado', 'SecurityError');
  };
  const real = qual === 'localStorage' ? localStorage : sessionStorage;
  vi.stubGlobal(qual, {
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
