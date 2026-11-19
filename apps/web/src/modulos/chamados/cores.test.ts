// As cores das telas da TI nos chamados (change chamados-da-ti, design, decisões 6 e 22): a série do
// ícone de cada tipo e a de cada conta de quem atende.
import { ICONES_DO_TIPO_DE_CHAMADO } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import { iconeDoTipo, SERIE_DO_ICONE, serieDaConta } from './cores.ts';

describe('a série do ícone do tipo', () => {
  it('cada ícone da lista fechada tem a série da decisão 6, e as reticências ficam neutras', () => {
    expect(SERIE_DO_ICONE).toEqual({
      gota: 4,
      notebook: 1,
      impressora: 2,
      cadeado: 3,
      janela: 5,
      globo: 7,
      telefone: 6,
      reticencias: null,
      setas: 8,
      computador: 1,
      torre: 8,
      fone: 6,
      chave: 3,
      caixa: 4,
      camera: 8,
      'wi-fi': 7,
    });
    expect(Object.keys(SERIE_DO_ICONE).sort()).toEqual([...ICONES_DO_TIPO_DE_CHAMADO].sort());
  });

  it('o ícone que a web não conhece vira as reticências', () => {
    expect(iconeDoTipo('globo')).toBe('globo');
    expect(iconeDoTipo('wi-fi')).toBe('wi-fi');
    expect(iconeDoTipo('foguete')).toBe('reticencias');
    expect(iconeDoTipo('')).toBe('reticencias');
    // Os nomes do protótipo de um objeto não são ícones.
    expect(iconeDoTipo('toString')).toBe('reticencias');
    expect(iconeDoTipo('constructor')).toBe('reticencias');
  });
});

describe('a série da conta', () => {
  /** Ids no formato dos da API, que mudam só no fim, como os de um UUIDv7 gerados em sequência. */
  const ids = Array.from(
    { length: 40 },
    (_, indice) => `0199a6e0-0000-7000-8000-${String(indice).padStart(12, '0')}`,
  );

  it('fica de 1 a 8, sempre a mesma para o mesmo id', () => {
    for (const id of ids) {
      const serie = serieDaConta(id);
      expect(Number.isInteger(serie)).toBe(true);
      expect(serie).toBeGreaterThanOrEqual(1);
      expect(serie).toBeLessThanOrEqual(8);
      expect(serieDaConta(id)).toBe(serie);
    }
  });

  it('o id inteiro conta: uma letra trocada no começo muda a série', () => {
    expect(serieDaConta('0199a6e1-0000-7000-8000-000000000001')).not.toBe(
      serieDaConta('0199a6e0-0000-7000-8000-000000000001'),
    );
  });

  it('as contas criadas em sequência caem em séries diferentes, e todas as oito aparecem', () => {
    const series = ids.map(serieDaConta);
    expect(new Set(series).size).toBe(8);
    // Nenhuma série leva mais que um quarto das contas.
    for (let serie = 1; serie <= 8; serie++) {
      expect(series.filter((outra) => outra === serie).length).toBeLessThanOrEqual(10);
    }
  });
});
