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
import {
  conserto,
  EXPEDICAO,
  type SolicitacaoDeTeste,
  servidorDasSolicitacoes,
  toner,
} from '../../../teste/solicitacoes.ts';

// As solicitações na ficha do ativo (spec cadastro-de-ativos, "Solicitações na ficha do ativo";
// spec modulo-operacao, "Operação atualizada pelos eventos"; change p4d-solicitacoes, design,
// decisão 8): a seção da relação do Operação com o alvo `ativo`, com "Nova solicitação".

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Ficha = components['schemas']['FichaDoAtivo'];

const ID = 'pat00412';

const fichaDo = (rotulo: string, patrimonio: string, tipo: Ficha['tipo']): Ficha => ({
  id: ID,
  rotulo,
  tipo,
  modelo: null,
  imagem: null,
  patrimonio,
  serie: null,
  hostname: null,
  local: null,
  responsavel: null,
  uso: 'em-uso',
  situacao: 'ativo',
  criadoEm: '2026-10-09T12:00:00.000Z',
  atualizadoEm: '2026-10-09T12:00:00.000Z',
  valores: { 'ativo.patrimonio': patrimonio, 'ativo.uso': 'em-uso' },
  estado: {},
  referencias: { pessoas: {}, locais: {}, ativos: {}, fornecedores: {}, arquivos: {} },
  permite: { editar: false, verRestritos: false, editarRestritos: false, verResponsavel: false },
});

const IMPRESSORA = { id: 'impressora', nome: 'Impressora', icone: 'impressora' } as const;
const NOTEBOOK = { id: 'notebook', nome: 'Notebook', icone: 'notebook' } as const;

/** A ficha do ativo com as solicitações dele, e o que o Toner e o Conserto pedem ao abrir. */
function servidorDaFicha({
  ficha = fichaDo('HP LaserJet M404', 'PAT-00412', IMPRESSORA),
  pendentes = [],
  encerradas = [],
  usaConsumiveis = true,
}: {
  ficha?: Ficha;
  pendentes?: SolicitacaoDeTeste[];
  encerradas?: SolicitacaoDeTeste[];
  usaConsumiveis?: boolean;
} = {}) {
  const estado = { pendentes, encerradas };
  const { servidor: daLista } = servidorDasSolicitacoes([]);
  const servidor: ServidorDeTeste = {
    ...daLista,
    [`GET /api/ativos/${ID}`]: () => Response.json(ficha),
    [`GET /api/ativos/${ID}/ligados`]: () =>
      Response.json({ porCampos: [], livres: [], permite: { ligar: false } }),
    [`GET /api/ativos/${ID}/historico`]: () => Response.json({ itens: [], proximo: null }),
    [`GET /api/ativos/${ID}/resumo`]: () =>
      Response.json({
        id: ID,
        rotulo: ficha.rotulo,
        patrimonio: ficha.patrimonio,
        local: EXPEDICAO,
      }),
    'GET /api/tipos-de-ativo': () =>
      Response.json({
        tipos: [IMPRESSORA, NOTEBOOK].map((tipo) => ({
          ...tipo,
          capacidades: [],
          configuracaoDasCapacidades: {},
          campos: [],
          situacao: 'ativo',
          permite: { editar: false },
        })),
        permite: { cadastrar: false },
      }),
    'GET /api/campos': () => Response.json({ campos: [], permite: { cadastrar: false } }),
    [`GET /api/ativos/${ID}/solicitacoes`]: () => Response.json({ ...estado, usaConsumiveis }),
    [`GET /api/solicitacoes/impressoras/${ID}`]: () =>
      Response.json({
        ativo: { id: ID, rotulo: 'HP LaserJet M404', patrimonio: 'PAT-00412', abrir: true },
        local: EXPEDICAO,
        contador: { paginas: 48210, lidoEm: '2026-10-21T17:02:00.000Z' },
        cores: [
          { cor: 'preto', sugerido: null, compativeis: [] },
          { cor: 'ciano', sugerido: null, compativeis: [] },
          { cor: 'magenta', sugerido: null, compativeis: [] },
          { cor: 'amarelo', sugerido: null, compativeis: [] },
          { cor: 'colorido', sugerido: null, compativeis: [] },
        ],
      }),
    'GET /api/solicitacoes/impressoras': () => Response.json({ itens: [] }),
    'GET /api/pessoas/nomes': () => Response.json({ pessoas: [], total: 0 }),
  };
  return { servidor, estado };
}

const ATENDE = naOrganizacao('ativos.ver', 'solicitacoes.ver', 'solicitacoes.atender');
const VE = naOrganizacao('ativos.ver', 'solicitacoes.ver');

function abrir(
  servidor: ServidorDeTeste,
  permissoes: PermissaoDaSessao[],
  canal: CanalDeEventos = criarCanalDeEventos(),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [`/ativos/${ID}`] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return roteador;
}

const secao = () => screen.findByRole('region', { name: 'Solicitações' });

describe('as solicitações na ficha do ativo', () => {
  it('Ativo sem solicitações: a seção diz que não há nenhuma', async () => {
    const { servidor } = servidorDaFicha();
    abrir(servidor, VE);
    expect(await within(await secao()).findByText('Nenhuma solicitação deste ativo.')).toBeTruthy();
    expect(within(await secao()).queryByRole('link', { name: 'Nova solicitação' })).toBeNull();
  });

  it('as pendentes e as encerradas, cada uma levando à ficha dela', async () => {
    const { servidor } = servidorDaFicha({
      pendentes: [toner(48, { situacao: 'em-atendimento' })],
      encerradas: [toner(41, { situacao: 'concluida' })],
    });
    abrir(servidor, VE);
    const solicitacoes = await secao();
    const pendente = await within(solicitacoes).findByRole('link', { name: 'Solicitação 48' });
    expect(pendente.getAttribute('href')).toBe('/operacao/solicitacoes/48');
    const itens = within(solicitacoes)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(itens[0]).toContain('Toner');
    expect(itens[0]).toContain('Em atendimento');
    expect(itens[0]).toContain('Há 3 d');
    expect(itens[1]).toContain('Concluída');
  });

  it('Toner pela ficha da impressora: "Nova solicitação" abre o Toner com ela e o total de páginas', async () => {
    const { servidor } = servidorDaFicha();
    const roteador = abrir(servidor, ATENDE);
    const nova = await within(await secao()).findByRole('link', { name: 'Nova solicitação' });
    expect(nova.getAttribute('href')).toBe(`/operacao/solicitacoes?nova=toner&ativo=${ID}`);
    fireEvent.click(nova);
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/solicitacoes'));
    const gaveta = await screen.findByRole('dialog', { name: 'Nova solicitação' });
    const impressora = await within(gaveta).findByRole('group', {
      name: 'HP LaserJet M404 · PAT-00412',
    });
    expect(await within(impressora).findByText(/Total de páginas: 48\.210/)).toBeTruthy();
  });

  it('Conserto pela ficha do notebook: "Nova solicitação" abre o Conserto com ele', async () => {
    const { servidor } = servidorDaFicha({
      ficha: fichaDo('Dell Latitude 5440', 'NB-0031', NOTEBOOK),
      usaConsumiveis: false,
    });
    abrir(servidor, ATENDE);
    const nova = await within(await secao()).findByRole('link', { name: 'Nova solicitação' });
    expect(nova.getAttribute('href')).toBe(`/operacao/solicitacoes?nova=conserto&ativo=${ID}`);
    fireEvent.click(nova);
    const gaveta = await screen.findByRole('dialog', { name: 'Nova solicitação' });
    await waitFor(() =>
      expect(
        (within(gaveta).getByRole('combobox', { name: 'Ativo' }) as HTMLInputElement).value,
      ).toBe('Dell Latitude 5440 · NB-0031'),
    );
  });

  it('Solicitação registrada com a ficha aberta: o evento relê a seção', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDaFicha();
    abrir(servidor, VE, canal);
    await within(await secao()).findByText('Nenhuma solicitação deste ativo.');
    estado.pendentes = [conserto(49)];
    canal.publicar({
      id: 'e1',
      tipo: 'solicitacoes.mudaram',
      momento: '2026-10-22T10:00:00.000Z',
      alvo: { tipo: 'solicitacao', id: 's49' },
    });
    expect(await within(await secao()).findByRole('link', { name: 'Solicitação 49' })).toBeTruthy();
  });

  it('quem não vê as solicitações não tem a seção', async () => {
    const { servidor } = servidorDaFicha();
    abrir(servidor, naOrganizacao('ativos.ver'));
    await screen.findByRole('heading', { level: 1, name: /HP LaserJet M404/ });
    expect(screen.queryByRole('region', { name: 'Solicitações' })).toBeNull();
  });
});
