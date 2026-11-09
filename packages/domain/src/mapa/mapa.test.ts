// O mapa da planta (spec mapa-da-planta; change p7-mapa-da-planta, design, decisões 1, 2 e 4): o
// conversor do DXF, a leitura do modelo do PMG e a situação do marcador.
import { describe, expect, it } from 'vitest';
import { contagensDoModelo, converterDxf, lerModeloDoPmg, situacaoNoMapa } from './mapa.ts';

/** Um DXF mínimo, em pares de código e valor. */
const dxf = (pares: (string | number)[]) => `${pares.join('\n')}\n`;

const DESENHO = dxf([
  0,
  'SECTION',
  2,
  'HEADER',
  9,
  '$INSUNITS',
  70,
  4,
  0,
  'ENDSEC',
  0,
  'SECTION',
  2,
  'BLOCKS',
  0,
  'BLOCK',
  8,
  '0',
  2,
  'MESA',
  70,
  0,
  10,
  0,
  20,
  0,
  30,
  0,
  3,
  'MESA',
  0,
  'LINE',
  8,
  'MOVEIS',
  10,
  0,
  20,
  0,
  30,
  0,
  11,
  1000,
  21,
  0,
  31,
  0,
  0,
  'ENDBLK',
  8,
  '0',
  0,
  'ENDSEC',
  0,
  'SECTION',
  2,
  'ENTITIES',
  0,
  'LINE',
  8,
  'PAREDES',
  10,
  0,
  20,
  0,
  30,
  0,
  11,
  10000,
  21,
  0,
  31,
  0,
  0,
  'LWPOLYLINE',
  8,
  'PAREDES',
  90,
  4,
  70,
  1,
  10,
  0,
  20,
  0,
  10,
  10000,
  20,
  0,
  10,
  10000,
  20,
  5000,
  10,
  0,
  20,
  5000,
  0,
  'TEXT',
  8,
  'TEXTOS',
  10,
  2000,
  20,
  1000,
  30,
  0,
  40,
  200,
  1,
  'WC',
  0,
  'INSERT',
  8,
  'MOVEIS',
  2,
  'MESA',
  10,
  1000,
  20,
  2000,
  30,
  0,
  0,
  'INSERT',
  8,
  'MOVEIS',
  2,
  'MESA',
  10,
  5000,
  20,
  2000,
  30,
  0,
  50,
  90,
  0,
  'ENDSEC',
  0,
  'EOF',
]);

describe('o conversor do DXF', () => {
  it('DXF convertido: as linhas por camada em metros, o bloco nas duas posições e o texto', () => {
    const modelo = converterDxf(DESENHO);
    expect(modelo.largura).toBe(10);
    expect(modelo.profundidade).toBe(5);
    const paredes = modelo.camadas.find((camada) => camada.nome === 'PAREDES');
    // A linha do chão (z = 5, de baixo) e os quatro lados da polilinha fechada.
    expect(paredes?.segmentos.length).toBe(5 * 4);
    const moveis = modelo.camadas.find((camada) => camada.nome === 'MOVEIS');
    expect(moveis?.segmentos).toEqual([1, 3, 2, 3, 5, 3, 5, 2]);
    expect(modelo.rotulos).toEqual([{ texto: 'WC', x: 2, z: 4 }]);
    expect(contagensDoModelo(modelo)).toEqual({
      segmentos: 7,
      rotulos: 1,
      camadas: 2,
      maquinas: 0,
    });
  });

  it('recusa o arquivo que não é um DXF', () => {
    expect(() => converterDxf('%PDF-1.7\n')).toThrow(
      'Envie o desenho em DXF ou o modelo da planta em JSON.',
    );
  });
});

describe('o modelo do PMG', () => {
  it('Planta do PMG importada: troca os nomes dos campos e guarda o resto', () => {
    const modelo = lerModeloDoPmg({
      id: 'planta-exemplo',
      width: 120,
      depth: 80,
      layers: [{ name: '0', segments: [1, 2, 3, 4] }],
      walls: [
        {
          name: 'Galpão',
          points: [
            [5, 5],
            [40, 5],
          ],
          height: 9,
        },
      ],
      labels: [{ text: 'WC M', x: 10.5, z: 20.25 }],
      machines: [{ name: 'Máquina 1', x: 60.5, z: 40.25, width: 2.4, depth: 2.4, height: 2 }],
    });
    expect(modelo).toEqual({
      largura: 120,
      profundidade: 80,
      camadas: [{ nome: '0', segmentos: [1, 2, 3, 4] }],
      paredes: [
        {
          nome: 'Galpão',
          pontos: [
            [5, 5],
            [40, 5],
          ],
          altura: 9,
        },
      ],
      rotulos: [{ texto: 'WC M', x: 10.5, z: 20.25 }],
      maquinas: [{ nome: 'Máquina 1', x: 60.5, z: 40.25, largura: 2.4, profundidade: 2.4 }],
    });
  });

  it('recusa o JSON que não é um modelo', () => {
    expect(() => lerModeloDoPmg({ qualquer: 1 })).toThrow(
      'Envie o desenho em DXF ou o modelo da planta em JSON.',
    );
  });
});

describe('a situação no mapa', () => {
  it('Impressora offline no mapa: a pior situação, por extenso e com o tom', () => {
    expect(situacaoNoMapa({ alertas: ['critico'], disponibilidade: 'online' })).toEqual({
      texto: 'Alerta crítico',
      tom: 'critico',
    });
    expect(situacaoNoMapa({ alertas: [], disponibilidade: 'offline' })).toEqual({
      texto: 'Offline',
      tom: 'critico',
    });
    expect(situacaoNoMapa({ alertas: ['atencao'], disponibilidade: 'online' })).toEqual({
      texto: 'Atenção',
      tom: 'atencao',
    });
    expect(situacaoNoMapa({ alertas: [], disponibilidade: 'online' })).toEqual({
      texto: 'Online',
      tom: 'sucesso',
    });
    expect(situacaoNoMapa({ alertas: [], disponibilidade: null })).toEqual({
      texto: 'Sem coleta',
      tom: 'neutra',
    });
  });
});
