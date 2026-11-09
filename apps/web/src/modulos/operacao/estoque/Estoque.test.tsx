import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

// A tela do estoque (spec modulo-operacao, "Tela do estoque" e "Operação atualizada pelos eventos";
// change p4c-estoque, design, decisão 7).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Saldo = components['schemas']['SaldoDoEstoque'];

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

const situacaoDe = (saldo: number, minimo: number): Saldo['situacao'] =>
  saldo === 0 ? 'sem-estoque' : saldo < minimo ? 'abaixo-do-minimo' : 'em-estoque';

const saldo = (
  id: string,
  local: Saldo['local'],
  quantidade: number,
  minimo = 0,
  extras: Partial<Saldo> = {},
): Saldo => ({
  id,
  consumivel: CF258A,
  local,
  saldo: quantidade,
  minimo,
  situacao: situacaoDe(quantidade, minimo),
  abaixoDesde: minimo > 0 && quantidade < minimo ? '2026-10-20T09:00:00.000Z' : null,
  permite: { movimentar: true },
  ...extras,
});

const VE = naOrganizacao('estoque.ver', 'consumiveis.ver');
const MOVIMENTA = naOrganizacao('estoque.ver', 'estoque.movimentar', 'consumiveis.ver');

/** Os saldos no servidor do teste: filtra a situação como a API e pagina de dois em dois. */
function servidorDoEstoque(inicial: Saldo[], { movimentar = true, porPagina = 50 } = {}) {
  const estado = { saldos: [...inicial] };
  const pedidos: URLSearchParams[] = [];
  const lista = vi.fn((pedido: Request) => {
    const parametros = new URL(pedido.url).searchParams;
    pedidos.push(parametros);
    const situacao = parametros.get('situacao');
    const todos = estado.saldos.filter(
      (atual) =>
        !situacao ||
        (situacao === 'abaixo-do-minimo'
          ? atual.abaixoDesde !== null
          : situacao === atual.situacao),
    );
    const inicio = Number(parametros.get('cursor') ?? 0);
    return Response.json({
      itens: todos.slice(inicio, inicio + porPagina),
      total: todos.length,
      proximo: inicio + porPagina < todos.length ? String(inicio + porPagina) : null,
      permite: { movimentar },
    });
  });
  const servidor: ServidorDeTeste = {
    'GET /api/estoque/saldos': lista,
    'GET /api/locais': () => Response.json({ locais: [] }),
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  };
  return { servidor, estado, lista, pedidos };
}

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes: PermissaoDaSessao[] = MOVIMENTA,
  canal: CanalDeEventos = criarCanalDeEventos(),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
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

const tabela = () => screen.findByRole('grid', { name: 'Estoque' });
const linhas = async () =>
  within(await tabela())
    .getAllByRole('row')
    .slice(1);
const textoDasLinhas = async () => (await linhas()).map((linha) => linha.textContent);
const ACOES = ['Entrada', 'Saída', 'Transferência', 'Ajuste'];

describe('a tela do estoque', () => {
  it('mostra o consumível, o local, o saldo, o mínimo e a situação em texto', async () => {
    const { servidor } = servidorDoEstoque([
      saldo('s1', ALMOXARIFADO, 7, 5),
      saldo('s2', EXPEDICAO, 2),
    ]);
    abrir('/operacao/estoque', servidor);
    const cabecalhos = within(await tabela())
      .getAllByRole('columnheader')
      .map((coluna) => coluna.textContent);
    expect(cabecalhos.slice(0, 5)).toEqual(['Consumível', 'Local', 'Saldo', 'Mínimo', 'Situação']);
    const [primeira, segunda] = await linhas();
    expect(primeira?.textContent).toContain('CF258A');
    expect(primeira?.textContent).toContain('HP 58A · Toner, Preto');
    expect(primeira?.textContent).toContain('Jundiaí › Almoxarifado');
    expect(primeira?.textContent).toContain('Em estoque');
    expect(segunda?.textContent).toContain('Sem mínimo');
    expect(screen.getByText('2 saldos')).toBeTruthy();
    const link = within(primeira as HTMLElement).getByRole('link', { name: 'CF258A' });
    expect(link.getAttribute('href')).toBe('/operacao/consumiveis/cf258a');
  });

  it('Toners abaixo do mínimo: o filtro traz os abaixo e os sem estoque, e diz o filtro em texto', async () => {
    const { servidor, pedidos } = servidorDoEstoque([
      saldo('s1', ALMOXARIFADO, 2, 5),
      saldo('s2', EXPEDICAO, 0, 2),
      saldo('s3', { id: 'cps', caminho: 'Campinas › Almoxarifado' }, 9, 5),
    ]);
    abrir('/operacao/estoque', servidor);
    await tabela();
    fireEvent.click(screen.getByRole('button', { name: /Situação/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Abaixo do mínimo' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    const textos = await textoDasLinhas();
    expect(textos[0]).toContain('Abaixo do mínimo');
    expect(textos[1]).toContain('Sem estoque');
    expect(pedidos.at(-1)?.get('situacao')).toBe('abaixo-do-minimo');
    const filtros = screen.getByRole('group', { name: 'Filtros ativos' });
    expect(within(filtros).getByText(/Abaixo do mínimo/)).toBeTruthy();
  });

  it('busca pelo código e pelo nome, e filtra pelo consumível do endereço', async () => {
    const { servidor, pedidos } = servidorDoEstoque([saldo('s1', ALMOXARIFADO, 2)]);
    abrir('/operacao/estoque?consumivel=cf258a&local=almoxarifado', servidor);
    await tabela();
    expect(pedidos[0]?.get('consumivel')).toBe('cf258a');
    expect(pedidos[0]?.get('local')).toBe('almoxarifado');
    const filtros = screen.getByRole('group', { name: 'Filtros ativos' });
    expect(within(filtros).getByText(/CF258A/)).toBeTruthy();
  });

  it('Primeira entrada: sem nenhum saldo, diz que o estoque está vazio e oferece "Entrada"', async () => {
    const { servidor } = servidorDoEstoque([]);
    const roteador = abrir('/operacao/estoque', servidor);
    expect(await screen.findByText('Nenhum consumível no estoque ainda.')).toBeTruthy();
    const [entrada] = screen.getAllByRole('button', { name: 'Entrada' });
    if (entrada) fireEvent.click(entrada);
    await waitFor(() =>
      expect(roteador.state.location.search).toMatchObject({ lancar: 'entrada' }),
    );
  });

  it('Quem só vê o estoque: os saldos, sem as ações de lançar', async () => {
    const { servidor } = servidorDoEstoque(
      [saldo('s1', ALMOXARIFADO, 7, 5, { permite: { movimentar: false } })],
      { movimentar: false },
    );
    abrir('/operacao/estoque', servidor, VE);
    await tabela();
    for (const acao of [...ACOES, 'Definir mínimo']) {
      expect(screen.queryByRole('button', { name: acao })).toBeNull();
    }
  });

  it('quem movimenta lança pelas ações, que abrem a gaveta pelo endereço', async () => {
    const { servidor } = servidorDoEstoque([saldo('s1', ALMOXARIFADO, 7)]);
    const roteador = abrir('/operacao/estoque', servidor);
    await tabela();
    for (const acao of ACOES) expect(screen.getByRole('button', { name: acao })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Saída' }));
    await waitFor(() => expect(roteador.state.location.search).toMatchObject({ lancar: 'saida' }));
  });

  it('carrega mais saldos pelo cursor', async () => {
    const { servidor } = servidorDoEstoque(
      [saldo('s1', ALMOXARIFADO, 1), saldo('s2', EXPEDICAO, 2), saldo('s3', ALMOXARIFADO, 3)],
      { porPagina: 2 },
    );
    abrir('/operacao/estoque', servidor);
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(3));
  });

  it('Saída lançada com o estoque aberto: o evento relê os saldos', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDoEstoque([saldo('s1', ALMOXARIFADO, 7)]);
    abrir('/operacao/estoque', servidor, VE, canal);
    await waitFor(async () => expect((await textoDasLinhas())[0]).toContain('7'));
    estado.saldos = [saldo('s1', ALMOXARIFADO, 6)];
    canal.publicar({
      id: 'e1',
      tipo: 'estoque.mudou',
      momento: '2026-10-21T12:00:00.000Z',
      alvo: { tipo: 'consumivel', id: 'cf258a' },
    });
    await waitFor(async () => expect((await textoDasLinhas())[0]).toContain('6'));
  });

  it('sem a permissão, diz que a conta não tem acesso ao estoque', async () => {
    const { servidor, lista } = servidorDoEstoque([]);
    abrir('/operacao/estoque', servidor, naOrganizacao('consumiveis.ver'));
    expect(await screen.findByText('Você não tem acesso ao estoque.')).toBeTruthy();
    expect(lista).not.toHaveBeenCalled();
  });
});
