import { describe, expect, it } from 'vitest';
import { ehOAtalhoDaBusca } from './BuscaGlobal.tsx';

const tecla = (key: string, modificadores: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { key, ...modificadores });

describe('ehOAtalhoDaBusca', () => {
  it('no Windows e no Linux, é o Ctrl+K', () => {
    expect(ehOAtalhoDaBusca(tecla('k', { ctrlKey: true }), false)).toBe(true);
    expect(ehOAtalhoDaBusca(tecla('K', { ctrlKey: true }), false)).toBe(true);
    expect(ehOAtalhoDaBusca(tecla('k', { metaKey: true }), false)).toBe(false);
  });

  it('no Mac, é o ⌘K, e o Ctrl+K fica para os campos de texto', () => {
    expect(ehOAtalhoDaBusca(tecla('k', { metaKey: true }), true)).toBe(true);
    expect(ehOAtalhoDaBusca(tecla('k', { ctrlKey: true }), true)).toBe(false);
  });

  it('com Shift ou Alt, ou sem o modificador, não é o atalho', () => {
    expect(ehOAtalhoDaBusca(tecla('k', { ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(ehOAtalhoDaBusca(tecla('k', { ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(ehOAtalhoDaBusca(tecla('k'), false)).toBe(false);
    expect(ehOAtalhoDaBusca(tecla('j', { ctrlKey: true }), false)).toBe(false);
  });
});
