import type { components } from '@grafite/api-client';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

type Importacao = components['schemas']['Importacao'];

const importacao = (extras: Partial<Importacao>): Importacao => ({
  id: 'i1',
  nomeDoArquivo: 'computadores.xlsx',
  tipo: { id: 'computador', nome: 'Computador' },
  situacao: 'aplicando',
  linhas: 120,
  processadas: 60,
  totais: { novos: 50, alterados: 8, semMudanca: 1, comErro: 1 },
  criadaEm: '2026-10-12T12:00:00.000Z',
  concluidaEm: null,
  aplicadaEm: '2026-10-12T12:05:00.000Z',
  colunas: [],
  campos: [],
  ...extras,
});

function abrir(servidor: ServidorDeTeste): CanalDeEventos {
  noComputador();
  const canal = criarCanalDeEventos();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/gestao/importacoes/i1'] }),
  );
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(naOrganizacao('ativos.ver', 'ativos.editar'), {
        'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return canal;
}

const avancou = (canal: CanalDeEventos) =>
  act(() =>
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000e01',
      tipo: 'importacoes.mudaram',
      momento: '2026-10-12T12:06:00.000Z',
      alvo: { tipo: 'importacao', id: 'i1' },
    }),
  );

describe('o acompanhamento da importação', () => {
  it('mostra as linhas processadas e chega ao resultado pelo evento, sem recarregar', async () => {
    let atual = importacao({});
    const canal = abrir({
      'GET /api/ativos/importacoes/i1': () => Response.json(atual),
      'GET /api/ativos/importacoes/i1/erros': () =>
        Response.json({
          itens: [
            { linha: 7, mensagens: [{ campo: 'IP', mensagem: 'Use um IP, como 192.168.0.10.' }] },
          ],
          proximo: null,
        }),
    });
    const barra = await screen.findByRole('progressbar', { name: 'Importando' });
    expect(barra.getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByText('60 de 120 linhas processadas.')).toBeTruthy();

    atual = importacao({ processadas: 90 });
    await avancou(canal);
    await waitFor(() =>
      expect(
        screen.getByRole('progressbar', { name: 'Importando' }).getAttribute('aria-valuenow'),
      ).toBe('75'),
    );

    atual = importacao({
      situacao: 'concluida',
      processadas: 120,
      totais: { novos: 100, alterados: 17, semMudanca: 2, comErro: 1 },
      concluidaEm: '2026-10-12T12:10:00.000Z',
    });
    await avancou(canal);
    expect(
      await screen.findByText('100 novos · 17 alterados · 2 sem mudança · 1 com erro'),
    ).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    const erros = await screen.findByRole('list', { name: 'Linhas com erro' });
    expect(within(erros).getAllByRole('listitem', { name: /^Linha/ })).toHaveLength(1);
    expect(erros.textContent).toContain('IP: Use um IP, como 192.168.0.10.');
  });

  it('na fila, diz que a importação começa em instantes', async () => {
    abrir({
      'GET /api/ativos/importacoes/i1': () =>
        Response.json(importacao({ situacao: 'na-fila', processadas: 0 })),
    });
    expect(await screen.findByText('Na fila: a importação começa em instantes.')).toBeTruthy();
  });

  it('com falha, diz até onde chegou e o que fazer', async () => {
    abrir({
      'GET /api/ativos/importacoes/i1': () => Response.json(importacao({ situacao: 'com-falha' })),
    });
    expect(await screen.findByText(/A importação parou com uma falha/)).toBeTruthy();
    expect(screen.getByText('60 de 120 linhas processadas.')).toBeTruthy();
  });

  it('concluída sem erros, diz isso; descartada, diz que nada foi importado', async () => {
    abrir({
      'GET /api/ativos/importacoes/i1': () =>
        Response.json(
          importacao({
            situacao: 'concluida',
            processadas: 120,
            totais: { novos: 120, alterados: 0, semMudanca: 0, comErro: 0 },
          }),
        ),
    });
    expect(await screen.findByText('Nenhuma linha com erro.')).toBeTruthy();
    cleanup();

    abrir({
      'GET /api/ativos/importacoes/i1': () =>
        Response.json(importacao({ situacao: 'descartada', processadas: 0 })),
    });
    expect(await screen.findByText('Descartada: nada foi importado.')).toBeTruthy();
  });
});
