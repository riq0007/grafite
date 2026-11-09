import { useSyncExternalStore } from 'react';

/** Se o sistema operacional pede a redução agora, acompanhando as mudanças dele. */
export function useSistemaPede(consulta: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const lista = matchMedia(consulta);
      lista.addEventListener('change', avisar);
      return () => lista.removeEventListener('change', avisar);
    },
    () => matchMedia(consulta).matches,
  );
}
