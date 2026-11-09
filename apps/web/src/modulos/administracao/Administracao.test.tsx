import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../sessao/useAcesso.ts';
import { noCelular, noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';
import { registroDaConta } from '../registroDaConta.ts';
import { administracao } from './modulo.ts';
import { pedirAcessoA } from './SemPermissao.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function abrir(endereco: string, permissoes: PermissaoDaSessao[], servidor: ServidorDeTeste = {}) {
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(<App roteador={roteador} sessao={sessaoAtiva(permissoes, servidor)} />);
  return roteador;
}

const titulo = (nome: string) => screen.findByRole('heading', { level: 1, name: nome });
const secoes = () => screen.getByRole('navigation', { name: 'Seções da Administração' });
const nomesDasSecoes = () =>
  within(secoes())
    .getAllByRole('link')
    .map((link) => link.textContent);

describe('Administração', () => {
  it('mostra, ao lado da seção escolhida, só as seções que a conta pode usar', async () => {
    noComputador();
    abrir('/administracao/pessoas', naOrganizacao('pessoas.ver', 'acessos.ver'));
    await titulo('Pessoas');
    expect(nomesDasSecoes()).toEqual(['Pessoas', 'Perfis', 'Grupos']);
    expect(
      within(secoes()).getByRole('link', { name: 'Pessoas' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('o endereço da Administração leva à primeira seção que a conta pode usar', async () => {
    noComputador();
    const roteador = abrir('/administracao', naOrganizacao('locais.editar', 'auditoria.ver'));
    await titulo('Locais');
    expect(roteador.state.location.pathname).toBe('/administracao/locais');
  });

  it('a seção sem permissão diz a quem pedir acesso, sem pedir os dados dela', async () => {
    noComputador();
    const perfis = vi.fn(() => Response.json({ itens: [] }));
    abrir('/administracao/perfis', naOrganizacao('pessoas.ver'), {
      'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
      'GET /api/perfis': perfis,
    });
    await titulo('Perfis');
    expect(await screen.findByText('Você não tem acesso a Perfis.')).toBeTruthy();
    expect(await screen.findByText('Peça acesso a Ana Souza.')).toBeTruthy();
    expect(perfis).not.toHaveBeenCalled();
  });

  it('sem nenhuma seção, o endereço da Administração diz a quem pedir acesso', async () => {
    noComputador();
    abrir('/administracao', [], {
      'GET /api/acesso/administradores': () => Response.json({ administradores: [] }),
    });
    await titulo('Administração');
    expect(await screen.findByText('Você não tem acesso à Administração.')).toBeTruthy();
    expect(await screen.findByText('Peça acesso a quem administra os acessos.')).toBeTruthy();
  });

  it('no celular, a lista e a seção aparecem uma de cada vez', async () => {
    noCelular();
    const roteador = abrir('/administracao', naOrganizacao('pessoas.ver', 'auditoria.ver'));
    await titulo('Administração');
    expect(nomesDasSecoes()).toEqual(['Pessoas', 'Auditoria']);
    expect(roteador.state.location.pathname).toBe('/administracao');
  });

  it('no celular, a Administração fica em "Mais"', async () => {
    noCelular();
    abrir('/', naOrganizacao('pessoas.ver'));
    await titulo('O que resolver agora');
    const abas = within(screen.getByRole('navigation', { name: 'Módulos' }))
      .getAllByRole('button')
      .map((aba) => aba.getAttribute('aria-label'));
    expect(abas).toEqual(['Início', 'Ajustes', 'Mais']);
  });
});

describe('a Administração com os padrões e as tarefas', () => {
  it('só com organizacao.editar, a lista de seções mostra só Padrões e Módulos', async () => {
    noComputador();
    abrir('/administracao', naOrganizacao('organizacao.editar'));
    await titulo('Padrões');
    expect(nomesDasSecoes()).toEqual(['Padrões', 'Módulos']);
  });

  it('só com tarefas.administrar, o endereço da Administração leva às Tarefas', async () => {
    noComputador();
    const roteador = abrir('/administracao', naOrganizacao('tarefas.administrar'), {
      'GET /api/tarefas-com-falha': () => Response.json({ itens: [], proximo: null }),
    });
    await titulo('Tarefas');
    expect(roteador.state.location.pathname).toBe('/administracao/tarefas');
    expect(nomesDasSecoes()).toEqual(['Tarefas']);
  });
});

describe('o módulo no registro', () => {
  const daConta = (...chaves: Parameters<typeof naOrganizacao>) =>
    registroDaConta([administracao], (chave) => chaves.includes(chave));

  it('aparece para quem tem ao menos uma das permissões das seções', () => {
    expect(daConta()).toEqual([]);
    for (const chave of [
      'pessoas.ver',
      'acessos.ver',
      'locais.editar',
      'fornecedores.ver',
      'organizacao.editar',
      'auditoria.ver',
      'tarefas.administrar',
      'coletores.administrar',
    ] as const) {
      expect(
        daConta(chave).map((modulo) => modulo.id),
        chave,
      ).toEqual(['administracao']);
    }
  });

  it('o menu do dock tem, na ordem, só as seções que a conta pode usar', () => {
    const rotulos = (...chaves: Parameters<typeof naOrganizacao>) =>
      daConta(...chaves)[0]?.menu?.map((item) => item.rotulo);
    expect(rotulos('auditoria.ver')).toEqual(['Auditoria']);
    expect(rotulos('organizacao.editar')).toEqual(['Padrões', 'Módulos']);
    expect(rotulos('tarefas.administrar')).toEqual(['Tarefas']);
    expect(rotulos('fornecedores.ver')).toEqual(['Fornecedores']);
    expect(
      rotulos(
        'pessoas.ver',
        'acessos.ver',
        'locais.editar',
        'fornecedores.ver',
        'organizacao.editar',
        'auditoria.ver',
        'tarefas.administrar',
        'coletores.administrar',
      ),
    ).toEqual([
      'Pessoas',
      'Perfis',
      'Grupos',
      'Locais',
      'Fornecedores',
      'Padrões',
      'Módulos',
      'Coletores',
      'Agentes',
      'Auditoria',
      'Tarefas',
    ]);
  });

  it('cada item do menu leva à seção dele: Padrões, Módulos e Tarefas com as permissões', () => {
    const menu = daConta('organizacao.editar', 'tarefas.administrar')[0]?.menu;
    expect(menu).toEqual([
      {
        rotulo: 'Padrões',
        destino: '/administracao/padroes',
        permissoes: ['organizacao.editar'],
      },
      {
        rotulo: 'Módulos',
        destino: '/administracao/modulos',
        permissoes: ['organizacao.editar'],
      },
      {
        rotulo: 'Tarefas',
        destino: '/administracao/tarefas',
        permissoes: ['tarefas.administrar'],
      },
    ]);
  });
});

describe('pedirAcessoA', () => {
  it('diz a quem pedir, com um, dois ou três nomes, ou quem administra', () => {
    expect(pedirAcessoA(['Ana Souza'])).toBe('Peça acesso a Ana Souza.');
    expect(pedirAcessoA(['Ana Souza', 'Bruno Costa'])).toBe(
      'Peça acesso a Ana Souza ou Bruno Costa.',
    );
    expect(pedirAcessoA(['Ana Souza', 'Bruno Costa', 'Carla Dias'])).toBe(
      'Peça acesso a Ana Souza, Bruno Costa ou Carla Dias.',
    );
    expect(pedirAcessoA([])).toBe('Peça acesso a quem administra os acessos.');
  });
});
