import type { AjustesDasPreferencias } from '@grafite/domain';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const pessoa = (
  id: string,
  nome: string,
  extras: Partial<{
    matricula: string | null;
    local: { id: string; caminho: string; situacao: 'ativo' | 'inativo' } | null;
    conta: {
      id: string;
      usuario: string | null;
      situacao: 'ativa' | 'inativa' | 'anonimizada';
    } | null;
    situacao: 'ativa' | 'inativa' | 'anonimizada';
  }> = {},
) => ({
  id,
  nome,
  email: `${id}@empresa.com.br`,
  matricula: null,
  telefone: null,
  situacao: 'ativa',
  local: null,
  conta: null,
  permite: {
    editar: true,
    inativar: true,
    reativar: false,
    anonimizar: false,
    criarConta: true,
    administrarConta: true,
  },
  ...extras,
});

const JUNDIAI = { id: 'jundiai', caminho: 'Jundiaí', situacao: 'ativo' } as const;
const JOAO = pessoa('joao', 'João da Silva', {
  matricula: '004512',
  local: JUNDIAI,
  conta: { id: 'c-joao', usuario: 'joao.silva', situacao: 'ativa' },
});
const MARIA = pessoa('maria', 'Maria Lima', {
  conta: { id: 'c-maria', usuario: 'maria.lima', situacao: 'inativa' },
});
const PEDRO = pessoa('pedro', 'Pedro Alves', { situacao: 'inativa' });

const ARVORE = {
  locais: [
    {
      id: 'jundiai',
      paiId: null,
      nome: 'Jundiaí',
      tipo: 'unidade',
      situacao: 'ativo',
      permite: { editar: true },
    },
  ],
  permite: { cadastrarNaRaiz: true },
};

/** O GET /pessoas que guarda os parâmetros de cada pedido e responde com a lista dada. */
function servidorDePessoas(
  responder: (parametros: URLSearchParams) => Response = () =>
    Response.json({ itens: [JOAO, MARIA, PEDRO], proximo: null, total: 3 }),
) {
  const pedidos: URLSearchParams[] = [];
  const servidor: ServidorDeTeste = {
    'GET /api/pessoas': (pedido) => {
      const parametros = new URL(pedido.url).searchParams;
      pedidos.push(parametros);
      return responder(parametros);
    },
    'GET /api/locais': () => Response.json(ARVORE),
  };
  return { servidor, pedidos };
}

function abrir(
  servidor: ServidorDeTeste,
  {
    permissoes = naOrganizacao('pessoas.ver'),
    endereco = '/administracao/pessoas',
    canal = criarCanalDeEventos(),
    preferencias = {},
  }: {
    permissoes?: ReturnType<typeof naOrganizacao>;
    endereco?: string;
    canal?: ReturnType<typeof criarCanalDeEventos>;
    preferencias?: AjustesDasPreferencias;
  } = {},
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor, preferencias)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return roteador;
}

const tabela = () => screen.findByRole('grid', { name: 'Pessoas' });
const linhas = async () =>
  within(await tabela())
    .getAllByRole('row')
    .slice(1);
const nomes = async () =>
  (await linhas()).map((linha) => within(linha).getByRole('rowheader').textContent);

describe('tela de pessoas', () => {
  it('mostra a tabela com as colunas e o número de pessoas', async () => {
    abrir(servidorDePessoas().servidor);
    const colunas = within(await tabela())
      .getAllByRole('columnheader')
      .map((coluna) => coluna.textContent);
    expect(colunas).toEqual([
      'Foto',
      'Nome',
      'Matrícula',
      'Local de trabalho',
      'Conta',
      'Situação',
    ]);
    expect(await nomes()).toEqual(['João da Silva', 'Maria Lima', 'Pedro Alves']);
    const [joao, maria, pedro] = await linhas();
    expect(joao?.textContent).toContain('004512');
    expect(joao?.textContent).toContain('Jundiaí');
    expect(joao?.textContent).toContain('joao.silva');
    expect(maria?.textContent).toContain('maria.lima');
    expect(maria?.textContent).toContain('Conta inativa');
    expect(pedro?.textContent).toContain('Sem conta');
    expect(pedro?.textContent).toContain('Inativa');
    expect(screen.getByText('3 pessoas')).toBeTruthy();
  });

  it('uma pessoa cadastrada em outro lugar aparece na lista aberta, sem uma ação', async () => {
    const canal = criarCanalDeEventos();
    let lista = [JOAO, MARIA, PEDRO];
    abrir(
      servidorDePessoas(() => Response.json({ itens: lista, proximo: null, total: lista.length }))
        .servidor,
      { canal },
    );
    expect(await nomes()).toEqual(['João da Silva', 'Maria Lima', 'Pedro Alves']);
    const ANA = pessoa('ana', 'Ana Souza');
    lista = [ANA, JOAO, MARIA, PEDRO];
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000009',
      tipo: 'pessoas.mudaram',
      momento: '2026-10-07T12:00:00.000Z',
      alvo: { tipo: 'pessoa', id: ANA.id },
    });
    await vi.waitFor(async () =>
      expect(await nomes()).toEqual(['Ana Souza', 'João da Silva', 'Maria Lima', 'Pedro Alves']),
    );
    expect(screen.getByText('4 pessoas')).toBeTruthy();
  });

  it('a linha começa pela foto da pessoa, ou pelas iniciais sem foto', async () => {
    const FOTO = { id: '0199a6e0-0000-7000-8000-0000000000f1' };
    abrir(
      servidorDePessoas(() =>
        Response.json({ itens: [{ ...JOAO, foto: FOTO }, MARIA], proximo: null, total: 2 }),
      ).servidor,
    );
    const [joao, maria] = await linhas();
    expect(joao?.querySelector('img')?.getAttribute('srcset')).toContain(
      `/api/pessoas/joao/foto/${FOTO.id}/64 64w`,
    );
    expect(maria?.querySelector('img')).toBeNull();
    expect(maria?.textContent).toContain('ML');
  });

  it('com as miniaturas desligadas nos Ajustes, as linhas não mostram as fotos', async () => {
    abrir(servidorDePessoas().servidor, { preferencias: { tabelas: { miniaturas: false } } });
    expect(await nomes()).toEqual(['João da Silva', 'Maria Lima', 'Pedro Alves']);
    const colunas = within(await tabela())
      .getAllByRole('columnheader')
      .map((coluna) => coluna.textContent);
    expect(colunas).not.toContain('Foto');
  });

  it('a busca e os filtros vão à API, ficam à vista e se limpam', async () => {
    const { servidor, pedidos } = servidorDePessoas();
    const roteador = abrir(servidor);
    await tabela();
    expect(pedidos.at(-1)?.get('situacao')).toBe('ativas');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pessoas' }), {
      target: { value: 'silva joao' },
    });
    await waitFor(() => expect(pedidos.at(-1)?.get('busca')).toBe('silva joao'));
    expect(roteador.state.location.search).toMatchObject({ busca: 'silva joao' });

    await roteador.navigate({
      to: '/administracao/pessoas',
      search: { busca: 'silva joao', situacao: 'inativas', local: 'jundiai' },
    });
    await waitFor(() => expect(pedidos.at(-1)?.get('situacao')).toBe('inativas'));
    expect(pedidos.at(-1)?.get('local')).toBe('jundiai');
    const ativos = await screen.findByRole('group', { name: 'Filtros ativos' });
    await waitFor(() =>
      expect(
        within(ativos)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Busca · silva joao', 'Situação · Inativas', 'Local de trabalho · Jundiaí']),
    );
    fireEvent.click(
      within(ativos).getByRole('button', { name: 'Limpar o filtro Situação: Inativas' }),
    );
    await waitFor(() => expect(pedidos.at(-1)?.get('situacao')).toBe('ativas'));
    fireEvent.click(within(ativos).getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({}));
    expect(screen.queryByRole('group', { name: 'Filtros ativos' })).toBeNull();
  });

  it('"Carregar mais" traz as próximas pessoas ao fim, até a última', async () => {
    const { servidor } = servidorDePessoas((parametros) =>
      parametros.get('cursor') === 'c2'
        ? Response.json({ itens: [PEDRO], proximo: null, total: 3 })
        : Response.json({ itens: [JOAO, MARIA], proximo: 'c2', total: 3 }),
    );
    abrir(servidor);
    expect(await nomes()).toEqual(['João da Silva', 'Maria Lima']);
    expect(screen.getByText('3 pessoas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(async () =>
      expect(await nomes()).toEqual(['João da Silva', 'Maria Lima', 'Pedro Alves']),
    );
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('o clique na linha abre a ficha', async () => {
    const roteador = abrir(servidorDePessoas().servidor);
    const [joao] = await linhas();
    fireEvent.click(within(joao as HTMLElement).getByText('004512'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/pessoas/joao'),
    );
  });

  it('Enter na linha em foco abre a ficha', async () => {
    const roteador = abrir(servidorDePessoas().servidor);
    const [, maria] = await linhas();
    (maria as HTMLElement).focus();
    fireEvent.keyDown(maria as HTMLElement, { key: 'Enter' });
    fireEvent.keyUp(maria as HTMLElement, { key: 'Enter' });
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/pessoas/maria'),
    );
  });

  it('a barra de espaço abre a prévia da pessoa', async () => {
    abrir(servidorDePessoas().servidor);
    const [joao] = await linhas();
    (joao as HTMLElement).focus();
    fireEvent.keyDown(joao as HTMLElement, { key: ' ' });
    const previa = await screen.findByRole('dialog', { name: /João da Silva/ });
    expect(within(previa).getByText('joao@empresa.com.br')).toBeTruthy();
    expect(within(previa).getByText('004512')).toBeTruthy();
    expect(within(previa).getByRole('button', { name: 'Abrir a ficha' })).toBeTruthy();
  });

  it('enquanto carrega, diz que está carregando', async () => {
    abrir({
      ...servidorDePessoas().servidor,
      'GET /api/pessoas': () => new Promise<Response>(() => {}),
    });
    expect(await screen.findByText('Carregando as pessoas…')).toBeTruthy();
  });

  it('vazia com filtro, oferece "Limpar filtros"; sem filtro, "Nova pessoa" a quem edita', async () => {
    const { servidor } = servidorDePessoas(() =>
      Response.json({ itens: [], proximo: null, total: 0 }),
    );
    const roteador = abrir(servidor, { endereco: '/administracao/pessoas?busca=ninguem' });
    expect(await screen.findByText('Nenhuma pessoa encontrada.')).toBeTruthy();
    const vazio = screen.getByText('Nenhuma pessoa encontrada.').parentElement as HTMLElement;
    fireEvent.click(within(vazio).getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({}));
    cleanup();

    abrir(servidor, { permissoes: naOrganizacao('pessoas.ver', 'pessoas.editar') });
    const semFiltro = (await screen.findByText('Nenhuma pessoa encontrada.')).parentElement;
    expect(
      within(semFiltro as HTMLElement).getByRole('button', { name: 'Nova pessoa' }),
    ).toBeTruthy();
  });

  it('um erro do servidor aparece em texto, com "Tentar de novo"', async () => {
    let falhar = true;
    const { servidor } = servidorDePessoas(() =>
      falhar
        ? Response.json(
            {
              type: 'urn:grafite:problema:erro-interno',
              title: 'Erro interno',
              status: 500,
              detail: 'Erro interno.',
              codigoDeRastreio: 'R7K2-9QXM',
            },
            { status: 500 },
          )
        : Response.json({ itens: [JOAO], proximo: null, total: 1 }),
    );
    abrir(servidor);
    expect(
      await screen.findByText(
        'Não foi possível carregar as pessoas. Informe à TI o código R7K2-9QXM.',
      ),
    ).toBeTruthy();
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await nomes()).toEqual(['João da Silva']);
  });

  it('sem conexão, diz isso, com "Tentar de novo"', async () => {
    abrir({
      ...servidorDePessoas().servidor,
      'GET /api/pessoas': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    expect(await screen.findByText('Sem conexão com o servidor. Tente de novo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });

  it('"Nova pessoa" aparece só para quem edita pessoas e leva ao cadastro', async () => {
    abrir(servidorDePessoas().servidor);
    await tabela();
    expect(screen.queryByRole('button', { name: 'Nova pessoa' })).toBeNull();
    cleanup();

    const roteador = abrir(servidorDePessoas().servidor, {
      permissoes: naOrganizacao('pessoas.ver', 'pessoas.editar'),
    });
    await tabela();
    fireEvent.click(screen.getByRole('button', { name: 'Nova pessoa' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/pessoas/nova'),
    );
  });
});
