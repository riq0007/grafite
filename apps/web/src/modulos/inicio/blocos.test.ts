// A ordem e os ocultos dos blocos do Início (spec tela-inicial, "Personalizar o Início", e
// preferencias-da-interface, "Blocos do Início nas preferências"; change inicio-ajustavel, design,
// decisão 2).
import { describe, expect, it } from 'vitest';
import { moverBloco, ocultarBloco, ordenarBlocos } from './blocos.ts';

const registrados = [
  { id: 'inicio.resolver' },
  { id: 'ativos.suprimentos' },
  { id: 'gestao.backups' },
];
const ids = (blocos: ReadonlyArray<{ id: string }>) => blocos.map((bloco) => bloco.id);

describe('ordenarBlocos', () => {
  it('sem nada salvo, vale a ordem do registro, com todos à vista', () => {
    const { visiveis, ocultos } = ordenarBlocos(registrados, []);
    expect(ids(visiveis)).toEqual(['inicio.resolver', 'ativos.suprimentos', 'gestao.backups']);
    expect(ocultos).toEqual([]);
  });

  it('segue a ordem salva, com os ocultos à parte', () => {
    const { visiveis, ocultos } = ordenarBlocos(registrados, [
      { id: 'ativos.suprimentos', visivel: true },
      { id: 'gestao.backups', visivel: false },
      { id: 'inicio.resolver', visivel: true },
    ]);
    expect(ids(visiveis)).toEqual(['ativos.suprimentos', 'inicio.resolver']);
    expect(ids(ocultos)).toEqual(['gestao.backups']);
  });

  it('bloco de um módulo que saiu: ignorado, e os outros seguem a ordem salva', () => {
    const { visiveis } = ordenarBlocos(registrados, [
      { id: 'salas.agenda', visivel: true },
      { id: 'gestao.backups', visivel: true },
      { id: 'inicio.resolver', visivel: true },
    ]);
    expect(ids(visiveis)).toEqual(['gestao.backups', 'inicio.resolver', 'ativos.suprimentos']);
  });

  it('o bloco novo de um módulo entra no fim, à vista', () => {
    const { visiveis } = ordenarBlocos(registrados, [
      { id: 'gestao.backups', visivel: true },
      { id: 'inicio.resolver', visivel: true },
    ]);
    expect(ids(visiveis).at(-1)).toBe('ativos.suprimentos');
  });
});

describe('moverBloco e ocultarBloco', () => {
  const salvos = ordenarBlocos(registrados, []).lista;

  it('subir troca o bloco de lugar com o de cima, e a lista inteira vai gravada', () => {
    expect(moverBloco(salvos, 'ativos.suprimentos', -1)).toEqual([
      { id: 'ativos.suprimentos', visivel: true },
      { id: 'inicio.resolver', visivel: true },
      { id: 'gestao.backups', visivel: true },
    ]);
  });

  it('subir passa por cima dos ocultos, até o bloco à vista de cima', () => {
    const comOculto = ocultarBloco(salvos, 'ativos.suprimentos', true);
    expect(ids(moverBloco(comOculto, 'gestao.backups', -1))).toEqual([
      'gestao.backups',
      'inicio.resolver',
      'ativos.suprimentos',
    ]);
  });

  it('ocultar e mostrar: o mostrado volta ao fim', () => {
    const oculto = ocultarBloco(salvos, 'inicio.resolver', true);
    expect(ordenarBlocos(registrados, oculto).ocultos.map((bloco) => bloco.id)).toEqual([
      'inicio.resolver',
    ]);
    const mostrado = ocultarBloco(oculto, 'inicio.resolver', false);
    expect(ids(ordenarBlocos(registrados, mostrado).visiveis)).toEqual([
      'ativos.suprimentos',
      'gestao.backups',
      'inicio.resolver',
    ]);
  });
});
