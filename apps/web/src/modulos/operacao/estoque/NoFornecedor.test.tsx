import { criarDataHora, filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

// Os consumíveis e as entradas na ficha do fornecedor (spec fornecedores, "Consumíveis do
// fornecedor"; change p4c-estoque, design, decisões 6 e 7).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const { formatarData } = criarDataHora();

const HP = {
  id: 'hp',
  nome: 'HP Brasil',
  cnpj: null,
  contato: null,
  email: null,
  telefone: null,
  observacoes: null,
  situacao: 'ativo',
  criadoEm: '2026-10-14T12:00:00.000Z',
  atualizadoEm: '2026-10-14T12:00:00.000Z',
  permite: { editar: false },
};

const consumivel = (id: string, codigo: string, nome: string) => ({
  id,
  codigo,
  nome,
  tipo: 'toner',
  cor: 'preto',
});

function abrir(
  permissoes: PermissaoDaSessao[],
  {
    consumiveis = [
      consumivel('cf258a', 'CF258A', 'HP 58A'),
      consumivel('cf258x', 'CF258X', 'HP 58X'),
    ],
    entradas = 3,
  } = {},
) {
  const servidor: ServidorDeTeste = {
    'GET /api/fornecedores/hp': () => Response.json(HP),
    'GET /api/fornecedores/hp/consumiveis': () => Response.json({ consumiveis }),
    'GET /api/fornecedores/hp/entradas': () =>
      Response.json({
        entradas,
        ultima: entradas > 0 ? '2026-10-12T15:00:00.000Z' : null,
      }),
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  };
  noComputador();
  render(
    <App
      roteador={criarRoteador(
        createMemoryHistory({ initialEntries: ['/administracao/fornecedores/hp'] }),
      )}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
}

describe('o estoque na ficha do fornecedor', () => {
  it('Toners da HP Brasil: os consumíveis que ele vende e as entradas no estoque, com a última', async () => {
    abrir(naOrganizacao('fornecedores.ver', 'consumiveis.ver', 'estoque.ver'));
    const consumiveis = await screen.findByRole('region', { name: 'Consumíveis deste fornecedor' });
    expect(within(consumiveis).getByRole('link', { name: 'CF258A' }).getAttribute('href')).toBe(
      '/operacao/consumiveis/cf258a',
    );
    expect(within(consumiveis).getByRole('link', { name: 'CF258X' })).toBeTruthy();
    const entradas = await screen.findByRole('region', { name: 'Entradas no estoque' });
    expect(
      await within(entradas).findByText(
        `Entradas no estoque: 3, a última em ${formatarData(new Date('2026-10-12T15:00:00.000Z'))}`,
      ),
    ).toBeTruthy();
    expect(
      within(entradas)
        .getByRole('link', { name: 'Ver as entradas da HP Brasil' })
        .getAttribute('href'),
    ).toBe('/operacao/movimentacoes?tipo=entrada&fornecedor=hp');
  });

  it('sem nenhum, as linhas dizem que não há consumíveis nem entradas', async () => {
    abrir(naOrganizacao('fornecedores.ver', 'consumiveis.ver', 'estoque.ver'), {
      consumiveis: [],
      entradas: 0,
    });
    expect(await screen.findByText('Nenhum consumível deste fornecedor.')).toBeTruthy();
    expect(await screen.findByText('Nenhuma entrada deste fornecedor no estoque.')).toBeTruthy();
  });

  it('Sem ver os consumíveis: quem vê só os fornecedores não tem os consumíveis nem as entradas', async () => {
    abrir(naOrganizacao('fornecedores.ver'));
    await screen.findByRole('heading', { level: 1, name: /HP Brasil/ });
    expect(screen.queryByRole('region', { name: 'Consumíveis deste fornecedor' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Entradas no estoque' })).toBeNull();
  });
});
