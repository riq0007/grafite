import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlvoDasPreferencias } from '../../../preferencias/alvo.tsx';
import { ProvedorDoAlvo } from '../../../preferencias/alvo.tsx';
import { ProvedorDePreferencias } from '../../../preferencias/usePreferencias.tsx';
import { alvoSimulado } from '../../../teste/alvo.ts';
import { preferenciasDaCopia } from '../../../teste/preferencias.ts';
import { SecaoCursor } from './Cursor.tsx';

const raiz = () => document.documentElement;
const salvas = preferenciasDaCopia;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  for (const nome of [...raiz().getAttributeNames()]) raiz().removeAttribute(nome);
  raiz().removeAttribute('style');
});

interface Ambiente {
  /** Ponteiro primário fino (computador) ou de toque (tablet), na janela de teste de 1024 px. */
  ponteiroFino?: boolean;
  /** O sistema operacional pede movimento reduzido. */
  movimentoReduzido?: boolean;
}

function noAmbiente({ ponteiroFino = true, movimentoReduzido = false }: Ambiente = {}) {
  const original = window.matchMedia.bind(window);
  vi.stubGlobal('matchMedia', (consulta: string) => {
    const lista = original(consulta);
    const pede: Record<string, boolean> = {
      '(pointer: fine)': ponteiroFino,
      '(prefers-reduced-motion: reduce)': movimentoReduzido,
    };
    if (consulta in pede) Object.defineProperty(lista, 'matches', { value: pede[consulta] });
    return lista;
  });
}

function abrir(alvo?: AlvoDasPreferencias) {
  render(
    <ProvedorDePreferencias>
      <ProvedorDoAlvo alvo={alvo}>
        <SecaoCursor />
      </ProvedorDoAlvo>
    </ProvedorDePreferencias>,
  );
}

const tipo = (nome: string) =>
  within(screen.getByRole('radiogroup', { name: 'Tipo de cursor' })).getByRole('radio', {
    name: nome,
  }) as HTMLInputElement;
const suavizacao = () => screen.getByRole('slider', { name: 'Suavização' }) as HTMLInputElement;
const abracar = () => screen.getByRole('switch', { name: 'Abraçar botões' }) as HTMLInputElement;
const motivo = () => {
  const grupo = screen.getByRole('radiogroup', { name: 'Tipo de cursor' });
  const ids = grupo.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent).join(' ');
};

describe('seção Cursor', () => {
  it('abre com os padrões de fábrica: suavizado, 95% e o abraço ligado', () => {
    noAmbiente();
    abrir();
    expect(tipo('Suavizado').checked).toBe(true);
    expect(suavizacao().getAttribute('aria-valuetext')).toBe('95%');
    expect(abracar().checked).toBe(true);
  });

  it('a suavização vai de 0 a 100%, em passos de 5, com o valor à vista', () => {
    noAmbiente();
    abrir();
    fireEvent.keyDown(suavizacao(), { key: 'Home' });
    expect(suavizacao().getAttribute('aria-valuetext')).toBe('0%');
    fireEvent.keyDown(suavizacao(), { key: 'ArrowRight' });
    expect(suavizacao().getAttribute('aria-valuetext')).toBe('5%');
    for (let passo = 0; passo < 9; passo++) fireEvent.keyDown(suavizacao(), { key: 'ArrowRight' });
    expect(screen.getByText('50%')).toBeTruthy();
    expect(salvas().cursor.suavizacao).toBe(50);
    fireEvent.keyDown(suavizacao(), { key: 'End' });
    expect(suavizacao().getAttribute('aria-valuetext')).toBe('100%');
  });

  it('"Abraçar botões" liga e desliga na hora e fica gravado', () => {
    noAmbiente();
    abrir();
    fireEvent.click(abracar());
    expect(abracar().checked).toBe(false);
    expect(salvas().cursor.abracar).toBe(false);
  });

  it('"Do sistema" desabilita a suavização e o abraço, sem perder os valores', () => {
    noAmbiente();
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({ versao: 1, cursor: { suavizacao: 40, abracar: false } }),
    );
    abrir();
    fireEvent.click(tipo('Do sistema'));
    expect(salvas().cursor).toEqual({ tipo: 'sistema', suavizacao: 40, abracar: false });
    expect(suavizacao().disabled).toBe(true);
    expect(abracar().disabled).toBe(true);
    expect(suavizacao().getAttribute('aria-valuetext')).toBe('40%');

    fireEvent.click(tipo('Suavizado'));
    expect(suavizacao().disabled).toBe(false);
    expect(abracar().disabled).toBe(false);
    expect(salvas().cursor).toEqual({ tipo: 'suavizado', suavizacao: 40, abracar: false });
  });

  it('no computador, sem movimento reduzido, não mostra motivo para o cursor do sistema', () => {
    noAmbiente();
    abrir();
    expect(motivo()).toBe('');
  });

  it('com movimento reduzido pedido pelo sistema, diz que a casca usa o cursor do sistema', () => {
    noAmbiente({ movimentoReduzido: true });
    abrir();
    expect(motivo()).toBe('Com movimento reduzido, a casca usa o cursor do sistema.');
  });

  it('com movimento reduzido nos Ajustes, diz o mesmo', () => {
    noAmbiente();
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({ versao: 1, acessibilidade: { movimento: 'reduzido' } }),
    );
    abrir();
    expect(motivo()).toBe('Com movimento reduzido, a casca usa o cursor do sistema.');
  });

  it('num aparelho de toque, diz que a escolha vale no computador', () => {
    noAmbiente({ ponteiroFino: false });
    abrir();
    expect(motivo()).toBe(
      'Neste aparelho, a casca usa o cursor do sistema. A escolha vale no computador.',
    );
  });

  it('cada ajuste tem o controle marcado para o foco pelo endereço', () => {
    noAmbiente();
    abrir();
    const marcados = [...document.querySelectorAll('[data-foco]')];
    expect(marcados.map((el) => el.getAttribute('data-foco'))).toEqual([
      'tipo-de-cursor',
      'suavizacao-do-cursor',
      'abracar-botoes',
    ]);
  });

  it('Restaurar padrões volta o cursor à fábrica, sem mexer no dock', () => {
    noAmbiente();
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({
        versao: 1,
        dock: { posicao: 'esquerda' },
        cursor: { tipo: 'sistema', suavizacao: 30, abracar: false },
      }),
    );
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(salvas().cursor).toEqual({ tipo: 'suavizado', suavizacao: 95, abracar: true });
    expect(salvas().dock.posicao).toBe('esquerda');
    expect(tipo('Suavizado').checked).toBe(true);
  });
});

describe('seção Cursor com outro alvo', () => {
  it('mostra e muda o alvo, e as preferências de quem edita não mudam', () => {
    noAmbiente();
    const alvo = alvoSimulado({ cursor: { suavizacao: 40, abracar: false } });
    abrir(alvo);
    expect(suavizacao().getAttribute('aria-valuetext')).toBe('40%');
    expect(abracar().checked).toBe(false);
    fireEvent.click(abracar());
    expect(alvo.mudar).toHaveBeenCalledWith('cursor', { abracar: true });
    expect(preferenciasDaCopia().cursor.abracar).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(alvo.restaurar).toHaveBeenCalledWith('cursor');
  });
});
