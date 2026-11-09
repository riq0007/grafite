import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlvoDasPreferencias } from '../../../preferencias/alvo.tsx';
import { ProvedorDoAlvo } from '../../../preferencias/alvo.tsx';
import { ProvedorDePreferencias } from '../../../preferencias/usePreferencias.tsx';
import { alvoSimulado } from '../../../teste/alvo.ts';
import { preferenciasDaCopia } from '../../../teste/preferencias.ts';
import { SecaoAcessibilidade } from './Acessibilidade.tsx';

const MOVIMENTO = '(prefers-reduced-motion: reduce)';
const TRANSPARENCIA = '(prefers-reduced-transparency: reduce)';

const raiz = () => document.documentElement;
const salvas = preferenciasDaCopia;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  for (const nome of [...raiz().getAttributeNames()]) raiz().removeAttribute(nome);
});

/** Sistema operacional simulado: o que ele pede agora, e a mudança avisada como no navegador. */
function sistema(pedidos: { movimento?: boolean; transparencia?: boolean } = {}) {
  const pede = new Map([
    [MOVIMENTO, pedidos.movimento ?? false],
    [TRANSPARENCIA, pedidos.transparencia ?? false],
  ]);
  const ouvintes = new Map<string, Set<() => void>>();
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    media: consulta,
    get matches() {
      return pede.get(consulta) ?? false;
    },
    addEventListener: (_evento: string, ouvinte: () => void) => {
      ouvintes.set(consulta, (ouvintes.get(consulta) ?? new Set()).add(ouvinte));
    },
    removeEventListener: (_evento: string, ouvinte: () => void) => {
      ouvintes.get(consulta)?.delete(ouvinte);
    },
  }));
  return {
    passaAPedir(consulta: string, valor: boolean) {
      pede.set(consulta, valor);
      act(() => {
        for (const ouvinte of ouvintes.get(consulta) ?? []) ouvinte();
      });
    },
  };
}

function abrir(alvo?: AlvoDasPreferencias) {
  render(
    <ProvedorDePreferencias>
      <ProvedorDoAlvo alvo={alvo}>
        <SecaoAcessibilidade />
      </ProvedorDoAlvo>
    </ProvedorDePreferencias>,
  );
}

const grupo = (nome: string) => screen.getByRole('radiogroup', { name: nome });
const opcao = (nomeDoGrupo: string, nome: string) =>
  within(grupo(nomeDoGrupo)).getByRole('radio', { name: nome }) as HTMLInputElement;
/** O texto de apoio ligado ao grupo (aria-describedby). */
const descricao = (nome: string) =>
  (grupo(nome).getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ')
    .trim();

describe('seção Acessibilidade', () => {
  it('oferece "Seguir o sistema" e "Reduzir", seguindo o sistema de fábrica', () => {
    sistema();
    abrir();
    for (const nome of ['Movimento', 'Transparência']) {
      expect(opcao(nome, 'Seguir o sistema').checked).toBe(true);
      expect(opcao(nome, 'Reduzir').checked).toBe(false);
    }
  });

  it('mostra o que o sistema pede no momento', () => {
    sistema({ movimento: true });
    abrir();
    expect(descricao('Movimento')).toBe('No momento, o sistema pede movimento reduzido.');
    expect(descricao('Transparência')).toBe(
      'No momento, o sistema não pede transparência reduzida.',
    );
  });

  it('acompanha o sistema quando o pedido dele muda', () => {
    const so = sistema();
    abrir();
    so.passaAPedir(TRANSPARENCIA, true);
    expect(descricao('Transparência')).toBe('No momento, o sistema pede transparência reduzida.');
  });

  it('reduzir a transparência vale na hora e fica gravado', () => {
    sistema();
    abrir();
    fireEvent.click(opcao('Transparência', 'Reduzir'));
    expect(raiz().getAttribute('data-transparency')).toBe('reduzida');
    expect(salvas().acessibilidade.transparencia).toBe('reduzida');
  });

  it('reduzir o movimento vale na hora', () => {
    sistema();
    abrir();
    fireEvent.click(opcao('Movimento', 'Reduzir'));
    expect(raiz().getAttribute('data-motion')).toBe('reduzido');
  });

  it('Restaurar padrões volta a seguir o sistema, sem mexer na aparência', () => {
    sistema();
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({
        versao: 1,
        aparencia: { tema: 'papel' },
        acessibilidade: { movimento: 'reduzido', transparencia: 'reduzida' },
      }),
    );
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(salvas().acessibilidade).toEqual({ movimento: 'sistema', transparencia: 'sistema' });
    expect(salvas().aparencia.tema).toBe('papel');
    expect(raiz().hasAttribute('data-transparency')).toBe(false);
  });
});

describe('seção Acessibilidade com outro alvo', () => {
  it('mostra e muda o alvo, e a casca de quem edita não muda', () => {
    sistema();
    const alvo = alvoSimulado({ acessibilidade: { transparencia: 'reduzida' } });
    abrir(alvo);
    expect(opcao('Transparência', 'Reduzir').checked).toBe(true);
    fireEvent.click(opcao('Movimento', 'Reduzir'));
    expect(alvo.mudar).toHaveBeenCalledWith('acessibilidade', { movimento: 'reduzido' });
    expect(raiz().hasAttribute('data-motion')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(alvo.restaurar).toHaveBeenCalledWith('acessibilidade');
  });
});
