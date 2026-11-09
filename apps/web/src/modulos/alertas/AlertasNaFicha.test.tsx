// O bloco Alertas na ficha do ativo (spec modulo-alertas, "Alertas na ficha do ativo"; change
// p3a-regras-e-alertas, design, decisão 11): os alertas abertos do ativo, com as ações de quem pode
// tratá-los, o caminho para os resolvidos e o silêncio, com o silenciar e o retomar.
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Ficha = components['schemas']['FichaDoAtivo'];
type Alerta = components['schemas']['AlertaNaLista'];

const ID = '0199d3a0-0000-7000-8000-0000000000a1';

const FICHA: Ficha = {
  id: ID,
  rotulo: 'Impressora do RH',
  tipo: { id: 'impressora', nome: 'Impressora', icone: 'impressora' },
  modelo: null,
  imagem: null,
  patrimonio: 'PAT-00412',
  serie: null,
  hostname: null,
  local: null,
  responsavel: null,
  uso: 'em-uso',
  situacao: 'ativo',
  criadoEm: '2026-10-09T12:00:00.000Z',
  atualizadoEm: '2026-10-09T12:00:00.000Z',
  valores: { 'ativo.patrimonio': 'PAT-00412', 'ativo.uso': 'em-uso' },
  estado: {},
  referencias: { pessoas: {}, locais: {}, ativos: {}, fornecedores: {}, arquivos: {} },
  permite: { editar: false, verRestritos: false, editarRestritos: false, verResponsavel: false },
};

const MINUTO = 60_000;
const antes = (minutos: number) => new Date(Date.now() - (minutos + 0.5) * MINUTO).toISOString();

const TONER: Alerta = {
  id: 'al-toner',
  regra: { id: 'r-toner', nome: 'Toner em 10% ou menos' },
  condicao: 'toner.nivel',
  severidade: 'critico',
  texto: 'Toner preto em 8%',
  situacao: 'aberto',
  alvo: {
    tipo: 'ativo',
    id: ID,
    nome: 'Impressora do RH',
    patrimonio: 'PAT-00412',
    tipoDoAtivo: { id: 'impressora', nome: 'Impressora', icone: 'impressora' },
    imagem: null,
    modelo: null,
  },
  abertoEm: antes(32),
  resolvidoEm: null,
  comoTerminou: null,
  reconhecido: null,
  adiado: null,
  silencio: null,
  permite: { tratar: true },
};

const TRATA = naOrganizacao('ativos.ver', 'alertas.tratar', 'alertas.ver');
const VE = naOrganizacao('ativos.ver', 'alertas.ver');

/** A ficha do ativo, com os alertas abertos e o silêncio dados. */
function servidorDaFicha({
  alertas = [],
  silencio = null,
  tratar = true,
}: {
  alertas?: Alerta[];
  silencio?: { ate: string | null; motivo: string | null; nome: string; em: string } | null;
  tratar?: boolean;
} = {}) {
  const pedidosDosAlertas: URLSearchParams[] = [];
  const servidor: ServidorDeTeste = {
    [`GET /api/ativos/${ID}`]: () => Response.json(FICHA),
    [`GET /api/ativos/${ID}/ligados`]: () =>
      Response.json({ porCampos: [], livres: [], permite: { ligar: false } }),
    [`GET /api/ativos/${ID}/historico`]: () => Response.json({ itens: [], proximo: null }),
    'GET /api/tipos-de-ativo': () =>
      Response.json({
        tipos: [
          {
            id: 'impressora',
            nome: 'Impressora',
            icone: 'impressora',
            capacidades: [],
            configuracaoDasCapacidades: {},
            campos: [],
            situacao: 'ativo',
            permite: { editar: false },
          },
        ],
        permite: { cadastrar: false },
      }),
    'GET /api/campos': () => Response.json({ campos: [], permite: { cadastrar: false } }),
    'GET /api/alertas': (pedido) => {
      pedidosDosAlertas.push(new URL(pedido.url).searchParams);
      return Response.json({ itens: alertas, total: alertas.length, proximo: null });
    },
    [`GET /api/ativos/${ID}/silencio`]: () =>
      Response.json({ silencio, permite: { ver: true, tratar } }),
  };
  return { servidor, pedidosDosAlertas };
}

function abrir(servidor: ServidorDeTeste, permissoes: PermissaoDaSessao[]) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [`/ativos/${ID}`] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={criarCanalDeEventos()}
    />,
  );
  return roteador;
}

const bloco = () => screen.findByRole('region', { name: 'Alertas' });

describe('o bloco Alertas na ficha do ativo', () => {
  it('mostra os alertas abertos do ativo, com as ações, e leva aos resolvidos', async () => {
    const { servidor, pedidosDosAlertas } = servidorDaFicha({ alertas: [TONER] });
    const roteador = abrir(servidor, TRATA);
    const alertas = await bloco();
    expect(await within(alertas).findByText('Toner preto em 8%')).toBeTruthy();
    expect(within(alertas).getByText('Crítico')).toBeTruthy();
    expect(within(alertas).getByText('32 min')).toBeTruthy();
    expect(within(alertas).getByText('Aberto')).toBeTruthy();
    expect(within(alertas).getByRole('button', { name: 'Reconhecer' })).toBeTruthy();
    expect(within(alertas).getByRole('button', { name: 'Adiar' })).toBeTruthy();
    expect(within(alertas).getByRole('button', { name: 'Silenciar alertas' })).toBeTruthy();
    expect(pedidosDosAlertas.at(-1)?.get('ativo')).toBe(ID);
    fireEvent.click(within(alertas).getByRole('link', { name: 'Ver os resolvidos' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/alertas/resolvidos'));
    expect(roteador.state.location.search).toMatchObject({
      ativo: ID,
      nomeDoAtivo: 'Impressora do RH',
    });
  });

  it('sem alertas abertos, diz que nenhum está aberto', async () => {
    const { servidor } = servidorDaFicha();
    abrir(servidor, TRATA);
    expect(await within(await bloco()).findByText('Nenhum alerta aberto.')).toBeTruthy();
  });

  it('silencia até alguém retomar, com o motivo, e o retorno', async () => {
    const { servidor } = servidorDaFicha();
    let corpo: unknown;
    servidor[`PUT /api/ativos/${ID}/silencio`] = async (pedido) => {
      corpo = await pedido.json();
      return Response.json({
        silencio: { ate: null, motivo: 'Impressora fiscal', nome: 'Ana Souza', em: antes(0) },
        permite: { ver: true, tratar: true },
      });
    };
    abrir(servidor, TRATA);
    fireEvent.click(
      await within(await bloco()).findByRole('button', { name: 'Silenciar alertas' }),
    );
    const dialogo = await screen.findByRole('dialog', { name: /Silenciar os alertas/ });
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Até alguém retomar' }));
    fireEvent.change(within(dialogo).getByRole('textbox', { name: /^Motivo/ }), {
      target: { value: 'Impressora fiscal' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Silenciar' }));
    expect(await screen.findByText('Alertas silenciados.')).toBeTruthy();
    expect(corpo).toEqual({ ate: null, motivo: 'Impressora fiscal' });
  });

  it('com o silêncio, mostra até quando e o motivo, e retoma', async () => {
    const { servidor } = servidorDaFicha({
      silencio: {
        ate: '2026-10-20T21:00:00.000Z',
        motivo: 'Em manutenção',
        nome: 'Ana Souza',
        em: antes(60),
      },
    });
    const retomada = vi.fn(() =>
      Response.json({ silencio: null, permite: { ver: true, tratar: true } }),
    );
    servidor[`DELETE /api/ativos/${ID}/silencio`] = retomada;
    abrir(servidor, TRATA);
    const alertas = await bloco();
    expect(
      await within(alertas).findByText(/^Alertas silenciados até \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/),
    ).toBeTruthy();
    expect(within(alertas).getByText('Em manutenção')).toBeTruthy();
    fireEvent.click(within(alertas).getByRole('button', { name: 'Retomar alertas' }));
    expect(await screen.findByText('Alertas retomados.')).toBeTruthy();
    expect(retomada).toHaveBeenCalledOnce();
  });

  it('o silêncio até alguém retomar diz isso', async () => {
    const { servidor } = servidorDaFicha({
      silencio: { ate: null, motivo: null, nome: 'Ana Souza', em: antes(60) },
    });
    abrir(servidor, TRATA);
    expect(
      await within(await bloco()).findByText('Alertas silenciados até alguém retomar'),
    ).toBeTruthy();
  });

  it('quem só vê não trata nem silencia', async () => {
    const { servidor } = servidorDaFicha({
      alertas: [{ ...TONER, permite: { tratar: false } }],
      tratar: false,
    });
    abrir(servidor, VE);
    const alertas = await bloco();
    expect(await within(alertas).findByText('Toner preto em 8%')).toBeTruthy();
    expect(within(alertas).queryByRole('button', { name: 'Reconhecer' })).toBeNull();
    expect(within(alertas).queryByRole('button', { name: 'Silenciar alertas' })).toBeNull();
  });

  it('sem os alertas no local do ativo, o bloco não aparece', async () => {
    const { servidor } = servidorDaFicha();
    servidor[`GET /api/ativos/${ID}/silencio`] = () =>
      Response.json({ silencio: null, permite: { ver: false, tratar: false } });
    abrir(servidor, TRATA);
    await screen.findByRole('heading', { level: 1, name: /Impressora do RH/ });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Alertas' })).toBeNull());
  });

  it('não aparece para quem não vê os alertas', async () => {
    const { servidor } = servidorDaFicha();
    abrir(servidor, naOrganizacao('ativos.ver'));
    await screen.findByRole('heading', { level: 1, name: /Impressora do RH/ });
    expect(screen.queryByRole('region', { name: 'Alertas' })).toBeNull();
  });
});
