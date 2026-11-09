import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
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

const JOAO = {
  id: 'joao',
  nome: 'João da Silva',
  email: 'joao@empresa.com.br',
  matricula: '004512',
  telefone: null,
  situacao: 'ativa',
  local: { id: 'jundiai', caminho: 'Jundiaí', situacao: 'ativo' },
  conta: { id: 'c-joao', usuario: 'joao.silva', situacao: 'ativa' },
  permite: {
    editar: false,
    inativar: false,
    reativar: false,
    anonimizar: false,
    criarConta: false,
    administrarConta: false,
  },
};

function abrir(permissoes: PermissaoDaSessao[], servidor: ServidorDeTeste = {}) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, {
        'GET /api/locais': () => Response.json({ locais: [], permite: { cadastrarNaRaiz: true } }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const busca = () => screen.findByRole('dialog', { name: 'Busca' });

/** Abre a busca e digita o texto. */
async function buscar(texto: string) {
  await screen.findByRole('heading', { level: 1, name: 'O que resolver agora' });
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Buscar' }));
  const campo = within(await busca()).getByRole('searchbox', { name: 'Buscar' });
  fireEvent.change(campo, { target: { value: texto } });
  return campo;
}

const opcoesDe = async (grupo: string) =>
  within(within(await busca()).getByRole('group', { name: grupo }))
    .getAllByRole('option')
    .map((opcao) => opcao.textContent);

describe('a Administração na busca', () => {
  it('o grupo "Pessoas" acha pela matrícula na API, e escolher abre a ficha', async () => {
    const pedidos: URLSearchParams[] = [];
    const roteador = abrir(naOrganizacao('pessoas.ver'), {
      'GET /api/pessoas': (pedido) => {
        pedidos.push(new URL(pedido.url).searchParams);
        return Response.json({ itens: [JOAO], proximo: null, total: 1 });
      },
      'GET /api/pessoas/joao': () => Response.json(JOAO),
    });
    await buscar('004512');
    const pessoas = await within(await busca()).findByRole('group', { name: 'Pessoas' });
    const joao = await within(pessoas).findByRole('option', { name: /João da Silva/ });
    expect(joao.textContent).toContain('004512 · joao.silva · Jundiaí');
    expect(pedidos.at(-1)?.get('busca')).toBe('004512');
    expect(pedidos.at(-1)?.get('limite')).toBe('8');
    fireEvent.click(joao);
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/pessoas/joao'),
    );
  });

  it('sem pessoas.ver, a busca não tem o grupo "Pessoas" e não pergunta à API', async () => {
    const pessoas = vi.fn(() => Response.json({ itens: [JOAO], proximo: null, total: 1 }));
    abrir(naOrganizacao('auditoria.ver'), { 'GET /api/pessoas': pessoas });
    await buscar('joao');
    await new Promise((resolver) => setTimeout(resolver, 300));
    expect(within(await busca()).queryByRole('group', { name: 'Pessoas' })).toBeNull();
    expect(pessoas).not.toHaveBeenCalled();
  });

  it('as ações de cadastro aparecem conforme a permissão e levam ao cadastro', async () => {
    // A sessão traz as permissões incluídas, como a API as resolve.
    abrir(naOrganizacao('pessoas.editar', 'pessoas.ver', 'locais.editar'), {
      'GET /api/pessoas': () => Response.json({ itens: [], proximo: null, total: 0 }),
    });
    await buscar('cadastrar');
    expect(await opcoesDe('Ações')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Nova pessoa'),
        expect.stringContaining('Novo local'),
      ]),
    );
    expect((await opcoesDe('Ações')).join()).not.toMatch(/Novo perfil|Novo grupo/);
    cleanup();

    const roteador = abrir(naOrganizacao('acessos.administrar', 'acessos.ver', 'pessoas.ver'), {
      'GET /api/pessoas': () => Response.json({ itens: [], proximo: null, total: 0 }),
    });
    await buscar('novo');
    const acoes = within(await busca()).getByRole('group', { name: 'Ações' });
    expect(within(acoes).queryByRole('option', { name: /Nova pessoa/ })).toBeNull();
    expect(within(acoes).getByRole('option', { name: /Novo grupo/ })).toBeTruthy();
    fireEvent.click(within(acoes).getByRole('option', { name: /Novo perfil/ }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/perfis/novo'),
    );
  });
});
