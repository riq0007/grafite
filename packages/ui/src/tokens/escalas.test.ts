import { describe, expect, it } from 'vitest';
import { destaques } from './destaques.ts';
import { densidades, escalaDeRaio } from './escalas.ts';
import { temas } from './temas.ts';

describe('escalaDeRaio', () => {
  it('base 12 com o menor controle de 28 px', () => {
    expect(escalaDeRaio(12, 28)).toEqual({
      janela: 12,
      controle: 6.96,
      dock: 17.4,
      itemDock: 10.2,
      menu: 10.2,
      miniatura: 6.96,
      rotulo: 5.04,
      aviso: 12,
    });
  });

  it('base 0 deixa todos os cantos retos', () => {
    expect(new Set(Object.values(escalaDeRaio(0, 28)))).toEqual(new Set([0]));
  });

  it('base 24 não transforma o menor controle em cápsula', () => {
    const raios = escalaDeRaio(24, 28);
    expect(raios.controle).toBe(13);
    expect(raios.janela).toBe(24);
    expect(raios.dock).toBe(34.8);
  });
});

describe('densidades', () => {
  it('compacta, normal e confortável com linha, miniatura e controle', () => {
    expect(densidades).toEqual({
      compacta: { linha: 36, miniatura: 24, controle: 32 },
      normal: { linha: 44, miniatura: 30, controle: 36 },
      confortavel: { linha: 52, miniatura: 36, controle: 40 },
    });
  });
});

describe('destaques e situações', () => {
  it('quatro destaques, cada um com a matiz e o croma', () => {
    expect(Object.keys(destaques)).toEqual(['grafite', 'azul', 'verde', 'laranja']);
    for (const destaque of Object.values(destaques)) {
      expect(Object.keys(destaque)).toEqual(['matiz', 'croma']);
    }
  });

  it('cada tema traz as quatro situações', () => {
    for (const tema of Object.values(temas)) {
      expect(Object.keys(tema.situacoes)).toEqual(['ok', 'atencao', 'critico', 'info']);
    }
  });
});
