// A ordem e os ocultos de uma lista das preferências, como os blocos do Início (spec tela-inicial,
// "Personalizar o Início", e preferencias-da-interface, "Blocos do Início nas preferências"; change
// inicio-ajustavel, design, decisão 2) e os módulos do dock (change dock-personalizavel, design,
// decisão 1).
import { describe, expect, it } from 'vitest';
import { listaComAusentes, moverItem, ocultarItem, ordenarItens } from './listaOrdenada.ts';

const registrados = [
  { id: 'inicio.resolver' },
  { id: 'ativos.suprimentos' },
  { id: 'gestao.backups' },
];
const ids = (itens: ReadonlyArray<{ id: string }>) => itens.map((item) => item.id);

describe('ordenarItens', () => {
  it('sem nada salvo, vale a ordem do registro, com todos à vista', () => {
    const { visiveis, ocultos } = ordenarItens(registrados, []);
    expect(ids(visiveis)).toEqual(['inicio.resolver', 'ativos.suprimentos', 'gestao.backups']);
    expect(ocultos).toEqual([]);
  });

  it('segue a ordem salva, com os ocultos à parte', () => {
    const { visiveis, ocultos } = ordenarItens(registrados, [
      { id: 'ativos.suprimentos', visivel: true },
      { id: 'gestao.backups', visivel: false },
      { id: 'inicio.resolver', visivel: true },
    ]);
    expect(ids(visiveis)).toEqual(['ativos.suprimentos', 'inicio.resolver']);
    expect(ids(ocultos)).toEqual(['gestao.backups']);
  });

  it('bloco de um módulo que saiu: ignorado, e os outros seguem a ordem salva', () => {
    const { visiveis } = ordenarItens(registrados, [
      { id: 'salas.agenda', visivel: true },
      { id: 'gestao.backups', visivel: true },
      { id: 'inicio.resolver', visivel: true },
    ]);
    expect(ids(visiveis)).toEqual(['gestao.backups', 'inicio.resolver', 'ativos.suprimentos']);
  });

  it('o bloco novo de um módulo entra no fim, à vista', () => {
    const { visiveis } = ordenarItens(registrados, [
      { id: 'gestao.backups', visivel: true },
      { id: 'inicio.resolver', visivel: true },
    ]);
    expect(ids(visiveis).at(-1)).toBe('ativos.suprimentos');
  });
});

describe('moverItem e ocultarItem', () => {
  const salvos = ordenarItens(registrados, []).lista;

  it('subir troca o bloco de lugar com o de cima, e a lista inteira vai gravada', () => {
    expect(moverItem(salvos, 'ativos.suprimentos', -1)).toEqual([
      { id: 'ativos.suprimentos', visivel: true },
      { id: 'inicio.resolver', visivel: true },
      { id: 'gestao.backups', visivel: true },
    ]);
  });

  it('subir passa por cima dos ocultos, até o bloco à vista de cima', () => {
    const comOculto = ocultarItem(salvos, 'ativos.suprimentos', true);
    expect(ids(moverItem(comOculto, 'gestao.backups', -1))).toEqual([
      'gestao.backups',
      'inicio.resolver',
      'ativos.suprimentos',
    ]);
  });

  it('ocultar e mostrar: o mostrado volta ao fim', () => {
    const oculto = ocultarItem(salvos, 'inicio.resolver', true);
    expect(ordenarItens(registrados, oculto).ocultos.map((bloco) => bloco.id)).toEqual([
      'inicio.resolver',
    ]);
    const mostrado = ocultarItem(oculto, 'inicio.resolver', false);
    expect(ids(ordenarItens(registrados, mostrado).visiveis)).toEqual([
      'ativos.suprimentos',
      'gestao.backups',
      'inicio.resolver',
    ]);
  });
});

// A lista gravada do dock guarda o módulo que quem ajusta não vê (change dock-personalizavel,
// design, decisão 4).
describe('listaComAusentes', () => {
  const item = (id: string, visivel = true) => ({ id, visivel });
  const naTela = [{ id: 'inicio' }, { id: 'ativos' }, { id: 'operacao' }];

  it('o id que o registro não traz continua no lugar dele, e o registrado que faltava entra no fim', () => {
    const salvos = [item('operacao'), item('cofre', false), item('inicio')];
    expect(listaComAusentes(naTela, salvos, 40)).toEqual([
      item('operacao'),
      item('cofre', false),
      item('inicio'),
      item('ativos'),
    ]);
  });

  it('sem nada salvo, é a ordem do registro, com todos à vista', () => {
    expect(listaComAusentes(naTela, [], 40)).toEqual([
      item('inicio'),
      item('ativos'),
      item('operacao'),
    ]);
  });

  it('os ausentes que passam do limite saem, e os registrados ficam todos', () => {
    const salvos = [item('cofre'), item('inicio'), item('salas'), item('paineis'), item('mapa')];
    expect(listaComAusentes(naTela, salvos, 5).map(({ id }) => id)).toEqual([
      'cofre',
      'inicio',
      'salas',
      'ativos',
      'operacao',
    ]);
  });
});

describe('moverItem com os ids da tela', () => {
  const item = (id: string, visivel = true) => ({ id, visivel });
  const naTela = new Set(['inicio', 'ativos', 'operacao']);
  const lista = [item('inicio'), item('cofre'), item('operacao'), item('ativos')];

  it('subir passa por cima do ausente, até o vizinho da tela, e o ausente continua na lista', () => {
    expect(ids(moverItem(lista, 'operacao', -1, naTela))).toEqual([
      'operacao',
      'inicio',
      'cofre',
      'ativos',
    ]);
  });

  it('descer passa por cima do ausente também', () => {
    expect(ids(moverItem(lista, 'inicio', 1, naTela))).toEqual([
      'cofre',
      'operacao',
      'inicio',
      'ativos',
    ]);
  });

  it('sem vizinho da tela daquele lado, a lista fica como está', () => {
    const soOAusenteAcima = [item('cofre'), item('inicio'), item('ativos')];
    expect(moverItem(soOAusenteAcima, 'inicio', -1, naTela)).toEqual(soOAusenteAcima);
  });
});

// A largura e as opções de um bloco do Início acompanham o item (change
// opcoes-dos-blocos-do-inicio, design, decisão 2).
describe('o que o item traz além do id e da visibilidade', () => {
  const comOpcoes = {
    id: 'ativos.suprimentos',
    visivel: true,
    largura: 'metade',
    opcoes: { tipos: ['toner'], nivel: 30 },
  };
  const lista = [
    { id: 'inicio.resolver', visivel: true },
    comOpcoes,
    { id: 'gestao.backups', visivel: true },
  ];

  it('o item movido leva a largura e as opções', () => {
    expect(moverItem(lista, 'ativos.suprimentos', -1)[0]).toEqual(comOpcoes);
    expect(moverItem(lista, 'ativos.suprimentos', 1)[2]).toEqual(comOpcoes);
  });

  it('o item oculto continua com a largura e as opções', () => {
    expect(ocultarItem(lista, 'ativos.suprimentos', true)[1]).toEqual({
      ...comOpcoes,
      visivel: false,
    });
  });

  it('o item mostrado de novo volta ao fim com a largura e as opções dele', () => {
    const oculto = ocultarItem(lista, 'ativos.suprimentos', true);
    const mostrado = ocultarItem(oculto, 'ativos.suprimentos', false);
    expect(ids(mostrado)).toEqual(['inicio.resolver', 'gestao.backups', 'ativos.suprimentos']);
    expect(mostrado.at(-1)).toEqual(comOpcoes);
  });

  it('a lista que vai gravada guarda os itens salvos como vieram', () => {
    expect(ordenarItens(registrados, lista).lista).toEqual(lista);
    expect(listaComAusentes(registrados, lista, 20)).toEqual(lista);
  });

  it('o item que a lista não trazia volta só com o id, à vista', () => {
    expect(ocultarItem(lista, 'salas.agenda', false).at(-1)).toEqual({
      id: 'salas.agenda',
      visivel: true,
    });
  });
});
