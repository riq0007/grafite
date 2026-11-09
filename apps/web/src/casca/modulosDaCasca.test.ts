import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Box, Settings } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { definirModulo } from '../modulos/tipos.ts';
import { moduloAtual, modulosDaCasca } from './modulosDaCasca.ts';

// Rotas de exemplo numa raiz própria, fora da árvore do app. Cada uma numa constante, como no
// contrato de módulo: criadas dentro do addChildren, as filhas perdem os tipos dos endereços.
const raiz = createRootRoute();
const lista = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
const switches = createRoute({ getParentRoute: () => lista, path: 'switches' });
const racks = createRoute({ getParentRoute: () => lista, path: 'racks' });
const importar = createRoute({ getParentRoute: () => lista, path: 'importar' });
const rotasDoExemplo = lista.addChildren([switches, racks, importar]);
const rotasDeAjustes = createRoute({ getParentRoute: () => raiz, path: '/ajustes' });
// Como no app, as rotas só ganham id quando um roteador monta a árvore.
createRouter({ routeTree: raiz.addChildren([rotasDoExemplo, rotasDeAjustes]) });

const exemplo = definirModulo({
  id: 'exemplo',
  nome: 'Exemplo',
  icone: Box,
  endereco: '/exemplo',
  prioridadeNoCelular: 2,
  rotas: rotasDoExemplo,
  menu: [
    { rotulo: 'Todos', destino: '/exemplo' },
    {
      rotulo: 'Rede',
      filhos: [
        { rotulo: 'Switches', destino: '/exemplo/switches' },
        { rotulo: 'Racks', destino: '/exemplo/racks' },
      ],
    },
    { rotulo: 'Importar planilha', destino: '/exemplo/importar', separadoAntes: true },
  ],
  menusDaBarra: [{ rotulo: 'Visualizar', itens: [{ rotulo: 'Racks', destino: '/exemplo/racks' }] }],
});

const ajustes = definirModulo({
  id: 'ajustes',
  nome: 'Ajustes',
  icone: Settings,
  endereco: '/ajustes',
  prioridadeNoCelular: 9,
  rotas: rotasDeAjustes,
});

describe('módulos da casca', () => {
  it('põe Ajustes no fim do dock, depois do separador, e os outros na ordem do registro', () => {
    const { modulos, modulosDoFim } = modulosDaCasca([ajustes, exemplo]);
    expect(modulos.map((modulo) => modulo.id)).toEqual(['exemplo']);
    expect(modulosDoFim.map((modulo) => modulo.id)).toEqual(['ajustes']);
  });

  it('leva nome, ícone e prioridade no celular', () => {
    const [modulo] = modulosDaCasca([exemplo]).modulos;
    expect(modulo).toMatchObject({ id: 'exemplo', nome: 'Exemplo', prioridadeNoCelular: 2 });
    expect(modulo?.icone).toBe(Box);
  });

  it('dá a cada item que navega o próprio destino como id, com submenus e linhas', () => {
    const [modulo] = modulosDaCasca([exemplo]).modulos;
    expect(modulo?.menu).toEqual([
      { id: '/exemplo', rotulo: 'Todos', separadoAntes: undefined },
      {
        id: 'exemplo › Rede',
        rotulo: 'Rede',
        separadoAntes: undefined,
        filhos: [
          { id: '/exemplo/switches', rotulo: 'Switches', separadoAntes: undefined },
          { id: '/exemplo/racks', rotulo: 'Racks', separadoAntes: undefined },
        ],
      },
      { id: '/exemplo/importar', rotulo: 'Importar planilha', separadoAntes: true },
    ]);
  });

  it('leva os menus da barra, identificados pelo rótulo', () => {
    const [modulo] = modulosDaCasca([exemplo]).modulos;
    expect(modulo?.menusDaBarra).toEqual([
      {
        id: 'Visualizar',
        rotulo: 'Visualizar',
        itens: [{ id: '/exemplo/racks', rotulo: 'Racks', separadoAntes: undefined }],
      },
    ]);
  });

  it('deixa sem menu o módulo que não registrou nenhum', () => {
    const [modulo] = modulosDaCasca([ajustes]).modulosDoFim;
    expect(modulo?.menu).toBeUndefined();
    expect(modulo?.menusDaBarra).toBeUndefined();
  });

  it('acha o módulo atual pelas rotas em que o endereço caiu, inclusive as de dentro dele', () => {
    const registro = [exemplo, ajustes];
    expect(moduloAtual(registro, ['__root__', '/ajustes'])?.id).toBe('ajustes');
    expect(moduloAtual(registro, ['__root__', '/exemplo', '/exemplo/racks'])?.id).toBe('exemplo');
  });

  it('não tem módulo atual num endereço que não leva a nenhum módulo', () => {
    expect(moduloAtual([exemplo, ajustes], ['__root__'])).toBeUndefined();
  });
});
