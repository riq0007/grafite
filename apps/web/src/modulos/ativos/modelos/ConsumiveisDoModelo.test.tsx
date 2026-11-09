import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

// Os consumíveis compatíveis na ficha do modelo (spec modulo-operacao, "Consumíveis compatíveis na
// ficha do modelo" e "Operação atualizada pelos eventos"; change p4b-consumiveis, design,
// decisões 5 a 7): a seção da ficha do modelo, também para quem não vê os consumíveis.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Compativel = components['schemas']['ConsumivelCompativel'];

const compativel = (id: string, codigo: string, extras: Partial<Compativel> = {}): Compativel => ({
  id,
  codigo,
  nome: null,
  tipo: 'toner',
  cor: null,
  rendimento: null,
  saldo: null,
  ...extras,
});

const CF258A = compativel('cf258a', 'CF258A', { nome: 'HP 58A', cor: 'preto', rendimento: 3000 });
const CF258X = compativel('cf258x', 'CF258X', { nome: 'HP 58X', cor: 'preto' });

const IMPRESSORA = { id: 'impressora', nome: 'Impressora', icone: 'impressora' } as const;

/** O catálogo com a ficha da M404 e os compatíveis dela, que o teste troca. */
function servidorDoModelo(inicial: Compativel[] | null) {
  const estado = { consumiveis: inicial };
  const compativeis = vi.fn(() => Response.json({ consumiveis: estado.consumiveis }));
  const servidor: ServidorDeTeste = {
    'GET /api/tipos-de-ativo': () =>
      Response.json({
        tipos: [
          {
            ...IMPRESSORA,
            capacidades: ['consumiveis.compatibilidade'],
            configuracaoDasCapacidades: {},
            campos: [],
            situacao: 'ativo',
            permite: { editar: false },
          },
        ],
        permite: { cadastrar: false },
      }),
    'GET /api/modelos/m404': () =>
      Response.json({
        id: 'm404',
        tipo: IMPRESSORA,
        fabricante: 'HP',
        nome: 'LaserJet M404',
        imagem: null,
        situacao: 'ativo',
        permite: { editar: false },
      }),
    'GET /api/modelos/m404/consumiveis': compativeis,
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  };
  return { servidor, estado, compativeis };
}

function abrir(
  servidor: ServidorDeTeste,
  permissoes: PermissaoDaSessao[] = naOrganizacao('modelos.editar'),
  { canal = criarCanalDeEventos(), desligados = [] as string[] } = {},
) {
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/gestao/catalogo/modelos/m404'] }),
  );
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor, {}, {}, { modulosDesligados: desligados })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return screen.findByRole('heading', { level: 1, name: /HP LaserJet M404/ });
}

const secao = () => screen.findByRole('region', { name: 'Consumíveis compatíveis' });

describe('os consumíveis compatíveis na ficha do modelo', () => {
  it('Toners da M404: mostra os compatíveis, com o nome, o tipo, a cor e o rendimento, sem a permissão dos consumíveis', async () => {
    const { servidor } = servidorDoModelo([CF258A, CF258X]);
    await abrir(servidor);
    const lista = within(await secao()).getByRole('list');
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    expect(within(lista).getByText('CF258A')).toBeTruthy();
    expect(within(lista).getByText('HP 58A')).toBeTruthy();
    expect(within(lista).getAllByText('Toner · Preto')).toHaveLength(2);
    expect(within(lista).getByText('3.000 páginas')).toBeTruthy();
    // Sem ver os consumíveis, o código não leva à ficha do consumível.
    expect(screen.queryByRole('link', { name: 'CF258A' })).toBeNull();
  });

  it('quem vê os consumíveis abre a ficha de cada um pelo código', async () => {
    const { servidor } = servidorDoModelo([CF258A]);
    await abrir(servidor, naOrganizacao('modelos.editar', 'consumiveis.ver'));
    await secao();
    expect(screen.getByRole('link', { name: 'CF258A' }).getAttribute('href')).toBe(
      '/operacao/consumiveis/cf258a',
    );
  });

  it('sem nenhum compatível, diz que a compatibilidade é escolhida na ficha do consumível', async () => {
    const { servidor } = servidorDoModelo([]);
    await abrir(servidor);
    expect(
      within(await secao()).getByText(
        'Nenhum consumível compatível. A compatibilidade é escolhida na ficha de cada consumível.',
      ),
    ).toBeTruthy();
  });

  it('Modelo de notebook: o modelo de um tipo sem a capacidade não mostra a seção', async () => {
    const { servidor, compativeis } = servidorDoModelo(null);
    await abrir(servidor);
    await waitFor(() => expect(compativeis).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Consumíveis compatíveis' })).toBeNull();
  });

  it('com o Operação desligado, a seção some sem pedir os compatíveis', async () => {
    const { servidor, compativeis } = servidorDoModelo([CF258A]);
    await abrir(servidor, naOrganizacao('modelos.editar'), { desligados: ['operacao'] });
    expect(screen.queryByRole('region', { name: 'Consumíveis compatíveis' })).toBeNull();
    expect(compativeis).not.toHaveBeenCalled();
  });

  it('o evento dos consumíveis relê os compatíveis do modelo', async () => {
    const canal: CanalDeEventos = criarCanalDeEventos();
    const { servidor, estado } = servidorDoModelo([CF258A]);
    await abrir(servidor, naOrganizacao('modelos.editar'), { canal });
    await secao();
    estado.consumiveis = [CF258A, CF258X];
    canal.publicar({
      id: 'e1',
      tipo: 'consumiveis.mudaram',
      momento: '2026-10-19T12:00:00.000Z',
      alvo: { tipo: 'consumivel', id: 'cf258x' },
    });
    expect(await screen.findByText('CF258X')).toBeTruthy();
  });
});
