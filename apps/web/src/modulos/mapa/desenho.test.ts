// O desenho do mapa (spec mapa-da-planta, "Mapa navegável"; change p7-mapa-da-planta, design,
// decisão 5): a planta inteira, o vaivém entre a planta e a tela, o zoom em torno do ponteiro, o
// marcador sob o clique e os textos sem sobreposição.
import { describe, expect, it } from 'vitest';
import {
  centrarEm,
  marcadorNoPonto,
  naPlanta,
  naTela,
  rotulosVisiveis,
  vistaDaPlantaInteira,
  zoomEm,
} from './desenho.ts';

describe('a vista do mapa', () => {
  it('põe a planta inteira no centro, com a margem', () => {
    const vista = vistaDaPlantaInteira(
      { largura: 100, profundidade: 50 },
      { largura: 1000, altura: 1000 },
    );
    expect(vista.escala).toBeCloseTo(9.5);
    expect(naTela(vista, 50, 25)).toEqual({ x: 500, y: 500 });
  });

  it('vai da tela à planta e volta', () => {
    const vista = { escala: 4, dx: 10, dy: 20 };
    expect(naPlanta(vista, naTela(vista, 7, 9))).toEqual({ x: 7, z: 9 });
  });

  it('o zoom deixa parado o ponto do ponteiro', () => {
    const vista = { escala: 4, dx: 10, dy: 20 };
    const ponteiro = { x: 210, y: 220 };
    const antes = naPlanta(vista, ponteiro);
    const depois = zoomEm(vista, 2, ponteiro);
    expect(depois.escala).toBe(8);
    expect(naPlanta(depois, ponteiro)).toEqual(antes);
  });

  it('Busca pelo texto do desenho: a vista centra no achado', () => {
    const vista = centrarEm(9.6, 78.5, 20, { largura: 800, altura: 600 });
    expect(naTela(vista, 9.6, 78.5)).toEqual({ x: 400, y: 300 });
  });
});

describe('o que está sob o ponteiro e o que cabe', () => {
  it('acha o marcador mais perto dentro do raio', () => {
    const vista = { escala: 10, dx: 0, dy: 0 };
    const marcadores = [
      { id: 'a', x: 1, z: 1 },
      { id: 'b', x: 3, z: 1 },
    ];
    expect(marcadorNoPonto(marcadores, vista, { x: 12, y: 11 })?.id).toBe('a');
    expect(marcadorNoPonto(marcadores, vista, { x: 200, y: 200 })).toBeNull();
  });

  it('os textos aparecem só no zoom e sem se sobrepor', () => {
    const rotulos = [
      { texto: 'WC M', x: 1, z: 1 },
      { texto: 'WC F', x: 1.1, z: 1 },
      { texto: 'Expedição', x: 30, z: 10 },
    ];
    const area = { largura: 1000, altura: 800 };
    expect(rotulosVisiveis(rotulos, { escala: 2, dx: 0, dy: 0 }, area)).toEqual([]);
    expect(
      rotulosVisiveis(rotulos, { escala: 10, dx: 0, dy: 0 }, area).map((rotulo) => rotulo.texto),
    ).toEqual(['WC M', 'Expedição']);
  });
});
