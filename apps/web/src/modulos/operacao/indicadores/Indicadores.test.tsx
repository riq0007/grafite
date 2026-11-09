// A tela dos indicadores da operação (spec indicadores-da-operacao, "Tela dos indicadores da
// operação", "Situação e decisão dos indicadores da operação" e "Quem vê os indicadores da
// operação"; spec modulo-operacao, "Operação atualizada pelos eventos"; change
// p4f-indicadores-da-operacao, design, decisão 10): o período, os indicadores que a conta vê na
// ordem, com a base, o valor, o anterior, a meta, a situação, a decisão fora da meta e as listas, os
// estados, a atualização pelos eventos e o foco de cada indicador.
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Indicadores = components['schemas']['IndicadoresDaOperacao'];
type Resultados = Indicadores['indicadores'];
type Paginas = NonNullable<Resultados['paginas-por-toner']>;

const DIA = 24 * 60;

const NB0031 = {
  id: '0199d3a0-0000-7000-8000-0000000000a1',
  nome: 'Dell Latitude 5420',
  patrimonio: 'NB-0031',
  local: 'Jundiaí › Financeiro',
};
const PAT00412 = {
  id: '0199d3a0-0000-7000-8000-0000000000a2',
  nome: 'HP LaserJet M404',
  patrimonio: 'PAT-00412',
  local: 'Jundiaí › Expedição',
};
const OS_12 = { id: '0199d3a0-0000-7000-8000-0000000000b1', numero: 12, problema: 'Não liga' };
const OS_20 = {
  id: '0199d3a0-0000-7000-8000-0000000000b2',
  numero: 20,
  problema: 'Não liga de novo',
};
const CF258A = { id: '0199d3a0-0000-7000-8000-0000000000c1', codigo: 'CF258A' };

const DECISAO_DAS_REPETIDAS =
  'Confira se o conserto resolveu a causa do problema, ou se o ativo deve ser substituído.';

function indicadores(mudancas: Partial<Resultados> = {}): Indicadores {
  return {
    periodo: { inicio: '2026-09-22T12:00:00.000Z', fim: '2026-10-22T12:00:00.000Z' },
    permite: { mudarMeta: false },
    indicadores: {
      'resolucao-das-os': {
        meta: 3 * DIA,
        metaDeFabrica: 3 * DIA,
        valor: 2 * DIA,
        anterior: 4.5 * DIA,
        base: 3,
        situacao: 'dentro',
        itens: [
          {
            ordem: OS_20,
            ativo: NB0031,
            minutos: 5 * DIA,
            emAberto: true,
            esperaPelaPeca: 0,
            esperaPeloFornecedor: 0,
          },
          {
            ordem: OS_12,
            ativo: NB0031,
            minutos: 6 * DIA,
            emAberto: false,
            esperaPelaPeca: 0,
            esperaPeloFornecedor: 4 * DIA,
          },
        ],
        mais: 0,
      },
      'os-repetidas': {
        meta: 2,
        metaDeFabrica: 2,
        valor: 1,
        anterior: 0,
        base: 34,
        situacao: 'fora',
        itens: [
          {
            ativo: NB0031,
            quantas: 2,
            ordens: [OS_12, OS_20],
            ultimaEm: '2026-10-17T12:00:00.000Z',
          },
        ],
        mais: 0,
      },
      'paginas-por-toner': {
        meta: 800,
        metaDeFabrica: 800,
        valor: 1,
        anterior: null,
        base: 8,
        situacao: 'fora',
        itens: [
          {
            impressora: PAT00412,
            consumivel: CF258A,
            paginas: 1850,
            rendimento: 3000,
            porMil: 617,
            trocadoEm: '2026-10-20T13:00:00.000Z',
          },
        ],
        mais: 0,
      },
      ...mudancas,
    },
  };
}

/** Só os indicadores das chaves dadas, como a API responde a quem não vê os outros. */
function so(...chaves: (keyof Resultados)[]): Indicadores {
  const todos = indicadores();
  return {
    ...todos,
    indicadores: Object.fromEntries(chaves.map((chave) => [chave, todos.indicadores[chave]])),
  };
}

const ADMINISTRA = naOrganizacao('operacao.administrar', 'ordens.ver', 'estoque.ver');

function abrir(
  servidor: ServidorDeTeste,
  {
    endereco = '/operacao/indicadores',
    permissoes = ADMINISTRA,
  }: { endereco?: string; permissoes?: PermissaoDaSessao[] } = {},
) {
  noComputador();
  const canal: CanalDeEventos = criarCanalDeEventos();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, {
        'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return { roteador, canal };
}

const secao = (nome: string) => screen.findByRole('region', { name: nome });

/** As linhas de uma lista, sem a do cabeçalho. */
const linhas = (grade: HTMLElement) => within(grade).getAllByRole('row').slice(1);

function abrirLinha(linha: HTMLElement | undefined) {
  (linha as HTMLElement).focus();
  fireEvent.keyDown(linha as HTMLElement, { key: 'Enter' });
  fireEvent.keyUp(linha as HTMLElement, { key: 'Enter' });
}

describe('tela dos indicadores da operação', () => {
  it('mostra o período e os três indicadores na ordem, com a base, o anterior e a meta', async () => {
    abrir({ 'GET /api/operacao/indicadores': () => Response.json(indicadores()) });
    expect(
      await screen.findByText('Últimos 30 dias, comparados com os 30 anteriores'),
    ).toBeTruthy();
    expect(
      (await screen.findAllByRole('heading', { level: 2 })).map((titulo) => titulo.textContent),
    ).toEqual(['Tempo de resolução das OS', 'OS repetidas', 'Páginas por toner']);
    const resolucao = await secao('Tempo de resolução das OS');
    expect(within(resolucao).getByText('2 dias')).toBeTruthy();
    expect(within(resolucao).getByText('Antes: 4,5 dias')).toBeTruthy();
    expect(within(resolucao).getByText('Meta: 3 dias')).toBeTruthy();
    expect(within(resolucao).getByText('Mediana de 3 OS resolvidas')).toBeTruthy();
    expect(within(resolucao).getByText('Dentro da meta')).toBeTruthy();
    expect(resolucao.getAttribute('data-foco')).toBe('indicador-resolucao-das-os');
  });

  it('OS ainda em aberto e Espera pelo fornecedor: a lista começa pela em aberto, e a linha leva à ficha da OS', async () => {
    const { roteador } = abrir({
      'GET /api/operacao/indicadores': () => Response.json(indicadores()),
    });
    const resolucao = await secao('Tempo de resolução das OS');
    const [emAberto, resolvida] = linhas(
      within(resolucao).getByRole('grid', { name: 'OS acima da meta' }),
    );
    expect(emAberto?.textContent).toContain('20');
    expect(emAberto?.textContent).toContain('NB-0031 · Dell Latitude 5420');
    expect(emAberto?.textContent).toContain('Jundiaí › Financeiro');
    expect(emAberto?.textContent).toContain('Não liga de novo');
    expect(emAberto?.textContent).toContain('Aberta há 5 dias');
    expect(resolvida?.textContent).toContain('12');
    expect(resolvida?.textContent).toContain('6 dias');
    expect(resolvida?.textContent).toContain('4 dias esperando o fornecedor');
    abrirLinha(resolvida);
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/ordens/12'));
  });

  it('a espera soma a peça e o fornecedor quando houve as duas', async () => {
    const base = indicadores().indicadores['resolucao-das-os'];
    abrir({
      'GET /api/operacao/indicadores': () =>
        Response.json(
          indicadores({
            'resolucao-das-os': base && {
              ...base,
              itens: [{ ...base.itens[1], esperaPelaPeca: DIA } as (typeof base.itens)[number]],
            },
          }),
        ),
    });
    const resolucao = await secao('Tempo de resolução das OS');
    const [linha] = linhas(within(resolucao).getByRole('grid', { name: 'OS acima da meta' }));
    expect(linha?.textContent).toContain('1 dia esperando a peça e 4 dias esperando o fornecedor');
  });

  it('Problema que voltou: as OS repetidas listam o ativo, quantas e as OS, cada uma levando à ficha', async () => {
    const { roteador } = abrir({
      'GET /api/operacao/indicadores': () => Response.json(indicadores()),
    });
    const repetidas = await secao('OS repetidas');
    expect(within(repetidas).getByText('1 ativo')).toBeTruthy();
    expect(within(repetidas).getByText('Fora da meta')).toBeTruthy();
    expect(within(repetidas).getByText(DECISAO_DAS_REPETIDAS, { exact: false })).toBeTruthy();
    expect(within(repetidas).getByText('34 ativos com OS no período')).toBeTruthy();
    const [linha] = linhas(
      within(repetidas).getByRole('grid', { name: 'Ativos com OS repetidas' }),
    );
    expect(linha?.textContent).toContain('2 OS');
    expect(linha?.textContent).toContain('Não liga');
    expect(linha?.textContent).toContain('Não liga de novo');
    fireEvent.click(within(linha as HTMLElement).getByRole('link', { name: 'OS 20' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/ordens/20'));
  });

  it('o ativo das OS repetidas leva à ficha dele', async () => {
    const { roteador } = abrir({
      'GET /api/operacao/indicadores': () => Response.json(indicadores()),
    });
    const repetidas = await secao('OS repetidas');
    fireEvent.click(within(repetidas).getByRole('link', { name: 'NB-0031 · Dell Latitude 5420' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/ativos/${NB0031.id}`));
  });

  it('Toner que rendeu pouco: as páginas sobre o rendimento, e a linha leva à ficha da impressora', async () => {
    const { roteador } = abrir({
      'GET /api/operacao/indicadores': () => Response.json(indicadores()),
    });
    const paginas = await secao('Páginas por toner');
    expect(within(paginas).getByText('1 toner')).toBeTruthy();
    expect(within(paginas).getByText('Antes: sem dado')).toBeTruthy();
    expect(within(paginas).getByText('Meta: 80%')).toBeTruthy();
    const [linha] = linhas(within(paginas).getByRole('grid', { name: 'Toners abaixo da meta' }));
    expect(linha?.textContent).toContain('PAT-00412 · HP LaserJet M404');
    expect(linha?.textContent).toContain('CF258A');
    expect(linha?.textContent).toContain('1.850 de 3.000 páginas (61,7%)');
    abrirLinha(linha);
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/ativos/${PAT00412.id}`));
  });

  it('Sem dado: o motivo no lugar do número, sem a decisão', async () => {
    abrir({
      'GET /api/operacao/indicadores': () =>
        Response.json(
          indicadores({
            'resolucao-das-os': {
              meta: 3 * DIA,
              metaDeFabrica: 3 * DIA,
              valor: null,
              anterior: null,
              base: 0,
              situacao: 'sem-dado',
              itens: [],
              mais: 0,
            },
          }),
        ),
    });
    const resolucao = await secao('Tempo de resolução das OS');
    expect(within(resolucao).getByText('Nenhuma OS resolvida nos últimos 30 dias.')).toBeTruthy();
    expect(within(resolucao).getByText('Sem dado')).toBeTruthy();
    expect(within(resolucao).getByText('Antes: sem dado')).toBeTruthy();
    expect(within(resolucao).queryByText(/O que fazer/)).toBeNull();
  });

  it('dentro da meta sem nada na lista, diz isso no lugar do número', async () => {
    const vazio = { anterior: 1, situacao: 'dentro' as const, itens: [], mais: 0, valor: 0 };
    abrir({
      'GET /api/operacao/indicadores': () =>
        Response.json(
          indicadores({
            'os-repetidas': { meta: 2, metaDeFabrica: 2, base: 34, ...vazio },
            'paginas-por-toner': { meta: 800, metaDeFabrica: 800, base: 8, ...vazio },
          }),
        ),
    });
    const repetidas = await secao('OS repetidas');
    expect(within(repetidas).getByText('Nenhum ativo com 2 OS nos últimos 30 dias.')).toBeTruthy();
    expect(within(repetidas).getByText('Antes: 1 ativo')).toBeTruthy();
    const paginas = await secao('Páginas por toner');
    expect(within(paginas).getByText('Nenhum toner abaixo de 80% do rendimento.')).toBeTruthy();
    expect(within(paginas).getByText('8 toners trocados com o total de páginas')).toBeTruthy();
    expect(within(paginas).queryByRole('grid')).toBeNull();
  });

  it('nas páginas por toner sem toner medido, diz que nenhum foi trocado com o total', async () => {
    abrir({
      'GET /api/operacao/indicadores': () =>
        Response.json(
          indicadores({
            'paginas-por-toner': {
              meta: 800,
              metaDeFabrica: 800,
              valor: null,
              anterior: null,
              base: 0,
              situacao: 'sem-dado',
              itens: [],
              mais: 0,
            },
          }),
        ),
    });
    const paginas = await secao('Páginas por toner');
    expect(
      within(paginas).getByText('Nenhum toner trocado com o total de páginas nos últimos 30 dias.'),
    ).toBeTruthy();
  });

  it('Lista longa: mostra 20 e diz quantos ficaram de fora', async () => {
    const itens: Paginas['itens'] = Array.from({ length: 20 }, (_, indice) => ({
      impressora: {
        ...PAT00412,
        id: `0199d3a0-0000-7000-8000-0000000001${String(indice).padStart(2, '0')}`,
        patrimonio: `PAT-${String(500 + indice)}`,
      },
      consumivel: CF258A,
      paginas: 1000 + indice * 50,
      rendimento: 3000,
      porMil: Math.round(((1000 + indice * 50) * 1000) / 3000),
      trocadoEm: '2026-10-20T13:00:00.000Z',
    }));
    abrir({
      'GET /api/operacao/indicadores': () =>
        Response.json(
          indicadores({
            'paginas-por-toner': {
              meta: 800,
              metaDeFabrica: 800,
              valor: 23,
              anterior: 20,
              base: 30,
              situacao: 'fora',
              itens,
              mais: 3,
            },
          }),
        ),
    });
    const paginas = await secao('Páginas por toner');
    const grade = within(paginas).getByRole('grid', { name: 'Toners abaixo da meta' });
    expect(linhas(grade)).toHaveLength(20);
    expect(linhas(grade)[0]?.textContent).toContain('1.000 de 3.000 páginas (33,3%)');
    expect(within(paginas).getByText('E mais 3.')).toBeTruthy();
  });

  it('Técnico de Jundiaí: o tempo de resolução e as OS repetidas, sem as páginas por toner', async () => {
    abrir(
      {
        'GET /api/operacao/indicadores': () =>
          Response.json(so('resolucao-das-os', 'os-repetidas')),
      },
      {
        permissoes: [
          { chave: 'ordens.atender', organizacao: false, locais: ['jundiai'] },
          { chave: 'ordens.ver', organizacao: false, locais: ['jundiai'] },
        ],
      },
    );
    expect(
      (await screen.findAllByRole('heading', { level: 2 })).map((titulo) => titulo.textContent),
    ).toEqual(['Tempo de resolução das OS', 'OS repetidas']);
  });

  it('Almoxarife: só as páginas por toner', async () => {
    abrir(
      { 'GET /api/operacao/indicadores': () => Response.json(so('paginas-por-toner')) },
      { permissoes: naOrganizacao('estoque.ver') },
    );
    expect(
      (await screen.findAllByRole('heading', { level: 2 })).map((titulo) => titulo.textContent),
    ).toEqual(['Páginas por toner']);
  });

  it('a conta sem as OS e sem o estoque não tem acesso', async () => {
    abrir({}, { permissoes: naOrganizacao('consumiveis.ver') });
    expect(
      await screen.findByText('Você não tem acesso aos indicadores da operação.'),
    ).toBeTruthy();
  });

  it('mostra o esqueleto enquanto carrega', async () => {
    abrir({ 'GET /api/operacao/indicadores': () => new Promise<Response>(() => {}) });
    expect(await screen.findByText('Carregando os indicadores…')).toBeTruthy();
  });

  it('a falha da API diz o motivo e tenta de novo', async () => {
    let pedidos = 0;
    abrir({
      'GET /api/operacao/indicadores': () => {
        pedidos += 1;
        return pedidos === 1
          ? Response.json(
              {
                type: 'urn:grafite:problema:erro-interno',
                title: 'Erro interno',
                status: 500,
                detail: 'Erro.',
                codigoDeRastreio: 'ABCD-1234',
              },
              { status: 500 },
            )
          : Response.json(indicadores());
      },
    });
    expect(await screen.findByText(/^Não foi possível carregar os indicadores./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await secao('Tempo de resolução das OS')).toBeTruthy();
  });

  it('OS resolvida com os indicadores abertos: o evento das OS lê os indicadores de novo, sem recarregar', async () => {
    let pedidos = 0;
    const { canal } = abrir({
      'GET /api/operacao/indicadores': () => {
        pedidos += 1;
        const base = indicadores().indicadores['resolucao-das-os'];
        return Response.json(
          pedidos === 1
            ? indicadores()
            : indicadores({ 'resolucao-das-os': base && { ...base, base: 4 } }),
        );
      },
    });
    const resolucao = await secao('Tempo de resolução das OS');
    expect(within(resolucao).getByText('Mediana de 3 OS resolvidas')).toBeTruthy();
    act(() =>
      canal.publicar({
        id: 'e1',
        tipo: 'ordens.mudaram',
        momento: '',
        alvo: { tipo: 'ordem', id: OS_12.id },
      }),
    );
    await waitFor(() =>
      expect(within(resolucao).getByText('Mediana de 4 OS resolvidas')).toBeTruthy(),
    );
  });

  it('Abrir pela notificação: o endereço com o foco leva às OS repetidas', async () => {
    abrir(
      { 'GET /api/operacao/indicadores': () => Response.json(indicadores()) },
      { endereco: '/operacao/indicadores?foco=indicador-os-repetidas' },
    );
    const repetidas = await secao('OS repetidas');
    await waitFor(() => expect(repetidas.contains(document.activeElement)).toBe(true));
  });
});

describe('meta pela tela', () => {
  const comMeta = (): Indicadores => ({ ...indicadores(), permite: { mudarMeta: true } });

  it('Meta mudada: quem administra a operação muda a meta das OS repetidas para 3 OS, com o retorno', async () => {
    let corpo: unknown;
    let leituras = 0;
    abrir({
      'GET /api/operacao/indicadores': () => {
        leituras += 1;
        return Response.json(comMeta());
      },
      'PUT /api/operacao/indicadores/os-repetidas/meta': async (pedido) => {
        corpo = await pedido.json();
        return Response.json({ indicador: 'os-repetidas', meta: 3, metaDeFabrica: 2 });
      },
    });
    const repetidas = await secao('OS repetidas');
    fireEvent.click(within(repetidas).getByRole('button', { name: 'Mudar a meta' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Meta das OS repetidas' });
    const meta = within(dialogo).getByRole('textbox', { name: /^Meta/ }) as HTMLInputElement;
    expect(meta.value).toBe('2');
    expect(within(dialogo).queryByRole('radio')).toBeNull();
    expect(within(dialogo).getByText('De fábrica: 2 OS.')).toBeTruthy();
    fireEvent.change(meta, { target: { value: '3' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Meta salva.')).toBeTruthy();
    expect(corpo).toEqual({ meta: 3 });
    await waitFor(() => expect(leituras).toBe(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('o tempo de resolução escolhe entre horas e dias', async () => {
    let corpo: unknown;
    abrir({
      'GET /api/operacao/indicadores': () => Response.json(comMeta()),
      'PUT /api/operacao/indicadores/resolucao-das-os/meta': async (pedido) => {
        corpo = await pedido.json();
        return Response.json({ indicador: 'resolucao-das-os', meta: 2160, metaDeFabrica: 4320 });
      },
    });
    const resolucao = await secao('Tempo de resolução das OS');
    fireEvent.click(within(resolucao).getByRole('button', { name: 'Mudar a meta' }));
    const dialogo = await screen.findByRole('dialog', {
      name: 'Meta do tempo de resolução das OS',
    });
    expect((within(dialogo).getByRole('radio', { name: 'Dias' }) as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Horas' }));
    fireEvent.change(within(dialogo).getByRole('textbox', { name: /^Meta/ }), {
      target: { value: '36' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Meta salva.')).toBeTruthy();
    expect(corpo).toEqual({ meta: 2160 });
  });

  it('Meta fora dos limites: as páginas por toner em 40% ficam no campo, sem pedir à API', async () => {
    let pedidos = 0;
    abrir({
      'GET /api/operacao/indicadores': () => Response.json(comMeta()),
      'PUT /api/operacao/indicadores/paginas-por-toner/meta': () => {
        pedidos += 1;
        return Response.json({});
      },
    });
    const paginas = await secao('Páginas por toner');
    fireEvent.click(within(paginas).getByRole('button', { name: 'Mudar a meta' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Meta das páginas por toner' });
    const meta = within(dialogo).getByRole('textbox', { name: /^Meta/ }) as HTMLInputElement;
    expect(meta.value).toBe('80');
    fireEvent.change(meta, { target: { value: '40' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialogo).findByText('A meta deve ficar entre 50% e 100%.')).toBeTruthy();
    expect(pedidos).toBe(0);
  });

  it('Quem atende sem administrar: vê as metas, sem "Mudar a meta"', async () => {
    abrir(
      {
        'GET /api/operacao/indicadores': () =>
          Response.json(so('resolucao-das-os', 'os-repetidas')),
      },
      { permissoes: naOrganizacao('ordens.atender', 'ordens.ver') },
    );
    const resolucao = await secao('Tempo de resolução das OS');
    expect(within(resolucao).getByText('Meta: 3 dias')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mudar a meta' })).toBeNull();
  });
});
