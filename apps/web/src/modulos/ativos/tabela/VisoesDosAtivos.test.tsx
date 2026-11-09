import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { naOrganizacao, type ServidorDeTeste } from '../../../teste/sessao.ts';
import { abrir, servidorDeAtivos, tabela } from './teste.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
});

type Visao = components['schemas']['VisaoDaTabela'];
type Mudancas = components['schemas']['MudancasDaVisao'];

const SO_ATIVOS = {
  chave: 'ativo.situacao',
  operador: 'situacao' as const,
  situacao: 'ativos' as const,
};

const DEFINICAO = {
  colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.patrimonio' }],
  ordenacao: { chave: 'ativo.criado-em', direcao: 'decrescente' as const },
  filtros: [SO_ATIVOS],
};

const SWITCHES: Visao = {
  id: '0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d',
  nome: 'Switches',
  compartilhada: false,
  definicao: DEFINICAO,
  permite: { editar: true },
};

const IMPRESSORAS: Visao = {
  id: '1c8d2e3f-4051-4b6c-9d7e-8f9a0b1c2d3e',
  nome: 'Impressoras de Jundiaí',
  compartilhada: true,
  definicao: DEFINICAO,
  permite: { editar: true },
};

const NOVA: Visao = {
  id: '2d9e3f4a-5162-4c7d-8e8f-9a0b1c2d3e4f',
  nome: 'Notebooks',
  compartilhada: false,
  definicao: DEFINICAO,
  permite: { editar: true },
};

/** A tabela ordenada pelo patrimônio, como a conta a mudou. */
const PELO_PATRIMONIO = {
  ...DEFINICAO,
  ordenacao: { chave: 'ativo.patrimonio', direcao: 'crescente' as const },
};

/** As mudanças da conta sobre uma visão, como a API as devolve. */
const mudancasSobre = (
  visao: string,
  definicao: Mudancas['definicao'] = PELO_PATRIMONIO,
): Mudancas => ({
  visao,
  definicao,
  atualizadaEm: '2026-10-13T12:00:00.000Z',
});

/** O servidor com as visões, e os pedidos de cada uma, pelo método e o caminho. */
function servidorDasVisoes(compartilhar = false, mudancasIniciais: Mudancas[] = []) {
  const pedidos: { caminho: string; corpo: unknown }[] = [];
  let visoes = [IMPRESSORAS, SWITCHES];
  let mudancas = mudancasIniciais;
  const guardar = (caminho: string) => async (pedido: Request) => {
    pedidos.push({ caminho, corpo: pedido.method === 'DELETE' ? null : await pedido.json() });
    return null;
  };
  const servidor: ServidorDeTeste = {
    ...servidorDeAtivos().servidor,
    'GET /api/visoes': () => Response.json({ visoes, mudancas, permite: { compartilhar } }),
    'PUT /api/visoes/mudancas': async (pedido) => {
      const corpo = (await pedido.json()) as { visao: string; definicao: typeof DEFINICAO };
      pedidos.push({ caminho: 'PUT /visoes/mudancas', corpo });
      const guardadas = mudancasSobre(corpo.visao, corpo.definicao);
      mudancas = [...mudancas.filter((outras) => outras.visao !== corpo.visao), guardadas];
      return Response.json(guardadas);
    },
    'DELETE /api/visoes/mudancas': (pedido) => {
      const visao = new URL(pedido.url).searchParams.get('visao');
      pedidos.push({ caminho: 'DELETE /visoes/mudancas', corpo: { visao } });
      mudancas = mudancas.filter((outras) => outras.visao !== visao);
      return new Response(null, { status: 204 });
    },
    [`POST /api/visoes/${IMPRESSORAS.id}/publicar`]: () => {
      pedidos.push({ caminho: `POST /visoes/${IMPRESSORAS.id}/publicar`, corpo: null });
      const minhas = mudancas.find((outras) => outras.visao === IMPRESSORAS.id);
      mudancas = mudancas.filter((outras) => outras.visao !== IMPRESSORAS.id);
      const publicada = { ...IMPRESSORAS, definicao: minhas?.definicao ?? IMPRESSORAS.definicao };
      visoes = visoes.map((visao) => (visao.id === IMPRESSORAS.id ? publicada : visao));
      return Response.json(publicada);
    },
    'POST /api/visoes': async (pedido) => {
      await guardar('POST /visoes')(pedido);
      const { nome } = (pedidos.at(-1)?.corpo ?? {}) as { nome: string };
      if (nome.toLowerCase() === 'switches') {
        return Response.json(
          {
            type: 'urn:grafite:problema:conflito',
            title: 'Conflito',
            status: 409,
            detail: 'Já existe uma visão com este nome.',
            codigoDeRastreio: 'R7K2-9QXM',
            campos: { nome: 'Já existe uma visão com este nome.' },
          },
          { status: 409 },
        );
      }
      visoes = [...visoes, NOVA];
      return Response.json(NOVA, { status: 201 });
    },
    [`PATCH /api/visoes/${SWITCHES.id}`]: async (pedido) => {
      await guardar(`PATCH /visoes/${SWITCHES.id}`)(pedido);
      return Response.json(SWITCHES);
    },
    [`DELETE /api/visoes/${SWITCHES.id}`]: async (pedido) => {
      await guardar(`DELETE /visoes/${SWITCHES.id}`)(pedido);
      visoes = visoes.filter((visao) => visao.id !== SWITCHES.id);
      return new Response(null, { status: 204 });
    },
    'PATCH /api/organizacao/padroes': async (pedido) => {
      await guardar('PATCH /organizacao/padroes')(pedido);
      return Response.json({});
    },
    'PATCH /api/conta/preferencias': async (pedido) => {
      await guardar('PATCH /conta/preferencias')(pedido);
      return Response.json({});
    },
  };
  return { servidor, pedidos };
}

const corpos = (pedidos: { caminho: string; corpo: unknown }[], caminho: string) =>
  pedidos.filter((pedido) => pedido.caminho === caminho).map((pedido) => pedido.corpo);

/** O servidor das visões em que a lista, depois da primeira leitura, não volta mais. */
function semReleitura(servidor: ServidorDeTeste): ServidorDeTeste {
  let leituras = 0;
  const listar = servidor['GET /api/visoes'];
  return {
    ...servidor,
    'GET /api/visoes': (pedido) => {
      leituras += 1;
      return leituras === 1 && listar ? listar(pedido) : new Promise<Response>(() => undefined);
    },
  };
}

const escolha = () => screen.getByRole('button', { name: /^Visão/ });

async function noMenu(acao: string) {
  fireEvent.click(escolha());
  const menu = await screen.findByRole('menu', { name: /^Visão/ });
  fireEvent.click(within(menu).getByRole('menuitem', { name: acao }));
}

const retornos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

/** A linha de estado sob a barra da tabela. */
const linhaDaVisao = () => screen.findByRole('group', { name: 'Estado da visão' });

describe('as visões na tela dos ativos', () => {
  it('a tabela de um link mostra "Do link" na escolha e na linha sob a barra', async () => {
    abrir(`/ativos?visao=${SWITCHES.id}&ordem=ativo.patrimonio`, servidorDasVisoes().servidor);
    await tabela();
    await waitFor(() => expect(escolha().textContent).toContain('Switches'));
    expect(within(escolha()).getByText('Do link')).toBeTruthy();
    expect((await linhaDaVisao()).textContent).toContain('Esta tabela veio de um link.');
  });

  it('com as mudanças da conta, a visão aparece "Personalizada", e a linha diz o que mudou', async () => {
    const { servidor } = servidorDasVisoes(false, [mudancasSobre(IMPRESSORAS.id)]);
    const roteador = abrir(`/ativos?visao=${IMPRESSORAS.id}`, servidor);
    await tabela();
    await waitFor(() => expect(within(escolha()).getByText('Personalizada')).toBeTruthy());
    expect(escolha().textContent).toContain('Impressoras de Jundiaí');
    expect((await linhaDaVisao()).textContent).toContain(
      'Você mudou a ordem. As mudanças ficam guardadas para você.',
    );
    expect(
      (await screen.findByRole('columnheader', { name: /Patrimônio/ })).getAttribute('aria-sort'),
    ).toBe('ascending');
    expect(roteador.state.location.search).toEqual({ visao: IMPRESSORAS.id });
  });

  it('"Restaurar a visão" apaga as mudanças da conta e mostra a visão salva', async () => {
    const { servidor, pedidos } = servidorDasVisoes(false, [mudancasSobre(IMPRESSORAS.id)]);
    abrir(`/ativos?visao=${IMPRESSORAS.id}`, servidor);
    await tabela();
    fireEvent.click(
      within(await linhaDaVisao()).getByRole('button', { name: 'Restaurar a visão' }),
    );
    await waitFor(() => expect(within(escolha()).queryByText('Personalizada')).toBeNull());
    expect(screen.queryByRole('group', { name: 'Estado da visão' })).toBeNull();
    expect(retornos()).toContain('Visão restaurada.');
    await waitFor(() =>
      expect(corpos(pedidos, 'DELETE /visoes/mudancas')).toEqual([{ visao: IMPRESSORAS.id }]),
    );
  });

  it('sem organizacao.editar, mudar a visão da organização a personaliza só para a conta', async () => {
    const { servidor, pedidos } = servidorDasVisoes();
    abrir(`/ativos?visao=${IMPRESSORAS.id}`, servidor);
    await tabela();
    fireEvent.click(await screen.findByRole('columnheader', { name: /Patrimônio/ }));
    await waitFor(() =>
      expect(corpos(pedidos, 'PUT /visoes/mudancas')).toEqual([
        { tabela: 'ativos', visao: IMPRESSORAS.id, definicao: PELO_PATRIMONIO },
      ]),
    );
    expect(within(escolha()).getByText('Personalizada')).toBeTruthy();
    fireEvent.click(escolha());
    const menu = await screen.findByRole('menu', { name: /^Visão/ });
    expect(
      within(menu).queryByRole('menuitem', { name: 'Salvar na visão da organização' }),
    ).toBeNull();
  });

  it('"Salvar na visão da organização" grava as mudanças da conta na visão, para todos', async () => {
    const { servidor, pedidos } = servidorDasVisoes(true, [mudancasSobre(IMPRESSORAS.id)]);
    abrir(
      `/ativos?visao=${IMPRESSORAS.id}`,
      servidor,
      naOrganizacao('ativos.ver', 'organizacao.editar'),
    );
    await tabela();
    await waitFor(() => expect(within(escolha()).getByText('Personalizada')).toBeTruthy());
    await noMenu('Salvar na visão da organização');
    await waitFor(() =>
      expect(corpos(pedidos, `POST /visoes/${IMPRESSORAS.id}/publicar`)).toEqual([null]),
    );
    await waitFor(() => expect(within(escolha()).queryByText('Personalizada')).toBeNull());
    expect(retornos()).toContain('Visão salva.');
    // Quem publicou não recebe o aviso da visão atualizada pela organização.
    expect(retornos().filter((titulo) => titulo.includes('atualizada pela organização'))).toEqual(
      [],
    );
    expect(
      (await screen.findByRole('columnheader', { name: /Patrimônio/ })).getAttribute('aria-sort'),
    ).toBe('ascending');
  });

  it('as mudanças guardadas em outra sessão da conta chegam pelo evento', async () => {
    const { servidor } = servidorDasVisoes();
    let mudancas: Mudancas[] = [];
    const canal = criarCanalDeEventos();
    abrir(
      `/ativos?visao=${IMPRESSORAS.id}`,
      {
        ...servidor,
        'GET /api/visoes': () =>
          Response.json({
            visoes: [IMPRESSORAS, SWITCHES],
            mudancas,
            permite: { compartilhar: false },
          }),
      },
      undefined,
      canal,
    );
    await tabela();
    expect(escolha().textContent).not.toContain('Personalizada');
    // O notebook guardou a ordem pelo patrimônio: o evento chega às sessões da conta.
    mudancas = [mudancasSobre(IMPRESSORAS.id)];
    canal.publicar({
      id: 'visoes-1',
      tipo: 'visoes.mudaram',
      momento: '2026-10-13T12:00:00.000Z',
      alvo: null,
    });
    await waitFor(() => expect(within(escolha()).getByText('Personalizada')).toBeTruthy());
    expect(
      (await screen.findByRole('columnheader', { name: /Patrimônio/ })).getAttribute('aria-sort'),
    ).toBe('ascending');
  });

  it('na visão da conta, a mudança vai à própria visão, sem a marca', async () => {
    const { servidor, pedidos } = servidorDasVisoes();
    const roteador = abrir(`/ativos?visao=${SWITCHES.id}`, servidor);
    await tabela();
    fireEvent.click(await screen.findByRole('columnheader', { name: /Patrimônio/ }));
    await waitFor(() =>
      expect(corpos(pedidos, `PATCH /visoes/${SWITCHES.id}`)).toEqual([
        { definicao: PELO_PATRIMONIO },
      ]),
    );
    expect(escolha().textContent).not.toMatch(/Personalizada|Do link/);
    expect(roteador.state.location.search).toEqual({ visao: SWITCHES.id });
  });

  it('escolher outra visão no menu a abre e a grava como a da conta', async () => {
    const { servidor, pedidos } = servidorDasVisoes();
    const roteador = abrir('/ativos', servidor);
    await tabela();
    fireEvent.click(escolha());
    const menu = await screen.findByRole('menu', { name: /^Visão/ });
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Switches/ }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({ visao: SWITCHES.id }));
    await waitFor(() =>
      expect(corpos(pedidos, 'PATCH /conta/preferencias')).toEqual([
        { mudancas: { tabelas: { visoes: { ativos: SWITCHES.id } } } },
      ]),
    );
  });

  it('"Salvar como nova visão…" recusa o nome no campo e, aceito, abre a visão criada', async () => {
    const { servidor, pedidos } = servidorDasVisoes();
    const roteador = abrir('/ativos?visao=fabrica&ordem=ativo.patrimonio', servidor);
    await tabela();
    await noMenu('Salvar como nova visão…');
    const dialogo = await screen.findByRole('dialog', { name: 'Salvar como nova visão' });
    expect(
      within(dialogo).queryByRole('checkbox', { name: 'Compartilhar com a organização' }),
    ).toBeNull();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar visão' }));
    expect(await within(dialogo).findByText('Dê um nome à visão.')).toBeTruthy();

    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'switches' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar visão' }));
    expect(await within(dialogo).findByText('Já existe uma visão com este nome.')).toBeTruthy();

    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Notebooks' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar visão' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({ visao: NOVA.id }));
    expect(corpos(pedidos, 'POST /visoes').at(-1)).toMatchObject({
      tabela: 'ativos',
      nome: 'Notebooks',
      compartilhada: false,
    });
    expect(retornos()).toContain('Visão criada.');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"Salvar como nova visão…" na visão personalizada apaga as mudanças da conta sobre ela', async () => {
    const { servidor, pedidos } = servidorDasVisoes(false, [mudancasSobre('fabrica')]);
    const roteador = abrir('/ativos?visao=fabrica', servidor);
    await tabela();
    fireEvent.click(
      within(await linhaDaVisao()).getByRole('button', { name: 'Salvar como nova visão…' }),
    );
    const dialogo = await screen.findByRole('dialog', { name: 'Salvar como nova visão' });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Notebooks' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar visão' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({ visao: NOVA.id }));
    expect(corpos(pedidos, 'POST /visoes').at(-1)).toMatchObject({ definicao: PELO_PATRIMONIO });
    await waitFor(() =>
      expect(corpos(pedidos, 'DELETE /visoes/mudancas')).toEqual([{ visao: 'fabrica' }]),
    );
  });

  it('"Duplicar…" cria a visão da conta com a tabela e a abre, e as mudanças da origem continuam', async () => {
    const { servidor, pedidos } = servidorDasVisoes(false, [mudancasSobre('fabrica')]);
    const roteador = abrir('/ativos?visao=fabrica', servidor);
    await tabela();
    await waitFor(() => expect(within(escolha()).getByText('Personalizada')).toBeTruthy());
    await noMenu('Duplicar…');
    const dialogo = await screen.findByRole('dialog', { name: 'Duplicar visão' });
    const nome = within(dialogo).getByRole('textbox', { name: 'Nome' });
    expect(nome).toHaveProperty('value', 'Todos os ativos (cópia)');
    fireEvent.change(nome, { target: { value: 'Notebooks' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Duplicar' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({ visao: NOVA.id }));
    expect(corpos(pedidos, 'POST /visoes')).toEqual([
      { tabela: 'ativos', nome: 'Notebooks', compartilhada: false, definicao: PELO_PATRIMONIO },
    ]);
    expect(retornos()).toContain('Visão duplicada.');
    expect(corpos(pedidos, 'DELETE /visoes/mudancas')).toEqual([]);
  });

  it('com organizacao.editar, a visão nova pode ser compartilhada com a organização', async () => {
    const { servidor, pedidos } = servidorDasVisoes(true);
    abrir('/ativos?visao=fabrica', servidor, naOrganizacao('ativos.ver', 'organizacao.editar'));
    await tabela();
    await noMenu('Salvar como nova visão…');
    const dialogo = await screen.findByRole('dialog', { name: 'Salvar como nova visão' });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Notebooks' },
    });
    fireEvent.click(
      within(dialogo).getByRole('checkbox', { name: 'Compartilhar com a organização' }),
    );
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar visão' }));
    await waitFor(() =>
      expect(corpos(pedidos, 'POST /visoes').at(-1)).toMatchObject({ compartilhada: true }),
    );
  });

  it('"Voltar à minha tabela" tira o que veio do link', async () => {
    const roteador = abrir(
      `/ativos?visao=${SWITCHES.id}&ordem=ativo.patrimonio`,
      servidorDasVisoes().servidor,
    );
    await tabela();
    fireEvent.click(
      within(await linhaDaVisao()).getByRole('button', { name: 'Voltar à minha tabela' }),
    );
    await waitFor(() => expect(roteador.state.location.search).toEqual({ visao: SWITCHES.id }));
    expect(screen.queryByRole('group', { name: 'Estado da visão' })).toBeNull();
  });

  it('"Renomear…" traz o nome e grava o novo', async () => {
    const { servidor, pedidos } = servidorDasVisoes();
    abrir(`/ativos?visao=${SWITCHES.id}`, servidor);
    await tabela();
    await noMenu('Renomear…');
    const dialogo = await screen.findByRole('dialog', { name: 'Renomear visão' });
    const nome = within(dialogo).getByRole('textbox', { name: 'Nome' });
    expect(nome).toHaveProperty('value', 'Switches');
    fireEvent.change(nome, { target: { value: 'Switches do CPD' } });
    // Enter no nome confirma, como o botão.
    fireEvent.keyDown(nome, { key: 'Enter' });
    await waitFor(() =>
      expect(corpos(pedidos, `PATCH /visoes/${SWITCHES.id}`)).toEqual([
        { nome: 'Switches do CPD' },
      ]),
    );
    expect(retornos()).toContain('Visão renomeada.');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"Remover…" confirma, remove e passa à visão que abre', async () => {
    const { servidor, pedidos } = servidorDasVisoes();
    const roteador = abrir(`/ativos?visao=${SWITCHES.id}`, servidor);
    await tabela();
    await noMenu('Remover…');
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Remover a visão Switches?',
    });
    expect(within(confirmacao).getByText('A visão sai do seu menu.')).toBeTruthy();
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Remover visão' }));
    await waitFor(() => expect(corpos(pedidos, `DELETE /visoes/${SWITCHES.id}`)).toEqual([null]));
    await waitFor(() => expect(roteador.state.location.search).toEqual({ visao: 'fabrica' }));
    expect(retornos()).toContain('Visão removida.');
    expect(retornos()).not.toContain('A visão Switches foi removida.');
  });

  it('a visão criada abre na hora, sem esperar a lista das visões ser relida', async () => {
    const { servidor } = servidorDasVisoes();
    const roteador = abrir('/ativos?visao=fabrica&ordem=ativo.patrimonio', semReleitura(servidor));
    await tabela();
    await noMenu('Salvar como nova visão…');
    const dialogo = await screen.findByRole('dialog', { name: 'Salvar como nova visão' });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Notebooks' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar visão' }));
    await waitFor(() => expect(escolha().textContent).toContain('Notebooks'));
    expect(roteador.state.location.search).toEqual({ visao: NOVA.id });
    expect(retornos()).not.toContain('A visão do endereço não está disponível.');
  });

  it('a visão salva, renomeada ou removida muda na tela sem esperar a lista ser relida', async () => {
    const { servidor, pedidos } = servidorDasVisoes();
    abrir(`/ativos?visao=${SWITCHES.id}`, {
      ...semReleitura(servidor),
      [`PATCH /api/visoes/${SWITCHES.id}`]: async (pedido) => {
        const corpo = (await pedido.json()) as Partial<Visao>;
        pedidos.push({ caminho: `PATCH /visoes/${SWITCHES.id}`, corpo });
        return Response.json({ ...SWITCHES, ...corpo });
      },
    });
    await tabela();
    fireEvent.click(await screen.findByRole('columnheader', { name: /Patrimônio/ }));
    // A visão da conta guarda a mudança nela, sem marca, e a tabela fica com a ordem nova.
    await waitFor(() =>
      expect(corpos(pedidos, `PATCH /visoes/${SWITCHES.id}`)).toEqual([
        { definicao: PELO_PATRIMONIO },
      ]),
    );
    expect(escolha().textContent).toContain('Switches');
    expect(screen.queryByRole('group', { name: 'Estado da visão' })).toBeNull();
    expect(
      (await screen.findByRole('columnheader', { name: /Patrimônio/ })).getAttribute('aria-sort'),
    ).toBe('ascending');

    await noMenu('Renomear…');
    const dialogo = await screen.findByRole('dialog', { name: 'Renomear visão' });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Switches do CPD' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Renomear' }));
    await waitFor(() => expect(escolha().textContent).toContain('Switches do CPD'));

    await noMenu('Remover…');
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Remover a visão Switches do CPD?',
    });
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Remover visão' }));
    await waitFor(() => expect(escolha().textContent).toContain('Todos os ativos'));
    fireEvent.click(escolha());
    const menu = await screen.findByRole('menu', { name: /^Visão/ });
    expect(within(menu).queryByRole('menuitemradio', { name: /Switches/ })).toBeNull();
  });

  it('"Usar como padrão da organização" grava nos padrões', async () => {
    const { servidor, pedidos } = servidorDasVisoes(true);
    abrir(
      `/ativos?visao=${IMPRESSORAS.id}`,
      { ...servidor, 'GET /api/sessao': () => Response.json({}) },
      naOrganizacao('ativos.ver', 'organizacao.editar'),
    );
    await tabela();
    await noMenu('Usar como padrão da organização');
    await waitFor(() =>
      expect(corpos(pedidos, 'PATCH /organizacao/padroes')).toEqual([
        { mudancas: { tabelas: { visoes: { ativos: IMPRESSORAS.id } } } },
      ]),
    );
  });
});

// As visões fixadas no menu (spec visoes-de-tabela, "Visões fixadas no menu"; change
// visoes-no-dock, design, decisões 1 e 3).
describe('as visões fixadas no menu', () => {
  const nomeDaVisao = (menu: HTMLElement, nome: RegExp) =>
    within(menu).getByRole('menuitemradio', { name: nome });

  it('"Fixar no menu" grava a lista da conta, e a visão mostra "No menu"', async () => {
    const { servidor, pedidos } = servidorDasVisoes();
    // A camada da conta, como a API a devolve depois da gravação.
    servidor['PATCH /api/conta/preferencias'] = async (pedido) => {
      const corpo = (await pedido.json()) as { mudancas: unknown };
      pedidos.push({ caminho: 'PATCH /conta/preferencias', corpo });
      return Response.json(corpo.mudancas);
    };
    abrir(`/ativos?visao=${SWITCHES.id}`, servidor);
    await tabela();
    await waitFor(() => expect(escolha().textContent).toContain('Switches'));
    await noMenu('Fixar no menu');
    await waitFor(() => expect(retornos()).toContain('Visão fixada no menu.'));
    await waitFor(() =>
      expect(corpos(pedidos, 'PATCH /conta/preferencias')).toContainEqual({
        mudancas: { tabelas: { fixadas: { ativos: [SWITCHES.id] } } },
      }),
    );
    fireEvent.click(escolha());
    const menu = await screen.findByRole('menu', { name: /^Visão/ });
    expect(nomeDaVisao(menu, /Switches/).textContent).toContain('No menu');
    expect(within(menu).getByRole('menuitem', { name: 'Desafixar do menu' })).toBeTruthy();
  });

  it('"Desafixar do menu" tira a visão da lista, com as que não existem mais', async () => {
    const { servidor, pedidos } = servidorDasVisoes();
    const sumiu = '4f1a5b6c-7384-4e9f-8a1b-1c2d3e4f5a6b';
    abrir(`/ativos?visao=${SWITCHES.id}`, servidor, undefined, undefined, {
      tabelas: { fixadas: { ativos: [sumiu, SWITCHES.id, IMPRESSORAS.id] } },
    });
    await tabela();
    await waitFor(() => expect(escolha().textContent).toContain('Switches'));
    await noMenu('Desafixar do menu');
    await waitFor(() => expect(retornos()).toContain('Visão desafixada do menu.'));
    await waitFor(() =>
      expect(corpos(pedidos, 'PATCH /conta/preferencias')).toContainEqual({
        mudancas: { tabelas: { fixadas: { ativos: [IMPRESSORAS.id] } } },
      }),
    );
  });

  it('"Fixar no menu de todos" grava nos padrões da organização', async () => {
    const { servidor, pedidos } = servidorDasVisoes(true);
    abrir(
      `/ativos?visao=${IMPRESSORAS.id}`,
      { ...servidor, 'GET /api/sessao': () => Response.json({}) },
      naOrganizacao('ativos.ver', 'organizacao.editar'),
    );
    await tabela();
    await waitFor(() => expect(escolha().textContent).toContain('Impressoras de Jundiaí'));
    await noMenu('Fixar no menu de todos');
    await waitFor(() =>
      expect(corpos(pedidos, 'PATCH /organizacao/padroes')).toEqual([
        { mudancas: { tabelas: { fixadasPelaOrganizacao: { ativos: [IMPRESSORAS.id] } } } },
      ]),
    );
    await waitFor(() => expect(retornos()).toContain('Visão fixada no menu.'));
  });
});
