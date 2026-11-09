import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlvoDasPreferencias } from '../../../preferencias/alvo.tsx';
import { ProvedorDoAlvo } from '../../../preferencias/alvo.tsx';
import { ProvedorDePreferencias } from '../../../preferencias/usePreferencias.tsx';
import { alvoSimulado } from '../../../teste/alvo.ts';
import { preferenciasDaCopia } from '../../../teste/preferencias.ts';
import { SecaoDock } from './Dock.tsx';

const raiz = () => document.documentElement;
const salvas = preferenciasDaCopia;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  for (const nome of [...raiz().getAttributeNames()]) raiz().removeAttribute(nome);
  raiz().removeAttribute('style');
});

/** Ponteiro primário fino (computador) ou de toque (tablet), na janela de teste de 1024 px. */
function comPonteiro(fino: boolean) {
  const original = window.matchMedia.bind(window);
  vi.stubGlobal('matchMedia', (consulta: string) => {
    const lista = original(consulta);
    if (consulta === '(pointer: fine)') Object.defineProperty(lista, 'matches', { value: fino });
    return lista;
  });
}
const noComputador = () => comPonteiro(true);
const noTablet = () => comPonteiro(false);

function abrir(alvo?: AlvoDasPreferencias) {
  render(
    <ProvedorDePreferencias>
      <ProvedorDoAlvo alvo={alvo}>
        <SecaoDock />
      </ProvedorDoAlvo>
    </ProvedorDePreferencias>,
  );
}

const posicao = (nome: string) =>
  within(screen.getByRole('radiogroup', { name: 'Posição' })).getByRole('radio', {
    name: nome,
  }) as HTMLInputElement;
const interruptor = (nome: string) =>
  screen.getByRole('switch', { name: nome }) as HTMLInputElement;
const tamanho = () => screen.getByRole('slider', { name: 'Tamanho' });

describe('seção Dock', () => {
  it('abre com os padrões de fábrica', () => {
    noComputador();
    abrir();
    expect(posicao('Embaixo').checked).toBe(true);
    expect(tamanho().getAttribute('aria-valuetext')).toBe('48 px');
    expect(interruptor('Ampliar ao passar o mouse').checked).toBe(true);
    expect(interruptor('Ocultar automaticamente').checked).toBe(false);
  });

  it('a posição escolhida vale na hora e fica gravada', () => {
    noComputador();
    abrir();
    fireEvent.click(posicao('À direita'));
    expect(raiz().getAttribute('data-dock')).toBe('direita');
    expect(salvas().dock.posicao).toBe('direita');
  });

  it('o tamanho vai de 28 a 64 px, com o valor à vista', () => {
    noComputador();
    abrir();
    fireEvent.keyDown(tamanho(), { key: 'Home' });
    expect(tamanho().getAttribute('aria-valuetext')).toBe('28 px');
    for (let passo = 0; passo < 8; passo++) fireEvent.keyDown(tamanho(), { key: 'ArrowRight' });
    expect(screen.getByText('36 px')).toBeTruthy();
    expect(raiz().style.getPropertyValue('--tamanho-item-dock')).toBe('36px');
    fireEvent.keyDown(tamanho(), { key: 'End' });
    expect(tamanho().getAttribute('aria-valuetext')).toBe('64 px');
  });

  it('a ampliação e o ocultar automático ligam e desligam na hora', () => {
    noComputador();
    abrir();
    fireEvent.click(interruptor('Ampliar ao passar o mouse'));
    fireEvent.click(interruptor('Ocultar automaticamente'));
    expect(salvas().dock).toMatchObject({ ampliar: false, ocultar: true });
    expect(raiz().hasAttribute('data-dock-ocultar')).toBe(true);
  });

  it('no computador, não fala da postura tablet', () => {
    noComputador();
    abrir();
    expect(screen.queryByText(/Neste aparelho/)).toBeNull();
  });

  it('no tablet, avisa que o dock fica embaixo e que a posição vale no computador', () => {
    noTablet();
    abrir();
    const grupo = screen.getByRole('radiogroup', { name: 'Posição' });
    const aviso = screen.getByText(
      'Neste aparelho, o dock fica embaixo. A posição escolhida vale no computador.',
    );
    expect(grupo.getAttribute('aria-describedby')?.split(' ')).toContain(aviso.id);
  });

  it('Restaurar padrões volta o dock à fábrica, sem mexer no tema', () => {
    noComputador();
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({
        versao: 1,
        aparencia: { tema: 'papel' },
        dock: { posicao: 'esquerda', tamanho: 36, ampliar: false, ocultar: true },
      }),
    );
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(salvas().dock).toEqual({
      posicao: 'embaixo',
      tamanho: 48,
      ampliar: true,
      ocultar: false,
    });
    expect(salvas().aparencia.tema).toBe('papel');
    expect(posicao('Embaixo').checked).toBe(true);
  });
});

describe('seção Dock com outro alvo', () => {
  it('mostra e muda o alvo, e a casca de quem edita não muda', () => {
    noComputador();
    const alvo = alvoSimulado({ dock: { posicao: 'esquerda', tamanho: 36 } });
    abrir(alvo);
    expect(posicao('À esquerda').checked).toBe(true);
    expect(tamanho().getAttribute('aria-valuetext')).toBe('36 px');
    fireEvent.click(posicao('À direita'));
    expect(alvo.mudar).toHaveBeenCalledWith('dock', { posicao: 'direita' });
    expect(raiz().getAttribute('data-dock')).toBe('embaixo');
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(alvo.restaurar).toHaveBeenCalledWith('dock');
  });
});
