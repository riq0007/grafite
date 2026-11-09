import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const A412 = '0199a6e0-0000-7000-8000-000000000412';
const A500 = '0199a6e0-0000-7000-8000-000000000500';
const SWITCH = '0199a6e0-0000-7000-8000-000000000700';

const ITENS = [
  { id: A412, rotulo: 'HP LaserJet M404', patrimonio: 'PAT-00412' },
  { id: SWITCH, rotulo: 'Switch do rack 2', patrimonio: null },
  { id: A500, rotulo: 'HP LaserJet M404', patrimonio: 'PAT-00500' },
];

function abrir(
  endereco: string,
  servidor: ServidorDeTeste = {},
  permissoes: PermissaoDaSessao[] = naOrganizacao('ativos.ver'),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, {
        'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={criarCanalDeEventos()}
    />,
  );
  return roteador;
}

/** A API das etiquetas, que devolve os pedidos que conhece, na ordem pedida, e conta o resto. */
const etiquetas = (pedidos: URL[] = []) => ({
  'GET /api/ativos/etiquetas': (pedido: Request) => {
    const endereco = new URL(pedido.url);
    pedidos.push(endereco);
    const ids = (endereco.searchParams.get('ids') ?? '').split(',');
    const itens = ids.flatMap((id) => ITENS.filter((item) => item.id === id));
    return Response.json({ itens, fora: ids.length - itens.length });
  },
});

const previa = () => screen.getByRole('region', { name: 'Prévia das etiquetas' });
const folha = (numero: number) => within(previa()).getByRole('figure', { name: `Folha ${numero}` });
const etiquetasDa = (elemento: HTMLElement) => [
  ...elemento.querySelectorAll<HTMLElement>('[data-etiqueta]'),
];

describe('a tela das etiquetas', () => {
  it('mostra as etiquetas na ordem pedida, com o link da ficha, e quantas ficaram de fora', async () => {
    const pedidos: URL[] = [];
    abrir(`/ativos/etiquetas?ids=${A412},${SWITCH},fora-do-acesso`, etiquetas(pedidos));
    expect(await screen.findByText('2 etiquetas')).toBeTruthy();
    expect(screen.getByText('1 ativo fora do seu acesso ficou de fora.')).toBeTruthy();
    expect(pedidos[0]?.searchParams.get('ids')).toBe(`${A412},${SWITCH},fora-do-acesso`);
    const daFolha = etiquetasDa(folha(1));
    expect(daFolha.map((etiqueta) => etiqueta.dataset.endereco)).toEqual([
      `${window.location.origin}/ativos/${A412}`,
      `${window.location.origin}/ativos/${SWITCH}`,
    ]);
    expect(daFolha[0]?.textContent).toContain('PAT-00412');
    expect(daFolha[0]?.textContent).toContain('Empresa de exemplo');
    expect(daFolha[1]?.textContent).toContain('Sem patrimônio');
  });

  it('na folha A4, começa na etiqueta escolhida e deixa as anteriores em branco', async () => {
    const roteador = abrir(`/ativos/etiquetas?ids=${A412},${SWITCH},${A500}`, etiquetas());
    await screen.findByText('3 etiquetas');
    fireEvent.click(screen.getByRole('button', { name: /Começar na etiqueta/ }));
    fireEvent.click(await screen.findByRole('option', { name: '5' }));
    await waitFor(() => expect(roteador.state.location.search).toMatchObject({ inicio: 5 }));
    const posicoes = [...folha(1).querySelectorAll<HTMLElement>('[data-posicao]')];
    expect(posicoes).toHaveLength(21);
    expect(posicoes.map((posicao) => etiquetasDa(posicao).length)).toEqual([
      0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it('na impressora de etiquetas, cada etiqueta numa folha, e "Imprimir" abre o diálogo', async () => {
    const imprimir = vi.fn();
    vi.stubGlobal('print', imprimir);
    const roteador = abrir(`/ativos/etiquetas?ids=${A412},${SWITCH}`, etiquetas());
    await screen.findByText('2 etiquetas');
    fireEvent.click(screen.getByRole('radio', { name: /Impressora de etiquetas/ }));
    await waitFor(() =>
      expect(roteador.state.location.search).toMatchObject({ formato: 'impressora' }),
    );
    expect(screen.queryByRole('button', { name: /Começar na etiqueta/ })).toBeNull();
    expect(etiquetasDa(folha(1))).toHaveLength(1);
    expect(etiquetasDa(folha(2))).toHaveLength(1);
    expect(document.head.textContent ?? '').toContain('size: 50mm 30mm');

    fireEvent.click(screen.getByRole('button', { name: 'Imprimir' }));
    expect(imprimir).toHaveBeenCalledOnce();
  });

  it('recusa mais de 200 ativos sem perguntar à API, e diz quando nenhum foi escolhido', async () => {
    const pedidos: URL[] = [];
    const muitos = Array.from({ length: 201 }, (_, i) => `a${i}`).join(',');
    abrir(`/ativos/etiquetas?ids=${muitos}`, etiquetas(pedidos));
    expect(await screen.findByText('Escolha até 200 ativos por vez.')).toBeTruthy();
    expect(pedidos).toHaveLength(0);
    cleanup();

    abrir('/ativos/etiquetas', etiquetas(pedidos));
    expect(await screen.findByText('Nenhum ativo escolhido.')).toBeTruthy();
    expect(pedidos).toHaveLength(0);
  });

  it('quem não vê ativos não abre as etiquetas', async () => {
    abrir(`/ativos/etiquetas?ids=${A412}`, etiquetas(), naOrganizacao('catalogo.administrar'));
    expect(await screen.findByText('Você não tem acesso às etiquetas dos ativos.')).toBeTruthy();
  });
});
