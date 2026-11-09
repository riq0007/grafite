// Um alvo das seções de preferências que não é a conta, como o rascunho dos padrões da
// organização: mostra as preferências dadas e só registra o que as seções pedem.
import { type AjustesDasPreferencias, resolverPreferencias } from '@grafite/domain';
import { type Mock, vi } from 'vitest';
import type { AlvoDasPreferencias } from '../preferencias/alvo.tsx';

export type AlvoSimulado = AlvoDasPreferencias & {
  mudar: Mock<AlvoDasPreferencias['mudar']>;
  restaurar: Mock<AlvoDasPreferencias['restaurar']>;
};

export function alvoSimulado(ajustes: AjustesDasPreferencias = {}): AlvoSimulado {
  return {
    preferencias: resolverPreferencias(ajustes),
    mudar: vi.fn(),
    restaurar: vi.fn(),
  };
}
