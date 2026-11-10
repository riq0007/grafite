// A ordem e os ocultos de uma lista das preferências, como os blocos do Início (spec tela-inicial,
// "Personalizar o Início", e preferencias-da-interface, "Blocos do Início nas preferências"; change
// inicio-ajustavel, design, decisão 2) e os módulos do dock (change dock-personalizavel, design,
// decisão 1).
import { describe, expect, it } from 'vitest';
import { moverItem, ocultarItem, ordenarItens } from './listaOrdenada.ts';

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
