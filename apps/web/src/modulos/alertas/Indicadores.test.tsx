// A tela dos indicadores (spec indicadores, "Tela dos indicadores", "Situação e decisão" e "Período
// dos indicadores"; change p3d-indicadores, design, decisão 7): o período, os quatro indicadores na
// ordem, com a base, o valor, o anterior, a meta, a situação, a decisão fora da meta e as listas,
// os estados, a atualização pelo evento e o foco de cada indicador.
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../sessao/useAcesso.ts';
import { noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Indicadores = components['schemas']['IndicadoresDosAlertas'];

const IMPRESSORA = '0199d3a0-0000-7000-8000-0000000000a1';
const COLETOR = '0199d3a0-0000-7000-8000-0000000000c1';
const DECISAO_DO_TONER =
  'Deixe toner de reserva nos locais que mais esperam, ou suba o limite da regra do toner para o alerta abrir antes.';

const vazio = {
  valor: null,
  anterior: null,
  base: 0,
  situacao: 'sem-dado' as const,
  itens: [],
  mais: 0,
};

function indicadores(mudancas: Partial<Indicadores['indicadores']> = {}): Indicadores {
  return {
    periodo: { inicio: '2026-09-14T12:00:00.000Z', fim: '2026-10-14T12:00:00.000Z' },
    permite: { mudarMeta: false },
    indicadores: {
      toner: {
        meta: 2880,
        metaDeFabrica: 2880,
        valor: 4320,
        anterior: 3312,
        base: 3,
        situacao: 'fora',
        itens: [
          {
            alerta: {
              id: '0199d3a0-0000-7000-8000-0000000000e1',
              texto: 'Cyan Toner Cartridge em 7%',
            },
            alvo: { tipo: 'ativo', id: IMPRESSORA, nome: 'Impressora do RH', local: 'Jundiaí' },
            minutos: 3 * 24 * 60,
            esperando: true,
            reconhecidoPor: null,
          },
        ],
        mais: 0,
      },
      critico: {
        meta: 30,
        metaDeFabrica: 30,
        ...vazio,
      },
      disponibilidade: {
        meta: 990,
        metaDeFabrica: 990,
        valor: 0,
        anterior: 1,
        base: 2,
        situacao: 'dentro',
        itens: [],
        mais: 0,
      },
      'que-voltam': {
        meta: 3,
        metaDeFabrica: 3,
        valor: 1,
        anterior: 0,
        base: 9,
        situacao: 'fora',
        itens: [
          {
            alvo: { tipo: 'coletor', id: COLETOR, nome: 'Coletor de Jundiaí' },
            regra: { id: '0199d3a0-0000-7000-8000-0000000000r1', nome: 'Coletor sem contato' },
            vezes: 4,
            ultimaEm: '2026-10-12T15:30:00.000Z',
          },
        ],
        mais: 0,
      },
      ...mudancas,
    },
  };
}

const VE = naOrganizacao('alertas.ver');

function abrir(
  servidor: ServidorDeTeste,
  {
    endereco = '/alertas/indicadores',
    permissoes = VE,
  }: {
    endereco?: string;
    permissoes?: PermissaoDaSessao[];
  } = {},
) {
  noComputador();
  const canal: CanalDeEventos = criarCanalDeEventos();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, {
        'GET /api/alertas/indicadores/criados': () =>
          Response.json({ indicadores: [], permite: { criar: false } }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return { roteador, canal };
}

const secao = (nome: string) => screen.findByRole('region', { name: nome });

describe('tela dos indicadores', () => {
  it('mostra o período e os quatro indicadores na ordem, com a base, o anterior e a meta', async () => {
    abrir({ 'GET /api/alertas/indicadores': () => Response.json(indicadores()) });
    expect(
      await screen.findByText('Últimos 30 dias, comparados com os 30 anteriores'),
    ).toBeTruthy();
    await secao('Tempo de atendimento do toner');
    expect(
      (await screen.findAllByRole('heading', { level: 2 })).map((titulo) => titulo.textContent),
    ).toEqual([
      'Tempo de atendimento do toner',
      'Tempo até reconhecer o Crítico',
      'Disponibilidade dos ativos',
      'Alertas que voltam',
      'Indicadores da organização',
    ]);
    const toner = await secao('Tempo de atendimento do toner');
    expect(within(toner).getByText('3 dias')).toBeTruthy();
    expect(within(toner).getByText('Antes: 2,3 dias')).toBeTruthy();
    expect(within(toner).getByText('Meta: 2 dias')).toBeTruthy();
    expect(within(toner).getByText('Mediana de 3 trocas')).toBeTruthy();
    expect(toner.getAttribute('data-foco')).toBe('indicador-toner');
  });

  it('Toner fora da meta: diz a situação e a decisão, e a lista leva à ficha do ativo', async () => {
    const { roteador } = abrir({
      'GET /api/alertas/indicadores': () => Response.json(indicadores()),
    });
    const toner = await secao('Tempo de atendimento do toner');
    expect(within(toner).getByText('Fora da meta')).toBeTruthy();
    expect(within(toner).getByText(DECISAO_DO_TONER, { exact: false })).toBeTruthy();
    const grade = within(toner).getByRole('grid', { name: 'Toners acima da meta' });
    const [linha] = within(grade).getAllByRole('row').slice(1);
    expect(linha?.textContent).toContain('Impressora do RH');
    expect(linha?.textContent).toContain('Jundiaí');
    expect(linha?.textContent).toContain('Cyan Toner Cartridge em 7%');
    expect(linha?.textContent).toContain('Esperando há 3 dias');
    (linha as HTMLElement).focus();
    fireEvent.keyDown(linha as HTMLElement, { key: 'Enter' });
    fireEvent.keyUp(linha as HTMLElement, { key: 'Enter' });
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/ativos/${IMPRESSORA}`));
  });

  it('Sem dado: o motivo no lugar do número, sem a decisão', async () => {
    abrir({ 'GET /api/alertas/indicadores': () => Response.json(indicadores()) });
    const critico = await secao('Tempo até reconhecer o Crítico');
    expect(
      within(critico).getByText('Nenhum alerta Crítico para reconhecer nos últimos 30 dias.'),
    ).toBeTruthy();
    expect(within(critico).getByText('Sem dado')).toBeTruthy();
    expect(within(critico).getByText('Antes: sem dado')).toBeTruthy();
    expect(within(critico).queryByText(/O que fazer/)).toBeNull();
  });

  it('dentro da meta sem nada na lista, diz isso no lugar do número', async () => {
    abrir({ 'GET /api/alertas/indicadores': () => Response.json(indicadores()) });
    const disponibilidade = await secao('Disponibilidade dos ativos');
    expect(within(disponibilidade).getByText('Nenhum ativo abaixo de 99%.')).toBeTruthy();
    expect(within(disponibilidade).getByText('Dentro da meta')).toBeTruthy();
    expect(within(disponibilidade).getByText('Antes: 1 ativo')).toBeTruthy();
    expect(within(disponibilidade).getByText('2 ativos com queda no período')).toBeTruthy();
  });

  it('os alertas que voltam listam o coletor, a regra e as vezes, e a linha leva aos coletores', async () => {
    const { roteador } = abrir({
      'GET /api/alertas/indicadores': () => Response.json(indicadores()),
    });
    const queVoltam = await secao('Alertas que voltam');
    expect(within(queVoltam).getByText('1 ativo')).toBeTruthy();
    const [linha] = within(within(queVoltam).getByRole('grid')).getAllByRole('row').slice(1);
    expect(linha?.textContent).toContain('Coletor de Jundiaí');
    expect(linha?.textContent).toContain('Coletor sem contato');
    expect(linha?.textContent).toContain('4 vezes');
    (linha as HTMLElement).focus();
    fireEvent.keyDown(linha as HTMLElement, { key: 'Enter' });
    fireEvent.keyUp(linha as HTMLElement, { key: 'Enter' });
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe(`/administracao/coletores/${COLETOR}`),
    );
  });

  it('Lista longa: mostra 20 e diz quantos ficaram de fora', async () => {
    const itens = Array.from({ length: 20 }, (_, indice) => ({
      alvo: {
        tipo: 'ativo' as const,
        id: `0199d3a0-0000-7000-8000-0000000001${String(indice).padStart(2, '0')}`,
        nome: `Ativo ${indice + 1}`,
        local: 'Jundiaí',
      },
      porMil: 950 + indice,
      minutosForaDoAr: 36 * 60 - indice * 60,
    }));
    abrir({
      'GET /api/alertas/indicadores': () =>
        Response.json(
          indicadores({
            disponibilidade: {
              meta: 990,
              metaDeFabrica: 990,
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
    const disponibilidade = await secao('Disponibilidade dos ativos');
    const grade = within(disponibilidade).getByRole('grid', { name: 'Ativos abaixo da meta' });
    expect(within(grade).getAllByRole('row').slice(1)).toHaveLength(20);
    expect(within(grade).getAllByRole('row')[1]?.textContent).toContain('95%');
    expect(within(grade).getAllByRole('row')[1]?.textContent).toContain('1,5 dia');
    expect(within(disponibilidade).getByText('E mais 3.')).toBeTruthy();
  });

  it('a falha da API diz o motivo e tenta de novo', async () => {
    let pedidos = 0;
    abrir({
      'GET /api/alertas/indicadores': () => {
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
    expect(await secao('Tempo de atendimento do toner')).toBeTruthy();
  });

  it('o evento dos alertas lê os indicadores de novo, sem recarregar', async () => {
    let pedidos = 0;
    const { canal } = abrir({
      'GET /api/alertas/indicadores': () => {
        pedidos += 1;
        return Response.json(
          pedidos === 1
            ? indicadores()
            : indicadores({
                toner: { ...indicadores().indicadores.toner, valor: 1440, situacao: 'dentro' },
              }),
        );
      },
    });
    const toner = await secao('Tempo de atendimento do toner');
    expect(within(toner).getByText('3 dias')).toBeTruthy();
    act(() => canal.publicar({ id: 'e1', tipo: 'alertas.mudaram', momento: '', alvo: null }));
    await waitFor(() => expect(within(toner).getByText('1 dia')).toBeTruthy());
    expect(within(toner).getByText('Dentro da meta')).toBeTruthy();
  });

  it('Meta de um indicador mudada: o evento das metas lê os indicadores de novo, sem recarregar', async () => {
    let pedidos = 0;
    const { canal } = abrir({
      'GET /api/alertas/indicadores': () => {
        pedidos += 1;
        return Response.json(
          pedidos === 1
            ? indicadores()
            : indicadores({
                toner: { ...indicadores().indicadores.toner, meta: 5760, situacao: 'dentro' },
              }),
        );
      },
    });
    const toner = await secao('Tempo de atendimento do toner');
    expect(within(toner).getByText('Fora da meta')).toBeTruthy();
    act(() =>
      canal.publicar({
        id: 'e2',
        tipo: 'metas.mudaram',
        momento: '',
        alvo: { tipo: 'indicador', id: '0199d3a0-0000-7000-8000-0000000000f1' },
      }),
    );
    await waitFor(() => expect(within(toner).getByText('Dentro da meta')).toBeTruthy());
  });

  it('o endereço com o foco leva ao indicador, como a notificação', async () => {
    abrir(
      { 'GET /api/alertas/indicadores': () => Response.json(indicadores()) },
      { endereco: '/alertas/indicadores?foco=indicador-que-voltam' },
    );
    const queVoltam = await secao('Alertas que voltam');
    await waitFor(() => expect(queVoltam.contains(document.activeElement)).toBe(true));
  });
});

describe('meta pela tela', () => {
  const ADMINISTRA = naOrganizacao('alertas.administrar', 'alertas.ver');
  const comMeta = (): Indicadores => ({ ...indicadores(), permite: { mudarMeta: true } });

  it('Meta mudada: quem administra muda a meta do toner para 1 dia, com o retorno', async () => {
    let corpo: unknown;
    let leituras = 0;
    abrir(
      {
        'GET /api/alertas/indicadores': () => {
          leituras += 1;
          return Response.json(comMeta());
        },
        'PUT /api/alertas/indicadores/toner/meta': async (pedido) => {
          corpo = await pedido.json();
          return Response.json({ indicador: 'toner', meta: 1440, metaDeFabrica: 2880 });
        },
      },
      { permissoes: ADMINISTRA },
    );
    const toner = await secao('Tempo de atendimento do toner');
    fireEvent.click(within(toner).getByRole('button', { name: 'Mudar a meta' }));
    const dialogo = await screen.findByRole('dialog', {
      name: 'Meta do tempo de atendimento do toner',
    });
    const meta = within(dialogo).getByRole('textbox', { name: /^Meta/ }) as HTMLInputElement;
    expect(meta.value).toBe('2');
    expect((within(dialogo).getByRole('radio', { name: 'Dias' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(within(dialogo).getByText('De fábrica: 2 dias.')).toBeTruthy();
    fireEvent.change(meta, { target: { value: '1' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Meta salva.')).toBeTruthy();
    expect(corpo).toEqual({ meta: 1440 });
    await waitFor(() => expect(leituras).toBe(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Meta fora dos limites: a mensagem fica no campo, sem pedir à API', async () => {
    let pedidos = 0;
    abrir(
      {
        'GET /api/alertas/indicadores': () => Response.json(comMeta()),
        'PUT /api/alertas/indicadores/disponibilidade/meta': () => {
          pedidos += 1;
          return Response.json({});
        },
      },
      { permissoes: ADMINISTRA },
    );
    const disponibilidade = await secao('Disponibilidade dos ativos');
    fireEvent.click(within(disponibilidade).getByRole('button', { name: 'Mudar a meta' }));
    const dialogo = await screen.findByRole('dialog', {
      name: 'Meta da disponibilidade dos ativos',
    });
    expect(within(dialogo).queryByRole('radio')).toBeNull();
    fireEvent.change(within(dialogo).getByRole('textbox', { name: /^Meta/ }), {
      target: { value: '100' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialogo).findByText('A meta deve ficar entre 90% e 99,9%.')).toBeTruthy();
    expect(pedidos).toBe(0);
  });

  it('a recusa da API com a mensagem do campo fica no campo', async () => {
    abrir(
      {
        'GET /api/alertas/indicadores': () => Response.json(comMeta()),
        'PUT /api/alertas/indicadores/que-voltam/meta': () =>
          Response.json(
            {
              type: 'urn:grafite:problema:dados-invalidos',
              title: 'Dados inválidos',
              status: 400,
              detail: 'Confira os campos indicados.',
              campos: { meta: 'A meta deve ficar entre 2 e 20 vezes.' },
              codigoDeRastreio: 'ABCD-1234',
            },
            { status: 400 },
          ),
      },
      { permissoes: ADMINISTRA },
    );
    const queVoltam = await secao('Alertas que voltam');
    fireEvent.click(within(queVoltam).getByRole('button', { name: 'Mudar a meta' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Meta dos alertas que voltam' });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: /^Meta/ }), {
      target: { value: '5' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialogo).findByText('A meta deve ficar entre 2 e 20 vezes.')).toBeTruthy();
  });

  it('Quem só vê os alertas: vê as metas, sem "Mudar a meta"', async () => {
    abrir({ 'GET /api/alertas/indicadores': () => Response.json(indicadores()) });
    const toner = await secao('Tempo de atendimento do toner');
    expect(within(toner).getByText('Meta: 2 dias')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mudar a meta' })).toBeNull();
  });
});

type IndicadorCriado = components['schemas']['IndicadorCriado'];

const TIPO = '0199d3a0-0000-7000-8000-0000000000t1';
const JUNDIAI = '0199d3a0-0000-7000-8000-0000000000l1';

const criado = (mudancas: Partial<IndicadorCriado> = {}): IndicadorCriado => ({
  id: '0199d3a0-0000-7000-8000-0000000000k1',
  nome: 'Impressoras de Jundiaí',
  medida: 'disponibilidade',
  recorte: {
    tipo: { id: TIPO, nome: 'Impressora' },
    modelo: null,
    local: { id: JUNDIAI, nome: 'Jundiaí' },
  },
  meta: 980,
  metaDeFabrica: 990,
  valor: 1,
  anterior: 0,
  base: 2,
  situacao: 'fora',
  itens: [
    {
      alvo: { tipo: 'ativo', id: IMPRESSORA, nome: 'Impressora do RH', local: 'Jundiaí' },
      detalhe: '93,3% no ar, 2 dias sem responder',
      momento: null,
    },
  ],
  mais: 0,
  ...mudancas,
});

describe('indicadores da organização', () => {
  const ADMINISTRA = naOrganizacao('alertas.administrar', 'alertas.ver');

  it('a tela explica o indicador, e a seção vazia diz para que servem os criados', async () => {
    abrir(
      {
        'GET /api/alertas/indicadores': () => Response.json(indicadores()),
        'GET /api/alertas/indicadores/criados': () =>
          Response.json({ indicadores: [], permite: { criar: true } }),
      },
      { permissoes: ADMINISTRA },
    );
    expect(await screen.findByText(/^Um indicador mede o atendimento/)).toBeTruthy();
    const daOrganizacao = await secao('Indicadores da organização');
    expect(await within(daOrganizacao).findByText('Nenhum indicador criado.')).toBeTruthy();
    expect(
      within(daOrganizacao).getAllByRole('button', { name: 'Novo indicador' }),
    ).not.toHaveLength(0);
  });

  it('Disponibilidade das impressoras de Jundiaí: o criado com a medida, o recorte e a lista', async () => {
    abrir({
      'GET /api/alertas/indicadores': () => Response.json(indicadores()),
      'GET /api/alertas/indicadores/criados': () =>
        Response.json({ indicadores: [criado()], permite: { criar: false } }),
    });
    const indicador = await secao('Impressoras de Jundiaí');
    expect(
      within(indicador).getByText('Disponibilidade dos ativos · Impressora · Jundiaí'),
    ).toBeTruthy();
    expect(within(indicador).getByText('Meta: 98%')).toBeTruthy();
    expect(within(indicador).getByText('93,3% no ar, 2 dias sem responder')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Novo indicador' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });

  it('Novo indicador: cria pela medida, com a meta em porcentagem', async () => {
    let corpo: unknown;
    abrir(
      {
        'GET /api/alertas/indicadores': () => Response.json(indicadores()),
        'GET /api/alertas/indicadores/criados': () =>
          Response.json({ indicadores: [], permite: { criar: true } }),
        'GET /api/tipos-de-ativo': () =>
          Response.json({ tipos: [], permite: { cadastrar: false } }),
        'POST /api/alertas/indicadores/criados': async (pedido) => {
          corpo = await pedido.json();
          return Response.json(criado(), { status: 201 });
        },
      },
      { permissoes: ADMINISTRA },
    );
    const daOrganizacao = await secao('Indicadores da organização');
    fireEvent.click(
      (
        await within(daOrganizacao).findAllByRole('button', { name: 'Novo indicador' })
      )[0] as HTMLElement,
    );
    const gaveta = await screen.findByRole('dialog', { name: 'Novo indicador' });
    fireEvent.change(within(gaveta).getByRole('textbox', { name: /^Nome/ }), {
      target: { value: 'Disponibilidade geral' },
    });
    fireEvent.click(within(gaveta).getByRole('button', { name: /Medida$/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Disponibilidade dos ativos' }));
    fireEvent.change(within(gaveta).getByRole('textbox', { name: /^Meta/ }), {
      target: { value: '98,5' },
    });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Criar indicador' }));
    expect(await screen.findByText('Indicador criado.')).toBeTruthy();
    expect(corpo).toEqual({
      nome: 'Disponibilidade geral',
      medida: 'disponibilidade',
      recorte: { tipoId: null, modeloId: null, localId: null },
      meta: 985,
    });
  });
});
