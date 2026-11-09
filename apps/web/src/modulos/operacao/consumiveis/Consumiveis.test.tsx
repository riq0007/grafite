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

// A lista dos consumíveis do módulo Operação (spec modulo-operacao, "Operação no dock", "Lista dos
// consumíveis" e "Operação atualizada pelos eventos"; change p4b-consumiveis, design, decisões 6
// e 7).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type ConsumivelNaLista = components['schemas']['ConsumivelNaLista'];

const consumivel = (
  id: string,
  codigo: string,
  extras: Partial<ConsumivelNaLista> = {},
): ConsumivelNaLista => ({
  id,
  codigo,
  nome: null,
  tipo: 'toner',
  cor: null,
  rendimento: null,
  situacao: 'ativo',
  criadoEm: '2026-10-19T12:00:00.000Z',
  atualizadoEm: '2026-10-19T12:00:00.000Z',
  modelos: 0,
  ...extras,
});

const CF258A = consumivel('cf258a', 'CF258A', {
  nome: 'HP 58A',
  cor: 'preto',
  rendimento: 3000,
  modelos: 2,
});
const TN2370 = consumivel('tn2370', 'TN-2370', { nome: 'Brother TN-2370', modelos: 1 });
const CF411A = consumivel('cf411a', 'CF411A', { cor: 'ciano' });
const DR2340 = consumivel('dr2340', 'DR-2340', { tipo: 'cilindro', situacao: 'inativo' });

const VE = naOrganizacao('consumiveis.ver');

/** O código como a API o compara: sem maiúsculas, espaços e hífens. */
const normalizado = (codigo: string) => codigo.toUpperCase().replace(/[\s-]/g, '');

/** Os consumíveis no servidor do teste: a lista filtra como a API e pagina de dois em dois. */
function servidorDosConsumiveis(inicial: ConsumivelNaLista[], { porPagina = 50 } = {}) {
  const estado = { consumiveis: [...inicial] };
  const pedidos: URLSearchParams[] = [];
  const lista = vi.fn((pedido: Request) => {
    const parametros = new URL(pedido.url).searchParams;
    pedidos.push(parametros);
    const busca = parametros.get('busca') ?? '';
    const situacao = parametros.get('situacao') ?? 'ativos';
    const tipo = parametros.get('tipo');
    const cor = parametros.get('cor');
    const todos = estado.consumiveis.filter(
      (atual) =>
        (situacao === 'todos' || (situacao === 'ativos') === (atual.situacao === 'ativo')) &&
        (!tipo || atual.tipo === tipo) &&
        (!cor || atual.cor === cor) &&
        (busca === '' ||
          normalizado(atual.codigo).includes(normalizado(busca)) ||
          (atual.nome ?? '').toLowerCase().includes(busca.toLowerCase())),
    );
    const inicio = Number(parametros.get('cursor') ?? 0);
    const itens = todos.slice(inicio, inicio + porPagina);
    return Response.json({
      itens,
      total: todos.length,
      proximo: inicio + porPagina < todos.length ? String(inicio + porPagina) : null,
      permite: { cadastrar: false },
    });
  });
  const servidor: ServidorDeTeste = {
    'GET /api/consumiveis': lista,
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  };
  return { servidor, estado, lista, pedidos };
}

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes: PermissaoDaSessao[] = VE,
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

const tabela = () => screen.findByRole('grid', { name: 'Consumíveis' });
const textoDasLinhas = async () =>
  within(await tabela())
    .getAllByRole('row')
    .slice(1)
    .map((linha) => linha.textContent);

describe('a lista dos consumíveis', () => {
  it('Conta sem a permissão: o endereço diz que ela não tem acesso, sem pedir a lista', async () => {
    const { servidor, lista } = servidorDosConsumiveis([CF258A]);
    abrir('/operacao/consumiveis', servidor, naOrganizacao('ativos.ver'));
    expect(await screen.findByText('Você não tem acesso à Operação.')).toBeTruthy();
    expect(await screen.findByText('Peça acesso a Ana Souza.')).toBeTruthy();
    expect(lista).not.toHaveBeenCalled();
  });

  it('o Início do Operação leva à lista dos consumíveis pelo atalho', async () => {
    const { servidor } = servidorDosConsumiveis([CF258A]);
    const roteador = abrir('/operacao', servidor);
    const atalhos = await screen.findByRole('navigation', { name: 'Listas do Operação' });
    fireEvent.click(within(atalhos).getByRole('link', { name: /^Consumíveis/ }));
    await tabela();
    expect(roteador.state.location.pathname).toBe('/operacao/consumiveis');
  });

  it('mostra os ativos pelo código, com o nome, o tipo, a cor, o rendimento, os modelos e a situação', async () => {
    const { servidor, pedidos } = servidorDosConsumiveis([CF258A, TN2370, DR2340]);
    abrir('/operacao/consumiveis', servidor);
    expect(
      within(await tabela())
        .getAllByRole('columnheader')
        .map((coluna) => coluna.textContent),
    ).toEqual(['Código', 'Nome', 'Tipo', 'Cor', 'Rendimento', 'Modelos', 'Situação']);
    expect(await textoDasLinhas()).toEqual([
      'CF258AHP 58ATonerPreto3.000 páginas2 modelosAtivo',
      'TN-2370Brother TN-2370Toner——1 modeloAtivo',
    ]);
    expect(screen.getByText('2 consumíveis')).toBeTruthy();
    expect(pedidos.at(-1)?.get('situacao')).toBe('ativos');
  });

  it('Busca pelo código sem o hífen: a busca vai ao servidor e fica no endereço', async () => {
    const { servidor, pedidos } = servidorDosConsumiveis([CF258A, TN2370]);
    const roteador = abrir('/operacao/consumiveis', servidor);
    await tabela();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar consumíveis' }), {
      target: { value: 'tn2370' },
    });
    await waitFor(() => expect(pedidos.at(-1)?.get('busca')).toBe('tn2370'));
    await waitFor(async () =>
      expect(await textoDasLinhas()).toEqual(['TN-2370Brother TN-2370Toner——1 modeloAtivo']),
    );
    expect(roteador.state.location.search).toMatchObject({ busca: 'tn2370' });
  });

  it('Filtro da cor: filtra pelo tipo, pela cor e pela situação, e diz cada filtro em texto', async () => {
    const { servidor, pedidos } = servidorDosConsumiveis([CF258A, CF411A, DR2340]);
    const roteador = abrir('/operacao/consumiveis', servidor);
    await tabela();
    fireEvent.click(screen.getByRole('button', { name: /Cor/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Ciano' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('cor')).toBe('ciano'));
    await waitFor(async () => expect(await textoDasLinhas()).toEqual(['CF411A—TonerCiano——Ativo']));
    const filtros = screen.getByRole('group', { name: 'Filtros ativos' });
    expect(within(filtros).getByText('Cor')).toBeTruthy();
    expect(within(filtros).getByText('Ciano')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tipo/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cilindro' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('tipo')).toBe('cilindro'));
    expect(roteador.state.location.search).toMatchObject({ cor: 'ciano', tipo: 'cilindro' });
    fireEvent.click(screen.getByRole('radio', { name: 'Inativos' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('situacao')).toBe('inativos'));
    expect(await screen.findByText('Nenhum consumível encontrado.')).toBeTruthy();
    const [limpar] = screen.getAllByRole('button', { name: 'Limpar filtros' });
    if (limpar) fireEvent.click(limpar);
    await waitFor(() => expect(pedidos.at(-1)?.get('cor')).toBeNull());
    expect(pedidos.at(-1)?.get('situacao')).toBe('ativos');
  });

  it('Peça no catálogo: o filtro do tipo "Peça" mostra a peça na lista', async () => {
    // Spec consumiveis, "Consumível"; change p4e-ordens-de-servico.
    const FNT65W = consumivel('fnt65w', 'FNT-65W', { nome: 'Fonte 65W', tipo: 'peca' });
    const { servidor, pedidos } = servidorDosConsumiveis([CF258A, FNT65W]);
    abrir('/operacao/consumiveis', servidor);
    await tabela();
    fireEvent.click(screen.getByRole('button', { name: /Tipo/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Peça' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('tipo')).toBe('peca'));
    await waitFor(async () =>
      expect(await textoDasLinhas()).toEqual(['FNT-65WFonte 65WPeça———Ativo']),
    );
  });

  it('carrega mais consumíveis ao fim da lista', async () => {
    const { servidor } = servidorDosConsumiveis([CF258A, TN2370, CF411A], { porPagina: 2 });
    abrir('/operacao/consumiveis', servidor);
    expect(await textoDasLinhas()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(async () => expect(await textoDasLinhas()).toHaveLength(3));
  });

  it('sem nenhum consumível, diz "Nenhum consumível ainda."', async () => {
    const { servidor } = servidorDosConsumiveis([]);
    abrir('/operacao/consumiveis', servidor);
    expect(await screen.findByText('Nenhum consumível ainda.')).toBeTruthy();
  });

  it('Consumível cadastrado com a lista aberta: o evento relê a lista', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDosConsumiveis([CF258A]);
    abrir('/operacao/consumiveis', servidor, VE, canal);
    await screen.findByText('CF258A');
    estado.consumiveis = [CF258A, consumivel('cf258x', 'CF258X')];
    canal.publicar({
      id: 'e1',
      tipo: 'consumiveis.mudaram',
      momento: '2026-10-19T12:00:00.000Z',
      alvo: { tipo: 'consumivel', id: 'cf258x' },
    });
    expect(await screen.findByText('CF258X')).toBeTruthy();
  });
});
