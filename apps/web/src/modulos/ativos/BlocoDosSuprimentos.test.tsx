// O bloco "Suprimentos que acabam primeiro" do Início (spec tela-inicial, "Suprimentos que acabam
// primeiro"; changes inicio-ajustavel, design, decisão 5, e opcoes-dos-blocos-do-inicio, decisões 5
// e 6): as impressoras de menor nível, no recorte das opções da conta, com o recorte em texto.
import type { AjustesDasPreferencias } from '@grafite/domain';
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

type Tipo = 'toner' | 'cilindro' | 'fusor' | 'outro';

/** Uma impressora de menor nível, como a API a devolve. */
const impressora = (
  id: string,
  rotulo: string,
  suprimento: { nivel: number; descricao: string; tipo?: Tipo; item?: string },
) => ({
  ativo: { id, rotulo },
  suprimento: {
    item: '1',
    tipo: 'toner' as Tipo,
    momento: '2026-10-29T12:00:00.000Z',
    ...suprimento,
  },
});

const menores = (itens: ReturnType<typeof impressora>[]) => Response.json({ itens });

/** A série de um suprimento, um ponto por dia. */
const serie = (item: string, descricao: string, pontos: Array<[string, number]>) =>
  Response.json({
    itens: [
      {
        item,
        descricao,
        pontos: pontos.map(([dia, percentual]) => ({
          dia,
          momento: `${dia}T12:00:00.000Z`,
          percentual,
        })),
      },
    ],
  });

const LOCAIS = [
  { id: 'jundiai', paiId: null, nome: 'Jundiaí', tipo: 'unidade', situacao: 'ativo' },
  { id: 'campinas', paiId: null, nome: 'Campinas', tipo: 'unidade', situacao: 'ativo' },
  { id: 'rh', paiId: 'jundiai', nome: 'RH', tipo: 'setor', situacao: 'ativo' },
  { id: 'ti', paiId: 'jundiai', nome: 'TI', tipo: 'setor', situacao: 'ativo' },
].map((local) => ({ ...local, permite: { editar: false } }));

function abrir(servidor: ServidorDeTeste, opcoes?: Record<string, number | string[]>) {
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }));
  const preferencias: AjustesDasPreferencias = opcoes
    ? { inicio: { blocos: [{ id: 'ativos.suprimentos', visivel: true, opcoes }] } }
    : {};
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(
        naOrganizacao('ativos.ver'),
        {
          'GET /api/tipos-de-ativo': () =>
            Response.json({ tipos: [], permite: { cadastrar: false } }),
          'GET /api/visoes': () => Response.json({ visoes: [], permite: { compartilhar: false } }),
          'GET /api/locais': () =>
            Response.json({ locais: LOCAIS, permite: { cadastrarNaRaiz: false } }),
          ...servidor,
        },
        preferencias,
      )}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

/** O servidor que guarda cada pedido das impressoras de menor nível e responde as dadas. */
function comMenores(itens: ReturnType<typeof impressora>[] = []) {
  const pedidos: URLSearchParams[] = [];
  const servidor: ServidorDeTeste = {
    'GET /api/ativos/suprimentos/menores': (pedido) => {
      pedidos.push(new URL(pedido.url).searchParams);
      return menores(itens);
    },
  };
  return { pedidos, servidor };
}

const bloco = async () =>
  (
    await screen.findByRole('heading', { level: 2, name: 'Suprimentos que acabam primeiro' })
  ).closest('section') as HTMLElement;

describe('Suprimentos que acabam primeiro', () => {
  it('Toner quase no fim: a do RH primeiro, com o cartucho preto, o nível e a estimativa', async () => {
    const { pedidos, servidor } = comMenores([
      impressora('rh', 'Impressora do RH', { nivel: 8, descricao: 'Black Toner Cartridge' }),
      impressora('fin', 'Impressora do Financeiro', {
        nivel: 40,
        descricao: 'Cyan Toner Cartridge',
        item: '2',
      }),
    ]);
    const roteador = abrir({
      ...servidor,
      'GET /api/ativos/rh/suprimentos/serie': () =>
        serie('1', 'Black Toner Cartridge', [
          ['2026-10-01', 70],
          ['2026-10-15', 40],
          ['2026-10-29', 8],
        ]),
      'GET /api/ativos/fin/suprimentos/serie': () => Response.json({ itens: [] }),
    });

    const prateleira = await screen.findByRole('list', { name: 'Suprimentos que acabam primeiro' });
    // De fábrica: os quatro tipos, 6 impressoras, sem corte de nível e sem locais.
    expect(pedidos[0]?.get('tipos')).toBe('toner,cilindro,fusor,outro');
    expect(pedidos[0]?.get('limite')).toBe('6');
    expect(pedidos[0]?.get('nivel')).toBe('100');
    expect(pedidos[0]?.has('locais')).toBe(false);

    const itens = within(prateleira).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    const [rh, financeiro] = itens as [HTMLElement, HTMLElement];
    expect(within(rh).getByRole('link').textContent).toContain('Impressora do RH');
    expect(within(rh).getByRole('meter', { name: 'Preto' })).toBeTruthy();
    expect(within(rh).getByText('8%')).toBeTruthy();
    expect(await within(rh).findByText(/^Acaba em cerca de \d+ dias?/)).toBeTruthy();
    expect(within(financeiro).getByRole('meter', { name: 'Ciano' })).toBeTruthy();
    expect(within(financeiro).getByText('40%')).toBeTruthy();
    // Sem nenhuma opção mudada, o bloco não diz recorte nenhum.
    expect(within(await bloco()).queryByText(/·|até \d+%/)).toBeNull();

    fireEvent.click(within(rh).getByRole('link'));
    expect(roteador.state.location.pathname).toBe('/ativos/rh');
  });

  it('Só o toner: o bloco pede só o toner e mostra o toner da impressora, com o recorte', async () => {
    const { pedidos, servidor } = comMenores([
      impressora('rh', 'Impressora do RH', { nivel: 60, descricao: 'Black Toner Cartridge' }),
    ]);
    abrir(
      { ...servidor, 'GET /api/ativos/rh/suprimentos/serie': () => Response.json({ itens: [] }) },
      { tipos: ['toner'] },
    );
    const prateleira = await screen.findByRole('list', { name: 'Suprimentos que acabam primeiro' });
    expect(pedidos[0]?.get('tipos')).toBe('toner');
    expect(within(prateleira).getByText('60%')).toBeTruthy();
    expect(within(await bloco()).getByText('Toner')).toBeTruthy();
  });

  it('o suprimento que não é toner mostra o tipo dele no cartucho', async () => {
    const { servidor } = comMenores([
      impressora('rh', 'Impressora do RH', { nivel: 3, descricao: 'Fuser Kit', tipo: 'fusor' }),
    ]);
    abrir(
      { ...servidor, 'GET /api/ativos/rh/suprimentos/serie': () => Response.json({ itens: [] }) },
      { tipos: ['fusor'] },
    );
    const prateleira = await screen.findByRole('list', { name: 'Suprimentos que acabam primeiro' });
    expect(within(prateleira).getByRole('meter', { name: 'Fusor' })).toBeTruthy();
    expect(within(prateleira).getByText('3%')).toBeTruthy();
  });

  it('Recorte em texto: os tipos, o nível e os locais, só o que difere da fábrica', async () => {
    const { pedidos, servidor } = comMenores([]);
    abrir(servidor, { tipos: ['toner'], nivel: 30, locais: ['jundiai'], limite: 9 });
    expect(await within(await bloco()).findByText('Toner · até 30% · Jundiaí')).toBeTruthy();
    const pedido = pedidos.at(-1);
    expect(pedido?.get('tipos')).toBe('toner');
    expect(pedido?.get('nivel')).toBe('30');
    expect(pedido?.get('locais')).toBe('jundiai');
    expect(pedido?.get('limite')).toBe('9');
  });

  it('o recorte com vários tipos e mais de dois locais', async () => {
    const { servidor } = comMenores([]);
    abrir(servidor, {
      tipos: ['toner', 'cilindro', 'outro'],
      locais: ['jundiai', 'campinas', 'rh', 'ti'],
    });
    expect(
      await within(await bloco()).findByText(
        'Toner, Cilindro e Outros · Jundiaí, Campinas e mais 2',
      ),
    ).toBeTruthy();
  });

  it('só o nível mudado: o recorte diz só o nível', async () => {
    const { servidor } = comMenores([]);
    abrir(servidor, { nivel: 50 });
    expect(await within(await bloco()).findByText('até 50%')).toBeTruthy();
  });

  it('"Nenhuma impressora neste recorte.": com o recorte, e nenhuma impressora nele', async () => {
    const { servidor } = comMenores([]);
    abrir(servidor, { tipos: ['toner'], nivel: 30 });
    const doBloco = within(await bloco());
    expect(await doBloco.findByText('Nenhuma impressora neste recorte.')).toBeTruthy();
    expect(doBloco.getByText('Toner · até 30%')).toBeTruthy();
  });

  it('sem recorte e sem impressora com o nível lido, diz que não há nenhuma', async () => {
    const { servidor } = comMenores([]);
    abrir(servidor);
    expect(await screen.findByText('Nenhuma impressora com o nível lido.')).toBeTruthy();
  });

  it('a falha ao carregar aparece em texto', async () => {
    abrir({
      'GET /api/ativos/suprimentos/menores': () => Response.json({}, { status: 500 }),
    });
    expect(await screen.findByText('Não foi possível carregar os suprimentos.')).toBeTruthy();
  });
});
