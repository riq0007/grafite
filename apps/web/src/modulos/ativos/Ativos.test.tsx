import type { components } from '@grafite/api-client';
import type { Permissao } from '@grafite/domain';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../sessao/useAcesso.ts';
import { noCelular, noComputador } from '../../teste/postura.ts';
import {
  estadoDaSessaoAtiva,
  naOrganizacao,
  type ServidorDeTeste,
  sessaoAtiva,
} from '../../teste/sessao.ts';
import { REGISTRO } from '../registro.ts';
import { registroDaConta } from '../registroDaConta.ts';
import { ativos } from './modulo.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

type Modelo = components['schemas']['Modelo'];

const IMPRESSORA = { id: 'impressora', nome: 'Impressora', icone: 'impressora' } as const;

const modelo = (id: string, fabricante: string, nome: string): Modelo => ({
  id,
  tipo: IMPRESSORA,
  fabricante,
  nome,
  imagem: null,
  situacao: 'ativo',
  permite: { editar: true },
});

const M404 = modelo('m404', 'HP', 'LaserJet M404');
const C3010 = modelo('c3010', 'Ricoh', 'C3010');

/** Um ativo na lista, como a API o devolve. */
const ATIVO = {
  id: 'a1',
  rotulo: 'HP LaserJet M404',
  tipo: IMPRESSORA,
  modelo: { id: 'm404', fabricante: 'HP', nome: 'LaserJet M404', imagem: null },
  patrimonio: 'PAT-00412',
  local: { id: 'expedicao', caminho: 'Jundiaí › Expedição' },
  responsavel: null,
  uso: 'em-uso' as const,
  situacao: 'ativo' as const,
  permite: { editar: true },
};

const listaDeAtivos = (itens: (typeof ATIVO)[]) =>
  Response.json({
    itens,
    proximo: null,
    total: itens.length,
    referencias: { pessoas: {}, locais: {}, ativos: {}, modelos: {} },
    permite: { cadastrar: true },
  });

const lista = (itens: Modelo[]) =>
  Response.json({ itens, proximo: null, total: itens.length, permite: { cadastrar: true } });

function abrir(
  endereco: string,
  permissoes: PermissaoDaSessao[],
  servidor: ServidorDeTeste = {},
  canal = criarCanalDeEventos(),
  modulosDesligados: string[] = [],
) {
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  const sessao = sessaoAtiva(
    permissoes,
    {
      'GET /api/tipos-de-ativo': () => Response.json({ tipos: [], permite: { cadastrar: true } }),
      'GET /api/campos': () => Response.json({ campos: [], permite: { cadastrar: false } }),
      'GET /api/visoes': () => Response.json({ visoes: [], permite: { compartilhar: false } }),
      ...servidor,
    },
    {},
    {},
    { modulosDesligados },
  );
  render(
    <App
      roteador={roteador}
      sessao={sessao}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return { roteador, sessao };
}

const busca = () => screen.findByRole('dialog', { name: 'Busca' });

async function buscar(texto: string) {
  await screen.findByRole('heading', { level: 1, name: 'O que resolver agora' });
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Buscar' }));
  fireEvent.change(within(await busca()).getByRole('searchbox', { name: 'Buscar' }), {
    target: { value: texto },
  });
}

const acoes = async () =>
  within(within(await busca()).getByRole('group', { name: 'Ações' }))
    .getAllByRole('option')
    .map((opcao) => opcao.textContent ?? '');

const noDock = async () =>
  within(await screen.findByRole('navigation', { name: 'Dock' }))
    .getAllByRole('button')
    .map((item) => item.getAttribute('aria-label'));

describe('o módulo Ativos no registro', () => {
  const daConta = (...chaves: Permissao[]) =>
    registroDaConta([ativos], (chave) => chaves.includes(chave));

  it('Só os ativos: o menu tem "Todos os ativos", e o catálogo e as importações ficam na Gestão de ativos', () => {
    expect(daConta()).toEqual([]);
    // Os tipos e as visões fixadas vêm dos dados, no menu dinâmico (changes visoes-no-dock e
    // gestao-de-ativos).
    const todos = [{ rotulo: 'Todos os ativos', destino: '/ativos' }];
    expect(daConta('ativos.ver')[0]?.menu).toEqual(todos);
    expect(daConta('ativos.ver', 'ativos.editar', 'modelos.editar')[0]?.menu).toEqual(todos);
    expect(ativos.endereco).toBe('/ativos');
  });

  it('Conta sem as permissões do catálogo e Só os modelos: sem ativos.ver, o Ativos não aparece', () => {
    expect(daConta('modelos.editar')).toEqual([]);
    expect(daConta('catalogo.administrar', 'controlid.ver', 'software.distribuir')).toEqual([]);
  });

  it('no celular, fica logo depois do Início', async () => {
    const prioridades = REGISTRO.filter((modulo) => modulo.id !== 'inicio')
      .map((modulo) => modulo.prioridadeNoCelular)
      .filter((prioridade): prioridade is number => typeof prioridade === 'number');
    expect(ativos.prioridadeNoCelular).toBe(Math.min(...prioridades));

    noCelular();
    abrir('/', naOrganizacao('ativos.ver'), {
      'GET /api/ativos': () => listaDeAtivos([]),
    });
    const abas = await screen.findByRole('navigation', { name: 'Módulos' });
    expect(
      within(abas)
        .getAllByRole('button')
        .map((aba) => aba.getAttribute('aria-label')),
    ).toEqual(['Início', 'Ativos', 'Ajustes']);
  });

  it('catalogo.mudou atualiza as consultas do catálogo e os ligados', () => {
    const evento = {
      id: '0199a6e0-0000-7000-8000-000000000001',
      tipo: 'catalogo.mudou' as const,
      momento: '2026-10-09T12:00:00.000Z',
      alvo: { tipo: 'modelo', id: 'm404' },
    };
    expect(ativos.eventos?.['catalogo.mudou']?.(evento)).toEqual([
      // Os resumos dos cartões, com os ativos de cada modelo e de cada tipo.
      ['resumo'],
      ['tipos-de-ativo'],
      ['campos'],
      ['capacidades'],
      ['modelos'],
      ['modelo'],
      ['ativos'],
      ['ativo'],
      ['ligados'],
      // Os compatíveis da ficha do modelo, que a capacidade do tipo mostra ou esconde.
      ['consumiveis-do-modelo'],
    ]);
  });

  it('ativos.mudaram atualiza a lista, a ficha com o histórico e os ligados; locais e pessoas, os nomes', () => {
    const evento = (tipo: 'ativos.mudaram' | 'locais.mudaram' | 'pessoas.mudaram') => ({
      id: '0199a6e0-0000-7000-8000-000000000003',
      tipo,
      momento: '2026-10-09T12:00:00.000Z',
      alvo: { tipo: 'ativo', id: 'a1' },
    });
    expect(ativos.eventos?.['ativos.mudaram']?.(evento('ativos.mudaram'))).toEqual([
      ['ativos'],
      ['resumo'],
      ['ativo', 'a1'],
      ['ligados'],
    ]);
    // O caminho do local aparece nos ligados; a pessoa, só no histórico, que a ficha já cobre.
    expect(ativos.eventos?.['locais.mudaram']?.(evento('locais.mudaram'))).toEqual([
      ['ativos'],
      ['ativo'],
      ['ligados'],
    ]);
    expect(ativos.eventos?.['pessoas.mudaram']?.(evento('pessoas.mudaram'))).toEqual([
      ['ativos'],
      ['ativo'],
    ]);
  });

  it('visoes.mudaram atualiza as visões da tabela dos ativos', () => {
    const evento = {
      id: '0199a6e0-0000-7000-8000-000000000004',
      tipo: 'visoes.mudaram' as const,
      momento: '2026-10-10T12:00:00.000Z',
      alvo: { tipo: 'visao', id: '0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d' },
    };
    expect(ativos.eventos?.['visoes.mudaram']?.(evento)).toEqual([['visoes', 'ativos']]);
  });
});

describe('a importação na busca', () => {
  it('oferece "Importar planilha" a quem edita ativos, e escolher abre a importação nova', async () => {
    noComputador();
    const { roteador } = abrir('/', naOrganizacao('ativos.ver', 'ativos.editar'), {
      'GET /api/ativos': () => Response.json({ itens: [], proximo: null, total: 0 }),
      'GET /api/visoes': () => Response.json({ visoes: [] }),
      'GET /api/tipos-de-ativo': () => Response.json({ tipos: [], permite: { cadastrar: false } }),
    });
    await buscar('importar');
    const grupo = await within(await busca()).findByRole('group', { name: 'Ações' });
    fireEvent.click(within(grupo).getByRole('option', { name: /Importar planilha/ }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/gestao/importacoes/nova'));
  });

  it('não oferece "Importar planilha" a quem só vê ativos', async () => {
    noComputador();
    abrir('/', naOrganizacao('ativos.ver'), {
      'GET /api/ativos': () => Response.json({ itens: [], proximo: null, total: 0 }),
      'GET /api/visoes': () => Response.json({ visoes: [] }),
    });
    await buscar('importar');
    await waitFor(async () =>
      expect(within(await busca()).queryByRole('option', { name: /Importar planilha/ })).toBeNull(),
    );
  });
});

describe('o catálogo na busca', () => {
  it('as ações de cadastro aparecem conforme a permissão de cada uma', async () => {
    noComputador();
    abrir('/', naOrganizacao('catalogo.administrar'), { 'GET /api/modelos': () => lista([]) });
    await buscar('novo');
    await waitFor(async () =>
      expect(await acoes()).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Novo tipo de ativo'),
          expect.stringContaining('Novo campo'),
        ]),
      ),
    );
    expect((await acoes()).join()).not.toContain('Novo modelo');
    cleanup();

    const { roteador } = abrir('/', naOrganizacao('modelos.editar'), {
      'GET /api/modelos': () => lista([]),
    });
    await buscar('novo');
    const grupo = await within(await busca()).findByRole('group', { name: 'Ações' });
    expect(within(grupo).queryByRole('option', { name: /Novo tipo de ativo/ })).toBeNull();
    fireEvent.click(within(grupo).getByRole('option', { name: /Novo modelo/ }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/modelos/novo'),
    );
  });

  it('acha o modelo pelo nome, com o tipo, e escolher abre a ficha', async () => {
    noComputador();
    const pedidos: URLSearchParams[] = [];
    const { roteador } = abrir('/', naOrganizacao('catalogo.administrar'), {
      'GET /api/modelos': (pedido) => {
        pedidos.push(new URL(pedido.url).searchParams);
        return lista([M404]);
      },
      'GET /api/modelos/m404': () => Response.json(M404),
      'GET /api/modelos/fabricantes': () => Response.json({ fabricantes: ['HP'] }),
    });
    await buscar('M404');
    const grupo = await within(await busca()).findByRole('group', { name: 'Modelos' });
    const opcao = await within(grupo).findByRole('option', { name: /HP LaserJet M404/ });
    expect(opcao.textContent).toContain('Impressora');
    expect(pedidos.at(-1)?.get('busca')).toBe('M404');
    expect(pedidos.at(-1)?.get('situacao')).toBe('todos');
    expect(pedidos.at(-1)?.get('limite')).toBe('8');
    fireEvent.click(opcao);
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/modelos/m404'),
    );
  });

  it('oferece "Novo ativo" a quem edita ativos, e acha o ativo pelo patrimônio, com o tipo e o local', async () => {
    noComputador();
    const pedidos: URLSearchParams[] = [];
    const { roteador } = abrir('/', naOrganizacao('ativos.editar', 'ativos.ver'), {
      'GET /api/ativos': (pedido) => {
        pedidos.push(new URL(pedido.url).searchParams);
        return listaDeAtivos([ATIVO]);
      },
    });
    await buscar('00412');
    const grupo = await within(await busca()).findByRole('group', { name: 'Ativos' });
    const opcao = await within(grupo).findByRole('option', { name: /HP LaserJet M404/ });
    expect(opcao.textContent).toContain('PAT-00412 · Impressora · Jundiaí › Expedição');
    expect(pedidos.at(-1)?.get('busca')).toBe('00412');
    expect(pedidos.at(-1)?.get('situacao')).toBe('todos');
    expect(pedidos.at(-1)?.get('limite')).toBe('8');
    fireEvent.click(opcao);
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/ativos/a1'));
    cleanup();

    abrir('/', naOrganizacao('ativos.editar', 'ativos.ver'), {
      'GET /api/ativos': () => listaDeAtivos([]),
    });
    await buscar('novo');
    await waitFor(async () => expect((await acoes()).join()).toContain('Novo ativo'));
  });

  it('as visões da tabela, com "Ativos › Visões", abrem a tabela na visão', async () => {
    noComputador();
    const { roteador } = abrir('/', naOrganizacao('ativos.ver'), {
      'GET /api/ativos': () => listaDeAtivos([]),
      'GET /api/visoes': () =>
        Response.json({
          visoes: [
            {
              id: '0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d',
              nome: 'Impressoras de Jundiaí',
              compartilhada: true,
              definicao: { colunas: [{ chave: 'ativo.rotulo' }], ordenacao: null, filtros: [] },
              permite: { editar: false },
            },
          ],
          permite: { compartilhar: false },
        }),
    });
    await buscar('impressoras jundiai');
    const grupo = await within(await busca()).findByRole('group', { name: 'Visões' });
    const opcao = await within(grupo).findByRole('option', { name: /Impressoras de Jundiaí/ });
    expect(opcao.textContent).toContain('Ativos › Visões');
    fireEvent.click(opcao);
    await waitFor(() =>
      expect(roteador.state.location.search).toMatchObject({
        visao: '0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d',
      }),
    );
    expect(roteador.state.location.pathname).toBe('/ativos');
  });

  it('com os ativos e os modelos, cada provedor responde no seu grupo', async () => {
    noComputador();
    abrir('/', naOrganizacao('ativos.ver', 'catalogo.administrar'), {
      'GET /api/ativos': () => listaDeAtivos([ATIVO]),
      'GET /api/modelos': () => lista([M404]),
    });
    await buscar('M404');
    const dialogo = await busca();
    const ativos = await within(dialogo).findByRole('group', { name: 'Ativos' });
    const modelos = await within(dialogo).findByRole('group', { name: 'Modelos' });
    expect(await within(ativos).findByRole('option', { name: /HP LaserJet M404/ })).toBeTruthy();
    expect(await within(modelos).findByRole('option', { name: /HP LaserJet M404/ })).toBeTruthy();
  });

  it('sem as permissões do módulo, a busca não pergunta pelos modelos', async () => {
    noComputador();
    const modelos = vi.fn(() => lista([M404]));
    abrir('/', naOrganizacao('auditoria.ver'), { 'GET /api/modelos': modelos });
    await buscar('M404');
    await new Promise((resolver) => setTimeout(resolver, 300));
    expect(within(await busca()).queryByRole('group', { name: 'Modelos' })).toBeNull();
    expect(modelos).not.toHaveBeenCalled();
  });
});

describe('os ativos pelos eventos', () => {
  it('um ativo cadastrado em outra sessão aparece na lista aberta', async () => {
    noComputador();
    const canal = criarCanalDeEventos();
    let itens = [ATIVO];
    abrir(
      '/ativos',
      naOrganizacao('ativos.ver'),
      { 'GET /api/ativos': () => listaDeAtivos(itens) },
      canal,
    );
    const tabela = await screen.findByRole('grid', { name: 'Ativos' });
    await within(tabela).findByText('PAT-00412');
    itens = [{ ...ATIVO, id: 'a2', rotulo: 'Impressora do RH', patrimonio: 'PAT-00999' }, ATIVO];
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000004',
      tipo: 'ativos.mudaram',
      momento: '2026-10-09T12:00:00.000Z',
      alvo: { tipo: 'ativo', id: 'a2' },
    });
    expect(await within(tabela).findByText('PAT-00999')).toBeTruthy();
  });
});

describe('o catálogo pelos eventos', () => {
  it('um modelo cadastrado em outra sessão aparece na tela de modelos aberta', async () => {
    noComputador();
    const canal = criarCanalDeEventos();
    let itens = [M404];
    abrir(
      '/gestao/catalogo/modelos',
      naOrganizacao('modelos.editar'),
      { 'GET /api/modelos': () => lista(itens) },
      canal,
    );
    const tabela = await screen.findByRole('grid', { name: 'Modelos' });
    await within(tabela).findByText('LaserJet M404');
    itens = [M404, C3010];
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000002',
      tipo: 'catalogo.mudou',
      momento: '2026-10-09T12:00:00.000Z',
      alvo: { tipo: 'modelo', id: C3010.id },
    });
    expect(await within(tabela).findByText('C3010')).toBeTruthy();
  });
});

describe('o Ativos desligado na organização', () => {
  const TODAS = naOrganizacao('ativos.ver', 'ativos.editar', 'catalogo.administrar');

  it('some do dock e da busca, mesmo para quem tem as permissões dele', async () => {
    noComputador();
    const ativosNaApi = vi.fn(() => listaDeAtivos([ATIVO]));
    const modelos = vi.fn(() => lista([M404]));
    abrir(
      '/',
      TODAS,
      { 'GET /api/ativos': ativosNaApi, 'GET /api/modelos': modelos },
      criarCanalDeEventos(),
      ['ativos'],
    );
    expect(await noDock()).toEqual(['Início', 'Ajustes']);
    await buscar('novo');
    await new Promise((resolver) => setTimeout(resolver, 300));
    expect(within(await busca()).queryByRole('option', { name: /Novo ativo/ })).toBeNull();
    expect(within(await busca()).queryByRole('option', { name: /Novo tipo de ativo/ })).toBeNull();
    expect(ativosNaApi).not.toHaveBeenCalled();
    expect(modelos).not.toHaveBeenCalled();
  });

  it('o endereço de uma tela dele diz que o módulo está desligado e a quem pedir', async () => {
    noComputador();
    const ativosNaApi = vi.fn(() => listaDeAtivos([ATIVO]));
    abrir(
      '/ativos',
      naOrganizacao('ativos.ver'),
      { 'GET /api/ativos': ativosNaApi },
      criarCanalDeEventos(),
      ['ativos'],
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Ativos' })).toBeTruthy();
    expect(screen.getByText('O módulo Ativos está desligado nesta organização.')).toBeTruthy();
    expect(
      screen.getByText('Peça a quem define os padrões da organização para ligá-lo.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir Módulos' })).toBeNull();
    expect(ativosNaApi).not.toHaveBeenCalled();
  });

  it('quem define os padrões da organização vai dali à seção Módulos', async () => {
    noComputador();
    const { roteador } = abrir(
      '/gestao/catalogo/tipos',
      naOrganizacao('catalogo.administrar', 'organizacao.editar'),
      {
        'GET /api/organizacao/modulos': () =>
          Response.json({
            modulos: [
              {
                id: 'ativos',
                nome: 'Ativos',
                descricao: 'O catálogo, o cadastro e a lista dos ativos.',
                ligado: false,
              },
            ],
          }),
      },
      criarCanalDeEventos(),
      ['ativos'],
    );
    expect(
      await screen.findByText('O módulo Ativos está desligado nesta organização.'),
    ).toBeTruthy();
    expect(screen.getByText('Você pode ligá-lo na seção Módulos da Administração.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Módulos' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/administracao/modulos'));
  });

  it('desligado com a lista aberta, a próxima leitura recusada leva a tela a dizer que ele está desligado, sem recarregar', async () => {
    noComputador();
    const canal = criarCanalDeEventos();
    let desligado = false;
    abrir(
      '/ativos',
      naOrganizacao('ativos.ver'),
      {
        'GET /api/ativos': () =>
          desligado
            ? Response.json(
                {
                  type: 'urn:grafite:problema:modulo-desligado',
                  title: 'Módulo desligado',
                  status: 403,
                  detail: 'O módulo Ativos está desligado nesta organização.',
                  codigoDeRastreio: 'R7K2-9QXM',
                },
                { status: 403 },
              )
            : listaDeAtivos([ATIVO]),
        'GET /api/sessao': () =>
          estadoDaSessaoAtiva(naOrganizacao('ativos.ver'), {
            modulosDesligados: desligado ? ['ativos'] : [],
          }),
      },
      canal,
    );
    const tabela = await screen.findByRole('grid', { name: 'Ativos' });
    await within(tabela).findByText('PAT-00412');
    expect(await noDock()).toContain('Ativos');

    desligado = true;
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000006',
      tipo: 'ativos.mudaram',
      momento: '2026-10-09T12:00:00.000Z',
      alvo: { tipo: 'ativo', id: 'a1' },
    });
    await waitFor(async () => expect(await noDock()).toEqual(['Início', 'Ajustes']));
    expect(screen.getByText('O módulo Ativos está desligado nesta organização.')).toBeTruthy();
    expect(screen.queryByRole('grid', { name: 'Ativos' })).toBeNull();
  });

  it('ligado de novo, volta ao dock de quem tem as permissões', async () => {
    noComputador();
    let desligados = ['ativos'];
    const { sessao } = abrir(
      '/',
      naOrganizacao('ativos.ver'),
      {
        'GET /api/sessao': () =>
          estadoDaSessaoAtiva(naOrganizacao('ativos.ver'), { modulosDesligados: desligados }),
      },
      criarCanalDeEventos(),
      desligados,
    );
    expect(await noDock()).toEqual(['Início', 'Ajustes']);
    desligados = [];
    await act(() => sessao.validar());
    await waitFor(async () => expect(await noDock()).toEqual(['Início', 'Ativos', 'Ajustes']));
  });
});
