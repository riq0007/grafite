import type { components } from '@grafite/api-client';
import { criarDataHora, filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

// A tela das movimentações (spec modulo-operacao, "Movimentações"; spec estoque, "Contador de
// páginas na saída"; change p4c-estoque, design, decisão 7).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Movimento = components['schemas']['MovimentoDoEstoque'];

const { formatarDataEHora, formatarData, formatarHora, inicioDoDia, fimDoDia } = criarDataHora();

const CF258A = {
  id: 'cf258a',
  codigo: 'CF258A',
  nome: 'HP 58A',
  tipo: 'toner',
  cor: 'preto',
  situacao: 'ativo',
  abrir: true,
} as const;
const ALMOXARIFADO = { id: 'almoxarifado', caminho: 'Jundiaí › Almoxarifado' };
const EXPEDICAO = { id: 'expedicao', caminho: 'Jundiaí › Expedição' };

const movimento = (id: string, extras: Partial<Movimento>): Movimento => ({
  id,
  tipo: 'entrada',
  consumivel: CF258A,
  quantidade: 1,
  origem: null,
  destino: null,
  fornecedor: null,
  notaFiscal: null,
  ativo: null,
  contador: null,
  motivo: null,
  observacao: null,
  lancadoPor: { id: 'carla', nome: 'Carla Dias' },
  momento: '2026-10-21T14:40:00.000Z',
  ...extras,
});

const LIDO_EM = '2026-10-21T17:32:00.000Z';
const ENTRADA = movimento('m1', {
  tipo: 'entrada',
  quantidade: 10,
  destino: ALMOXARIFADO,
  fornecedor: { id: 'hp', nome: 'HP Brasil', abrir: false },
  notaFiscal: '12345',
  momento: '2026-10-20T13:00:00.000Z',
});
const SAIDA = movimento('m2', {
  tipo: 'saida',
  origem: ALMOXARIFADO,
  ativo: { id: 'pat412', rotulo: 'HP LaserJet M404', patrimonio: 'PAT-00412', abrir: true },
  contador: { paginas: 45_210, lidoEm: LIDO_EM },
  observacao: 'Troca do toner',
});
const AJUSTE = movimento('m3', {
  tipo: 'ajuste',
  origem: EXPEDICAO,
  motivo: 'inventario',
  momento: '2026-10-19T10:00:00.000Z',
});

/** As movimentações no servidor do teste: filtra o tipo, o fornecedor e o ativo como a API. */
function servidorDasMovimentacoes(inicial: Movimento[], { porPagina = 50 } = {}) {
  const pedidos: URLSearchParams[] = [];
  const lista = vi.fn((pedido: Request) => {
    const parametros = new URL(pedido.url).searchParams;
    pedidos.push(parametros);
    const tipo = parametros.get('tipo');
    const fornecedor = parametros.get('fornecedor');
    const ativo = parametros.get('ativo');
    const todos = inicial.filter(
      (atual) =>
        (!tipo || atual.tipo === tipo) &&
        (!fornecedor || atual.fornecedor?.id === fornecedor) &&
        (!ativo || atual.ativo?.id === ativo),
    );
    const inicio = Number(parametros.get('cursor') ?? 0);
    return Response.json({
      itens: todos.slice(inicio, inicio + porPagina),
      total: todos.length,
      proximo: inicio + porPagina < todos.length ? String(inicio + porPagina) : null,
    });
  });
  const servidor: ServidorDeTeste = {
    'GET /api/estoque/movimentos': lista,
    'GET /api/locais': () => Response.json({ locais: [] }),
    'GET /api/fornecedores/escolha': () =>
      Response.json({ fornecedores: [{ id: 'hp', nome: 'HP Brasil', cnpj: null }] }),
    'GET /api/consumiveis/escolha': () => Response.json({ consumiveis: [] }),
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  };
  return { servidor, lista, pedidos };
}

function abrir(endereco: string, servidor: ServidorDeTeste, permissoes: PermissaoDaSessao[]) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const VE = naOrganizacao('estoque.ver', 'consumiveis.ver');
const tabela = () => screen.findByRole('grid', { name: 'Movimentações' });
const linhas = async () =>
  within(await tabela())
    .getAllByRole('row')
    .slice(1);

describe('a tela das movimentações', () => {
  it('mostra o momento, o tipo, o consumível, a quantidade, os locais, o detalhe, a observação e quem lançou', async () => {
    const { servidor } = servidorDasMovimentacoes([SAIDA, ENTRADA, AJUSTE]);
    abrir('/operacao/movimentacoes', servidor, VE);
    const cabecalhos = within(await tabela())
      .getAllByRole('columnheader')
      .map((coluna) => coluna.textContent);
    expect(cabecalhos).toEqual([
      'Momento',
      'Tipo',
      'Consumível',
      'Quantidade',
      'Origem',
      'Destino',
      'Detalhe',
      'Observação',
      'Lançado por',
    ]);
    const [saida, entrada, ajuste] = (await linhas()).map((linha) => linha.textContent ?? '');
    expect(saida).toContain(formatarDataEHora(new Date(SAIDA.momento)));
    expect(saida).toContain('Saída');
    expect(saida).toContain('HP LaserJet M404 · PAT-00412');
    const lido = new Date(LIDO_EM);
    expect(saida).toContain(
      `Total de páginas: 45.210, lido em ${formatarData(lido).slice(0, 5)} ${formatarHora(lido)}`,
    );
    expect(saida).toContain('Troca do toner');
    expect(saida).toContain('Carla Dias');
    expect(entrada).toContain('HP Brasil · nota 12345');
    expect(entrada).toContain('Jundiaí › Almoxarifado');
    expect(ajuste).toContain('Inventário');
  });

  it('Toners da PAT-00412: o ativo do endereço filtra as saídas para ele, com o contador de cada uma', async () => {
    const { servidor, pedidos } = servidorDasMovimentacoes([SAIDA, ENTRADA, AJUSTE]);
    abrir('/operacao/movimentacoes?ativo=pat412', servidor, VE);
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect(pedidos[0]?.get('ativo')).toBe('pat412');
    const filtros = screen.getByRole('group', { name: 'Filtros ativos' });
    expect(within(filtros).getByText(/PAT-00412/)).toBeTruthy();
    expect((await linhas())[0]?.textContent).toContain('Total de páginas: 45.210');
  });

  it('Entradas da HP Brasil: filtra o tipo e o fornecedor, no endereço, com a nota de cada uma', async () => {
    const { servidor, pedidos } = servidorDasMovimentacoes([SAIDA, ENTRADA, AJUSTE]);
    const roteador = abrir('/operacao/movimentacoes', servidor, VE);
    await tabela();
    fireEvent.click(screen.getByRole('button', { name: /Tipo/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Entrada' }));
    const fornecedor = screen.getByRole('combobox', { name: 'Fornecedor' });
    fornecedor.focus();
    fireEvent.change(fornecedor, { target: { value: 'hp' } });
    fireEvent.click(await screen.findByRole('option', { name: 'HP Brasil' }));
    await waitFor(() =>
      expect(roteador.state.location.search).toMatchObject({ tipo: 'entrada', fornecedor: 'hp' }),
    );
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect((await linhas())[0]?.textContent).toContain('nota 12345');
    expect(pedidos.at(-1)?.get('tipo')).toBe('entrada');
    expect(pedidos.at(-1)?.get('fornecedor')).toBe('hp');
  });

  it('filtra pelo período, do começo do primeiro dia ao fim do último, no fuso escolhido', async () => {
    const { servidor, pedidos } = servidorDasMovimentacoes([SAIDA]);
    abrir('/operacao/movimentacoes?de=2026-10-01&ate=2026-10-21', servidor, VE);
    await tabela();
    expect(pedidos[0]?.get('de')).toBe(inicioDoDia('2026-10-01').toISOString());
    expect(pedidos[0]?.get('ate')).toBe(fimDoDia('2026-10-21').toISOString());
    const filtros = screen.getByRole('group', { name: 'Filtros ativos' });
    expect(within(filtros).getByText(/01\/10\/2026 a 21\/10\/2026/)).toBeTruthy();
  });

  it('sem nenhuma movimentação no filtro, diz "Nenhuma movimentação encontrada."', async () => {
    const { servidor } = servidorDasMovimentacoes([]);
    abrir('/operacao/movimentacoes?tipo=ajuste', servidor, VE);
    expect(await screen.findByText('Nenhuma movimentação encontrada.')).toBeTruthy();
  });

  it('carrega mais movimentações pelo cursor', async () => {
    const { servidor } = servidorDasMovimentacoes([SAIDA, ENTRADA, AJUSTE], { porPagina: 2 });
    abrir('/operacao/movimentacoes', servidor, VE);
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(3));
  });
});
