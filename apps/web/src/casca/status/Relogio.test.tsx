import { ProvedorDaRegiao } from '@grafite/ui';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProvedorDePreferencias, usePreferencias } from '../../preferencias/usePreferencias.tsx';
import { Relogio } from './Relogio.tsx';

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

/** 14:32:50 de 24 de setembro em Brasília, 13:32:50 em Manaus. */
const INSTANTE = new Date('2026-09-24T17:32:50Z');

const emBrasilia = (conteudo: ReactNode) => (
  <ProvedorDaRegiao fuso="America/Sao_Paulo">{conteudo}</ProvedorDaRegiao>
);

describe('Relogio', () => {
  it('mostra o horário no fuso em vigor, com o instante legível por máquina', () => {
    vi.setSystemTime(INSTANTE);
    render(emBrasilia(<Relogio />));
    const relogio = screen.getByText('qui 24 set 14:32');
    expect(relogio.tagName).toBe('TIME');
    expect(relogio.getAttribute('datetime')).toBe('2026-09-24T17:32Z');
  });

  it('passa ao minuto seguinte na virada, sem depender de outra ação', () => {
    vi.setSystemTime(INSTANTE);
    render(emBrasilia(<Relogio />));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText('qui 24 set 14:33')).toBeTruthy();
  });
});

function EscolherManaus() {
  const { mudar } = usePreferencias();
  return (
    <button type="button" onClick={() => mudar('regiao', { fuso: 'America/Manaus' })}>
      Manaus
    </button>
  );
}

const comAsPreferencias = (fuso: string) => {
  localStorage.setItem('grafite.preferencias', JSON.stringify({ versao: 1, regiao: { fuso } }));
  return render(
    <ProvedorDePreferencias>
      <Relogio />
      <EscolherManaus />
    </ProvedorDePreferencias>,
  );
};

describe('Relogio no fuso das preferências', () => {
  it('o fuso de Manaus nas preferências tira uma hora do relógio de Brasília', () => {
    vi.setSystemTime(INSTANTE);
    comAsPreferencias('America/Sao_Paulo');
    expect(screen.getByText('qui 24 set 14:32')).toBeTruthy();
    cleanup();
    comAsPreferencias('America/Manaus');
    expect(screen.getByText('qui 24 set 13:32')).toBeTruthy();
  });

  it('escolher o fuso de Manaus muda o relógio na hora', () => {
    vi.setSystemTime(INSTANTE);
    comAsPreferencias('America/Sao_Paulo');
    fireEvent.click(screen.getByRole('button', { name: 'Manaus' }));
    expect(screen.getByText('qui 24 set 13:32')).toBeTruthy();
  });
});
