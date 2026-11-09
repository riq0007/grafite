import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../sessao/useAcesso.ts';
import { noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const vazia = () => Response.json({ itens: [], proximo: null, total: 0, permite: {} });

/** O app aberto no endereço, com as telas da Gestão respondendo vazias. */
function abrir(endereco: string, permissoes: PermissaoDaSessao[], servidor: ServidorDeTeste = {}) {
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, {
        'GET /api/tipos-de-ativo': () => Response.json({ tipos: [], permite: { cadastrar: true } }),
        'GET /api/campos': () => Response.json({ campos: [], permite: { cadastrar: false } }),
        'GET /api/visoes': () => Response.json({ visoes: [], permite: { compartilhar: false } }),
        'GET /api/ativos/importacoes': vazia,
        'GET /api/software/pacotes': vazia,
        'GET /api/software/distribuicoes': vazia,
        'GET /api/controlid/backups': vazia,
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={criarCanalDeEventos()}
    />,
  );
  return roteador;
}

// O item do dock leva à primeira tela que a conta pode usar (spec modulo-gestao-de-ativos, "Gestão
// de ativos no dock").
describe('o início da Gestão de ativos', () => {
  it('Quem administra o catálogo: o endereço do módulo abre a tela de tipos', async () => {
    noComputador();
    const roteador = abrir('/gestao', naOrganizacao('catalogo.administrar'));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/gestao/catalogo/tipos'));
  });

  it('Quem edita ativos: sem o catálogo, o endereço do módulo abre a lista das importações', async () => {
    noComputador();
    const roteador = abrir('/gestao', naOrganizacao('ativos.ver', 'ativos.editar'));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/gestao/importacoes'));
  });

  it('quem só distribui software abre o Software, e quem só vê o Control iD, os backups', async () => {
    noComputador();
    const software = abrir('/gestao', naOrganizacao('software.distribuir'));
    await waitFor(() => expect(software.state.location.pathname).toBe('/gestao/software'));
    cleanup();
    const controlId = abrir('/gestao', naOrganizacao('controlid.ver'));
    await waitFor(() =>
      expect(controlId.state.location.pathname).toBe('/gestao/control-id/backups'),
    );
  });

  it('sem nenhuma das permissões, diz a quem pedir acesso', async () => {
    noComputador();
    const roteador = abrir('/gestao', naOrganizacao('ativos.ver'));
    expect(await screen.findByText('Você não tem acesso à Gestão de ativos.')).toBeTruthy();
    expect(roteador.state.location.pathname).toBe('/gestao');
  });
});

// Os endereços que saíram do Ativos levam aos novos, sem ficar no histórico (spec
// modulo-gestao-de-ativos, "Endereços antigos da Gestão de ativos").
describe('os endereços antigos', () => {
  it('Favorito da ficha de um modelo: abre a ficha em /gestao/catalogo/modelos/<id>', async () => {
    noComputador();
    const roteador = abrir('/ativos/catalogo/modelos/m404', naOrganizacao('modelos.editar'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/modelos/m404'),
    );
  });

  it('Favorito das importações: abre a lista em /gestao/importacoes', async () => {
    noComputador();
    const roteador = abrir('/ativos/importacoes', naOrganizacao('ativos.ver', 'ativos.editar'));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/gestao/importacoes'));
  });

  it('Filtro guardado no endereço: a busca vai junto', async () => {
    noComputador();
    const roteador = abrir(
      '/ativos/catalogo/tipos?situacao=inativos',
      naOrganizacao('catalogo.administrar'),
    );
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/gestao/catalogo/tipos'));
    expect(roteador.state.location.search).toEqual({ situacao: 'inativos' });
  });

  it('o software e o Control iD também, com a aba do software', async () => {
    noComputador();
    const software = abrir(
      '/ativos/software?aba=distribuicoes',
      naOrganizacao('software.distribuir'),
    );
    await waitFor(() => expect(software.state.location.pathname).toBe('/gestao/software'));
    expect(software.state.location.search).toEqual({ aba: 'distribuicoes' });
    cleanup();
    const controlId = abrir('/ativos/control-id/comparar', naOrganizacao('controlid.ver'));
    await waitFor(() =>
      expect(controlId.state.location.pathname).toBe('/gestao/control-id/comparar'),
    );
  });

  it('o endereço sem o resto não abre a ficha de um ativo, e o antigo sai do histórico', async () => {
    noComputador();
    const ficha = vi.fn(() => Response.json({}));
    const roteador = abrir('/ativos/catalogo', naOrganizacao('catalogo.administrar'), {
      'GET /api/ativos/catalogo': ficha,
    });
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/gestao/catalogo/tipos'));
    expect(ficha).not.toHaveBeenCalled();
    expect(roteador.history.length).toBe(1);
  });
});
