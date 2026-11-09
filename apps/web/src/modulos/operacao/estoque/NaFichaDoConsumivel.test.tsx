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

// A seção Estoque da ficha do consumível (spec modulo-operacao, "Estoque na ficha do consumível";
// change p4c-estoque, design, decisões 6 e 7).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Estoque = components['schemas']['EstoqueDoConsumivel'];
type Ficha = components['schemas']['FichaDoConsumivel'];

const { formatarDataEHora } = criarDataHora();

const FICHA: Ficha = {
  id: 'cf258a',
  codigo: 'CF258A',
  nome: 'HP 58A',
  tipo: 'toner',
  cor: 'preto',
  rendimento: 3000,
  situacao: 'ativo',
  criadoEm: '2026-10-19T12:00:00.000Z',
  atualizadoEm: '2026-10-19T12:00:00.000Z',
  fornecedores: [],
  modelos: [],
  permite: { editar: false },
};

const CONSUMIVEL = {
  id: 'cf258a',
  codigo: 'CF258A',
  nome: 'HP 58A',
  tipo: 'toner',
  cor: 'preto',
  situacao: 'ativo',
  abrir: true,
} as const;

const saldo = (id: string, caminho: string, quantidade: number, minimo: number) => ({
  id,
  consumivel: CONSUMIVEL,
  local: { id, caminho },
  saldo: quantidade,
  minimo,
  situacao: (quantidade === 0
    ? 'sem-estoque'
    : quantidade < minimo
      ? 'abaixo-do-minimo'
      : 'em-estoque') as Estoque['saldos'][number]['situacao'],
  abaixoDesde: null,
  permite: { movimentar: true },
});

const EM_DOIS_LOCAIS: Estoque = {
  saldos: [
    saldo('almoxarifado', 'Jundiaí › Almoxarifado', 7, 5),
    saldo('expedicao', 'Jundiaí › Expedição', 2, 0),
  ],
  soma: 9,
  movimentos: [
    {
      id: 'm1',
      tipo: 'saida',
      consumivel: CONSUMIVEL,
      quantidade: 1,
      origem: { id: 'almoxarifado', caminho: 'Jundiaí › Almoxarifado' },
      destino: null,
      fornecedor: null,
      notaFiscal: null,
      ativo: { id: 'pat412', rotulo: 'HP LaserJet M404', patrimonio: 'PAT-00412', abrir: false },
      contador: null,
      motivo: null,
      observacao: null,
      lancadoPor: { id: 'carla', nome: 'Carla Dias' },
      momento: '2026-10-21T14:40:00.000Z',
    },
  ],
  permite: { movimentar: true },
};

function abrir(estoque: Estoque, permissoes: PermissaoDaSessao[]) {
  const servidor: ServidorDeTeste = {
    'GET /api/consumiveis/cf258a': () => Response.json(FICHA),
    'GET /api/consumiveis/cf258a/estoque': () => Response.json(estoque),
    'GET /api/estoque/saldos': () =>
      Response.json({ itens: [], total: 0, proximo: null, permite: { movimentar: true } }),
    'GET /api/locais': () => Response.json({ locais: [] }),
    'GET /api/consumiveis/escolha': () => Response.json({ consumiveis: [] }),
    'GET /api/fornecedores/escolha': () => Response.json({ fornecedores: [] }),
  };
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/operacao/consumiveis/cf258a'] }),
  );
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

describe('o estoque na ficha do consumível', () => {
  it('CF258A em dois locais: o saldo, o mínimo e a situação de cada local, a soma e as últimas movimentações', async () => {
    abrir(EM_DOIS_LOCAIS, naOrganizacao('consumiveis.ver', 'estoque.ver'));
    const secao = await screen.findByRole('region', { name: 'Estoque' });
    const locais = await within(secao).findByRole('list', { name: 'Saldos nos locais' });
    const [almoxarifado, expedicao] = within(locais).getAllByRole('listitem');
    expect(almoxarifado?.textContent).toContain('Jundiaí › Almoxarifado');
    expect(almoxarifado?.textContent).toContain('7');
    expect(almoxarifado?.textContent).toContain('mínimo 5');
    expect(almoxarifado?.textContent).toContain('Em estoque');
    expect(expedicao?.textContent).toContain('Sem mínimo');
    expect(within(secao).getByText('9 em estoque nos locais que você vê')).toBeTruthy();
    const movimentos = within(secao).getByRole('list', { name: 'Movimentações mais novas' });
    expect(movimentos.textContent).toContain(
      formatarDataEHora(new Date('2026-10-21T14:40:00.000Z')),
    );
    expect(movimentos.textContent).toContain('Saída de 1');
    expect(
      within(secao)
        .getByRole('link', { name: 'Ver as movimentações do CF258A' })
        .getAttribute('href'),
    ).toBe('/operacao/movimentacoes?consumivel=cf258a');
  });

  it('sem nenhuma movimentação, a seção diz isso; quem movimenta lança a entrada com o consumível', async () => {
    const roteador = abrir(
      { saldos: [], soma: 0, movimentos: [], permite: { movimentar: true } },
      naOrganizacao('consumiveis.ver', 'estoque.ver', 'estoque.movimentar'),
    );
    const secao = await screen.findByRole('region', { name: 'Estoque' });
    expect(await within(secao).findByText('Nenhuma movimentação deste consumível.')).toBeTruthy();
    fireEvent.click(within(secao).getByRole('button', { name: 'Entrada' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/estoque'));
    expect(roteador.state.location.search).toMatchObject({
      lancar: 'entrada',
      consumivel: 'cf258a',
    });
  });

  it('quem não vê o estoque não tem a seção', async () => {
    abrir(EM_DOIS_LOCAIS, naOrganizacao('consumiveis.ver'));
    await screen.findByRole('heading', { level: 1, name: /CF258A/ });
    expect(screen.queryByRole('region', { name: 'Estoque' })).toBeNull();
  });
});
