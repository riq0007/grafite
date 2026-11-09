// O bloco "Suprimentos que acabam primeiro" do Início (spec tela-inicial, "Suprimentos que acabam
// primeiro"; change inicio-ajustavel, design, decisão 5).
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const IMPRESSORA = { id: 'impressora', nome: 'Impressora', icone: 'impressora' } as const;

/** Uma impressora na lista, como a API a devolve, com o menor nível ou sem ele. */
const impressora = (
  id: string,
  rotulo: string,
  menor: { nivel: number; descricao: string } | null,
) => ({
  id,
  rotulo,
  tipo: IMPRESSORA,
  modelo: null,
  patrimonio: null,
  local: null,
  responsavel: null,
  uso: 'em-uso',
  situacao: 'ativo',
  permite: { editar: false },
  suprimentos: menor
    ? { menor: { ...menor, momento: '2026-10-29T12:00:00.000Z' }, total: null }
    : null,
});

const lista = (itens: ReturnType<typeof impressora>[]) =>
  Response.json({
    itens,
    proximo: null,
    total: itens.length,
    referencias: { pessoas: {}, locais: {}, ativos: {}, modelos: {} },
    permite: { cadastrar: false },
  });

/** A série de um suprimento, um ponto por dia. */
const serie = (descricao: string, pontos: Array<[string, number]>) =>
  Response.json({
    itens: [
      {
        item: '1',
        descricao,
        pontos: pontos.map(([dia, percentual]) => ({
          dia,
          momento: `${dia}T12:00:00.000Z`,
          percentual,
        })),
      },
    ],
  });

function abrir(servidor: ServidorDeTeste) {
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(naOrganizacao('ativos.ver'), {
        'GET /api/tipos-de-ativo': () =>
          Response.json({ tipos: [], permite: { cadastrar: false } }),
        'GET /api/visoes': () => Response.json({ visoes: [], permite: { compartilhar: false } }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

describe('Suprimentos que acabam primeiro', () => {
  it('toner quase no fim: a do RH primeiro, com o cartucho preto, o nível e a estimativa', async () => {
    const pedidos: URL[] = [];
    const roteador = abrir({
      'GET /api/ativos': (pedido) => {
        pedidos.push(new URL(pedido.url));
        return lista([
          impressora('rh', 'Impressora do RH', { nivel: 8, descricao: 'Black Toner Cartridge' }),
          impressora('fin', 'Impressora do Financeiro', {
            nivel: 40,
            descricao: 'Cyan Toner Cartridge',
          }),
          impressora('sem', 'Impressora sem leitura', null),
        ]);
      },
      'GET /api/ativos/rh/suprimentos/serie': () =>
        serie('Black Toner Cartridge', [
          ['2026-10-01', 70],
          ['2026-10-15', 40],
          ['2026-10-29', 8],
        ]),
      'GET /api/ativos/fin/suprimentos/serie': () => Response.json({ itens: [] }),
    });

    const prateleira = await screen.findByRole('list', { name: 'Suprimentos que acabam primeiro' });
    expect(pedidos[0]?.searchParams.get('ordem')).toBe('coleta.suprimentos');
    expect(pedidos[0]?.searchParams.get('direcao')).toBe('crescente');
    expect(pedidos[0]?.searchParams.get('limite')).toBe('6');

    const itens = within(prateleira).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    const [rh, financeiro] = itens as [HTMLElement, HTMLElement];
    expect(within(rh).getByRole('link').textContent).toContain('Impressora do RH');
    expect(within(rh).getByRole('meter', { name: 'Preto' })).toBeTruthy();
    expect(within(rh).getByText('8%')).toBeTruthy();
    expect(await within(rh).findByText(/^Acaba em cerca de \d+ dias?/)).toBeTruthy();
    expect(within(financeiro).getByRole('meter', { name: 'Ciano' })).toBeTruthy();
    expect(within(financeiro).getByText('40%')).toBeTruthy();

    fireEvent.click(within(rh).getByRole('link'));
    expect(roteador.state.location.pathname).toBe('/ativos/rh');
  });

  it('sem impressora com o nível lido, diz que não há nenhuma', async () => {
    abrir({ 'GET /api/ativos': () => lista([impressora('sem', 'Impressora sem leitura', null)]) });
    expect(await screen.findByText('Nenhuma impressora com o nível lido.')).toBeTruthy();
  });
});
