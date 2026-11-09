import { describe, expect, it } from 'vitest';
import { iniciais } from './iniciais.ts';

describe('iniciais', () => {
  it('primeira letra do primeiro e do último nome, em maiúsculas', () => {
    expect(iniciais('helena osório')).toBe('HO');
  });

  it('ignora partículas e nomes do meio', () => {
    expect(iniciais('Helena Matos de Osório')).toBe('HO');
    expect(iniciais('Ana dos Santos')).toBe('AS');
  });

  it('nome único dá uma letra; espaços sobrando não atrapalham', () => {
    expect(iniciais('  Almoxarifado  ')).toBe('A');
  });

  it('mantém acentos e cedilha', () => {
    expect(iniciais('Érica Çavuşoğlu')).toBe('ÉÇ');
  });

  it('sem nome, sem iniciais', () => {
    expect(iniciais('   ')).toBe('');
  });
});
