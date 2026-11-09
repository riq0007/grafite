import { createRoute } from '@tanstack/react-router';
import { Box, Palette } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { definirModulo } from '../modulos/tipos.ts';
import { raiz } from '../rotas/raiz.tsx';
import { entradasDoRegistro } from './fontes.ts';

const lista = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
const racks = createRoute({ getParentRoute: () => lista, path: 'racks' });
const pontos = createRoute({ getParentRoute: () => lista, path: 'pontos' });
const galeria = createRoute({ getParentRoute: () => lista, path: 'galeria' });

const exemplo = definirModulo({
  id: 'exemplo',
  nome: 'Exemplo',
  icone: Box,
  endereco: '/exemplo',
  prioridadeNoCelular: 2,
  rotas: lista.addChildren([racks, pontos, galeria]),
  menu: [
    {
      rotulo: 'Rede',
      filhos: [
        { rotulo: 'Racks', destino: '/exemplo/racks' },
        { rotulo: 'Pontos de rede', destino: '/exemplo/pontos' },
      ],
    },
  ],
  menusDaBarra: [
    { rotulo: 'Visualizar', itens: [{ rotulo: 'Galeria', destino: '/exemplo/galeria' }] },
  ],
  busca: {
    entradas: [
      {
        id: 'tema',
        rotulo: 'Tema',
        grupo: 'ajustes',
        caminho: 'Exemplo › Aparência',
        palavrasChave: ['cor'],
        icone: Palette,
        destino: '/exemplo',
        foco: 'tema',
      },
    ],
  },
});

describe('entradasDoRegistro', () => {
  it('Ir para traz o módulo e as folhas dos menus, com o caminho até cada uma', () => {
    const irPara = entradasDoRegistro([exemplo]).filter((entrada) => entrada.grupo === 'ir-para');
    expect(
      irPara.map(({ rotulo, origem, caminho, destino }) => ({ rotulo, origem, caminho, destino })),
    ).toEqual([
      { rotulo: 'Exemplo', origem: 'modulo', caminho: undefined, destino: '/exemplo' },
      { rotulo: 'Racks', origem: 'menu', caminho: 'Exemplo › Rede', destino: '/exemplo/racks' },
      {
        rotulo: 'Pontos de rede',
        origem: 'menu',
        caminho: 'Exemplo › Rede',
        destino: '/exemplo/pontos',
      },
      {
        rotulo: 'Galeria',
        origem: 'menu',
        caminho: 'Exemplo › Visualizar',
        destino: '/exemplo/galeria',
      },
    ]);
  });

  it('o módulo e os itens dos menus aparecem com o ícone do módulo', () => {
    const irPara = entradasDoRegistro([exemplo]).filter((entrada) => entrada.grupo === 'ir-para');
    expect(irPara.every((entrada) => entrada.icone === Box)).toBe(true);
  });

  it('as entradas declaradas pelo módulo entram como declaradas, com o foco e o ícone delas', () => {
    const tema = entradasDoRegistro([exemplo]).find((entrada) => entrada.id === 'exemplo:tema');
    expect(tema).toMatchObject({
      rotulo: 'Tema',
      grupo: 'ajustes',
      origem: 'declarada',
      caminho: 'Exemplo › Aparência',
      palavrasChave: ['cor'],
      icone: Palette,
      destino: '/exemplo',
      foco: 'tema',
    });
  });

  it('os ids não se repetem entre módulos, menus e entradas declaradas', () => {
    const ids = entradasDoRegistro([exemplo]).map((entrada) => entrada.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
