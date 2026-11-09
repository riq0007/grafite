// O mapa da planta na web (spec mapa-da-planta; change p7-mapa-da-planta, design, decisões 5 e 6):
// quem só vê, a camada desligada e a busca pelo texto do desenho, com a lista dos marcadores que
// repete o canvas.

import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import { noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const PLANTA = {
  id: 'p1',
  nome: 'Jundiaí',
  local: null,
  largura: 120,
  profundidade: 80,
  situacao: 'ativa',
  erro: null,
  fonte: 'planta-exemplo.json',
  contagens: { segmentos: 3, rotulos: 2, camadas: 1, maquinas: 0 },
  criadaEm: '2026-10-28T12:00:00.000Z',
};

function servidor(podeEditar: boolean): ServidorDeTeste {
  return {
    'GET /api/mapa/plantas': () => Response.json({ plantas: [PLANTA], podeEditar }),
    'GET /api/mapa/plantas/p1/modelo': () =>
      Response.json({
        largura: 120,
        profundidade: 80,
        camadas: [{ nome: 'PAREDES', segmentos: [0, 0, 120, 0] }],
        paredes: [],
        rotulos: [
          { texto: 'WC M', x: 9.6, z: 78.5 },
          { texto: 'Expedição', x: 70, z: 90 },
        ],
        maquinas: [],
      }),
    'GET /api/mapa/plantas/p1/marcadores': () =>
      Response.json({
        camadas: ['Ativos', 'Salas de reunião', 'Painéis'],
        posicionaveis: [
          { tipo: 'ativo', camada: 'Ativos' },
          { tipo: 'sala', camada: 'Salas de reunião' },
          { tipo: 'painel', camada: 'Painéis' },
        ],
        podeEditar,
        marcadores: [
          {
            alvo: { tipo: 'ativo', id: 'a1' },
            camada: 'Ativos',
            rotulo: 'Impressora da expedição',
            detalhe: 'PAT-00412',
            x: 70,
            z: 90,
            situacao: { texto: 'Offline', tom: 'critico' },
            acoes: [{ rotulo: 'Abrir ficha', destino: '/ativos/a1' }],
          },
        ],
      }),
    'GET /api/salas': () =>
      Response.json({
        salas: [
          { id: 's1', nome: 'Sala Ipê', local: null, situacao: 'ativo' },
          { id: 's2', nome: 'Sala antiga', local: null, situacao: 'inativo' },
        ],
        itens: [],
        permite: { administrar: true },
      }),
  };
}

function abrir(podeEditar: boolean) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/mapa/p1'] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(
        naOrganizacao(podeEditar ? 'mapa.editar' : 'mapa.ver', 'ativos.ver'),
        servidor(podeEditar),
      )}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={criarCanalDeEventos()}
    />,
  );
}

describe('o mapa da planta', () => {
  it('Quem só vê o mapa: os marcadores, sem posicionar', async () => {
    abrir(false);
    const marcadores = await screen.findByRole('list', { name: 'Marcadores' });
    expect(within(marcadores).getByText('Impressora da expedição · Offline')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Posicionar no mapa' })).toBeNull();
    expect(screen.queryByText('Posicionar no mapa')).toBeNull();
  });

  it('quem edita vê o Posicionar no mapa e, no marcador, o Mover e o Tirar do mapa', async () => {
    abrir(true);
    expect(await screen.findByText('Posicionar no mapa')).toBeTruthy();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Impressora da expedição · Offline' }),
    );
    expect(await screen.findByRole('button', { name: 'Tirar do mapa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir ficha' })).toBeTruthy();
  });

  it('quem edita posiciona as salas e os painéis como os ativos, pela escolha do que posicionar', async () => {
    abrir(true);
    const posicionar = await screen.findByRole('region', { name: 'Posicionar no mapa' });
    const escolha = within(posicionar).getByRole('radiogroup', { name: 'O que posicionar' });
    expect(within(escolha).getAllByRole('radio')).toHaveLength(3);
    for (const nome of ['Ativo', 'Sala', 'Painel']) {
      expect(within(escolha).getByRole('radio', { name: nome })).toBeTruthy();
    }
    fireEvent.click(within(escolha).getByRole('radio', { name: 'Sala' }));
    expect(
      await within(posicionar).findByText('Escolha a sala e clique no ponto do mapa.'),
    ).toBeTruthy();
    // A lista abre com as salas já carregadas: sem opções, a seleção não abre.
    fireEvent.click(await within(posicionar).findByRole('button', { name: /^Selecione Sala$/ }));
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.map((opcao) => opcao.textContent)).toEqual(['Sala Ipê']);
    fireEvent.click(opcoes[0] as HTMLElement);
    expect(await within(posicionar).findByText('Clique no ponto do mapa.')).toBeTruthy();
  });

  it('Busca pelo texto do desenho e Camada desligada', async () => {
    abrir(false);
    await screen.findByRole('list', { name: 'Marcadores' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Procurar no mapa' }), {
      target: { value: 'WC' },
    });
    const achados = await screen.findByRole('list', { name: 'Achados no mapa' });
    expect(within(achados).getByRole('button', { name: 'WC M' })).toBeTruthy();
    const camada = screen.getByRole('checkbox', { name: 'Ativos' }) as HTMLInputElement;
    expect(camada.checked).toBe(true);
    fireEvent.click(camada);
    expect((screen.getByRole('checkbox', { name: 'Ativos' }) as HTMLInputElement).checked).toBe(
      false,
    );
  });
});

describe('a planta nova', () => {
  it('aceita o modelo do PMG e cadastra a planta com o nome e a fonte', async () => {
    const enviados: string[] = [];
    noComputador();
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/mapa'] }));
    render(
      <App
        roteador={roteador}
        sessao={sessaoAtiva(naOrganizacao('mapa.editar'), {
          'GET /api/mapa/plantas': () => Response.json({ plantas: [], podeEditar: true }),
          'POST /api/mapa/plantas': (pedido) => {
            enviados.push(pedido.url);
            return Response.json(PLANTA, { status: 201 });
          },
        })}
        consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
        canal={criarCanalDeEventos()}
      />,
    );
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Nova planta' }))[0] as HTMLElement,
    );
    const gaveta = await screen.findByRole('dialog', { name: 'Nova planta' });
    fireEvent.change(within(gaveta).getByRole('textbox', { name: /^Nome/ }), {
      target: { value: 'Jundiaí' },
    });
    const escolha = within(gaveta).getByRole('group', { name: 'Arquivo' });
    fireEvent.change(escolha.querySelector('input[type="file"]') as HTMLElement, {
      target: { files: [new File(['{}'], 'planta-exemplo.json', { type: 'application/json' })] },
    });
    expect(await within(gaveta).findByText('planta-exemplo.json')).toBeTruthy();
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Cadastrar planta' }));
    await waitFor(() =>
      expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain(
        'Planta Jundiaí cadastrada.',
      ),
    );
    const parametros = new URL(enviados[0] ?? '').searchParams;
    expect(parametros.get('nome')).toBe('Jundiaí');
    expect(parametros.get('fonte')).toBe('planta-exemplo.json');
  });
});
