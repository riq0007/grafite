// O estoque em "O que resolver agora" (spec modulo-operacao, "Estoque abaixo do mínimo no Início";
// spec tela-inicial, "Ocorrências dos módulos"; change p4c-estoque, design, decisão 7): a fonte lê
// os consumíveis abaixo do mínimo nos locais que a conta vê e os mostra no lugar do ativo, e o
// evento do estoque a relê.
import type { components } from '@grafite/api-client';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarCliente } from '../../../api/cliente.ts';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import { fonteDoEstoque } from './ocorrencias.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

type Saldo = components['schemas']['SaldoDoEstoque'];

const abaixo = (id: string, local: Saldo['local'], saldo: number, minimo: number): Saldo => ({
  id,
  consumivel: {
    id: 'cf258a',
    codigo: 'CF258A',
    nome: 'HP 58A',
    tipo: 'toner',
    cor: 'preto',
    situacao: 'ativo',
    abrir: true,
  },
  local,
  saldo,
  minimo,
  situacao: saldo === 0 ? 'sem-estoque' : 'abaixo-do-minimo',
  abaixoDesde: '2026-10-20T09:00:00.000Z',
  permite: { movimentar: true },
});

const ACABANDO = abaixo('s1', { id: 'almoxarifado', caminho: 'Jundiaí › Almoxarifado' }, 2, 5);
const ACABOU = abaixo('s2', { id: 'expedicao', caminho: 'Jundiaí › Expedição' }, 0, 2);

/** O cliente da API sobre o servidor do teste, como a tela inicial o passa à fonte. */
function clienteSobre(servidor: ServidorDeTeste) {
  return criarCliente({
    csrf: () => 'csrf-de-teste',
    aoPerderASessao: () => {},
    aoMudarOAcesso: () => {},
    buscar: async (pedido) => {
      const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
      const responder = servidor[caminho];
      if (!responder) throw new Error(`O teste não preparou o servidor para ${caminho}.`);
      return responder(pedido);
    },
  });
}

describe('a fonte do estoque', () => {
  it('Toner acabando: cada par abaixo do mínimo é uma ocorrência de Atenção, com o consumível no lugar do ativo', async () => {
    const api = clienteSobre({
      'GET /api/estoque/abaixo-do-minimo': () => Response.json({ itens: [ACABANDO, ACABOU] }),
    });
    const ocorrencias = await fonteDoEstoque.buscar(new AbortController().signal, {
      api,
      canal: criarCanalDeEventos(),
    });
    expect(ocorrencias).toEqual([
      {
        id: 's1',
        severidade: 'atencao',
        texto: 'CF258A abaixo do mínimo em Jundiaí › Almoxarifado: 2 de 5',
        ativo: { nome: 'CF258A · HP 58A', tipo: 'generico' },
        desde: new Date('2026-10-20T09:00:00.000Z'),
        destino: '/operacao/estoque?consumivel=cf258a&local=almoxarifado',
      },
      {
        id: 's2',
        severidade: 'atencao',
        texto: 'Sem CF258A em Jundiaí › Expedição: mínimo 2',
        ativo: { nome: 'CF258A · HP 58A', tipo: 'generico' },
        desde: new Date('2026-10-20T09:00:00.000Z'),
        destino: '/operacao/estoque?consumivel=cf258a&local=expedicao',
      },
    ]);
  });

  it('avisa a tela inicial quando o estoque muda', () => {
    const canal = criarCanalDeEventos();
    const aoMudar = vi.fn();
    const parar = fonteDoEstoque.assinar?.(aoMudar, { api: clienteSobre({}), canal });
    canal.publicar({ id: 'e1', tipo: 'estoque.mudou', momento: '', alvo: null });
    expect(aoMudar).toHaveBeenCalledOnce();
    parar?.();
    canal.publicar({ id: 'e2', tipo: 'estoque.mudou', momento: '', alvo: null });
    expect(aoMudar).toHaveBeenCalledOnce();
  });
});

describe('o estoque na tela inicial', () => {
  function abrirOInicio(servidor: ServidorDeTeste) {
    noComputador();
    const canal = criarCanalDeEventos();
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }));
    render(
      <App
        roteador={roteador}
        sessao={sessaoAtiva(naOrganizacao('estoque.ver'), servidor)}
        consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
        canal={canal}
      />,
    );
    return { canal, roteador };
  }

  it('Entrada que repõe: a ocorrência sai quando o evento do estoque chega', async () => {
    let itens = [ACABANDO];
    const { canal } = abrirOInicio({
      'GET /api/estoque/abaixo-do-minimo': () => Response.json({ itens }),
    });
    const tabela = await screen.findByRole('grid', { name: 'Ocorrências abertas' });
    expect(
      within(tabela).getByText('CF258A abaixo do mínimo em Jundiaí › Almoxarifado: 2 de 5'),
    ).toBeTruthy();
    expect(within(tabela).getByText('CF258A · HP 58A')).toBeTruthy();
    itens = [];
    act(() => canal.publicar({ id: 'e1', tipo: 'estoque.mudou', momento: '', alvo: null }));
    await waitFor(() => expect(screen.getByText('Nenhuma ocorrência aberta.')).toBeTruthy());
  });

  it('Ocorrência de um consumível: o clique abre o estoque do consumível no local', async () => {
    const { roteador } = abrirOInicio({
      'GET /api/estoque/abaixo-do-minimo': () => Response.json({ itens: [ACABANDO] }),
      'GET /api/estoque/saldos': () =>
        Response.json({
          itens: [ACABANDO],
          total: 1,
          proximo: null,
          permite: { movimentar: false },
        }),
      'GET /api/locais': () => Response.json({ locais: [] }),
    });
    const tabela = await screen.findByRole('grid', { name: 'Ocorrências abertas' });
    fireEvent.click(
      within(tabela).getByText('CF258A abaixo do mínimo em Jundiaí › Almoxarifado: 2 de 5'),
    );
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/estoque'));
    expect(roteador.state.location.search).toMatchObject({
      consumivel: 'cf258a',
      local: 'almoxarifado',
    });
  });
});
