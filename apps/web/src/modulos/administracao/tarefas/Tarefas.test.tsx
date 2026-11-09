import { criarDataHora, filaDeAvisos } from '@grafite/ui';
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const tarefa = (id: string, falhouEm: string, extras: Record<string, unknown> = {}) => ({
  id: `0199a6e0-0000-7000-8000-00000000000${id}`,
  tarefa: 'manutencao',
  nome: 'Manutenção diária',
  tentativas: 6,
  erro: 'connect ECONNREFUSED 10.0.0.9:5432',
  falhouEm,
  ...extras,
});

const ONTEM = tarefa('1', '2026-10-06T06:31:00.000Z');
const ANTEONTEM = tarefa('2', '2026-10-05T06:31:00.000Z', {
  tentativas: 3,
  erro: 'Tempo esgotado.',
});
const SEMANA_PASSADA = tarefa('3', '2026-09-30T06:31:00.000Z');

const problema = (status: number, codigo: string, detalhe: string) =>
  Response.json(
    {
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
    },
    { status },
  );

function abrir(
  servidor: ServidorDeTeste,
  {
    permissoes = naOrganizacao('tarefas.administrar'),
    canal = criarCanalDeEventos(),
  }: { permissoes?: PermissaoDaSessao[]; canal?: CanalDeEventos } = {},
) {
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/administracao/tarefas'] }),
  );
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, {
        'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
        'GET /api/tarefas/rotinas': () => Response.json({ rotinas: [] }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
}

const lista = () => screen.findByRole('list', { name: 'Tarefas com falha' });
const nomesDosItens = async () =>
  within(await lista())
    .getAllByRole('listitem')
    .map((item) => item.textContent);
const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

describe('tela de tarefas com falha', () => {
  it('mostra cada tarefa com o nome, quando falhou, as tentativas e o erro', async () => {
    abrir({
      'GET /api/tarefas-com-falha': () => Response.json({ itens: [ONTEM], proximo: null }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Tarefas' });
    const [item] = within(await lista()).getAllByRole('listitem');
    const quando = criarDataHora().formatarDataEHora(new Date(ONTEM.falhouEm));
    expect(item?.textContent).toContain('Manutenção diária');
    expect(item?.textContent).toContain(quando);
    expect(item?.textContent).toContain('6');
    expect(item?.textContent).toContain('connect ECONNREFUSED 10.0.0.9:5432');
    expect(
      within(item as HTMLElement).getByRole('button', { name: /^Tentar de novo/ }),
    ).toBeTruthy();
  });

  it('da mais recente para a mais antiga, com "Carregar mais" até a última', async () => {
    const cursores: Array<string | null> = [];
    abrir({
      'GET /api/tarefas-com-falha': (pedido) => {
        const cursor = new URL(pedido.url).searchParams.get('cursor');
        cursores.push(cursor);
        return Response.json(
          cursor === null
            ? { itens: [ONTEM, ANTEONTEM], proximo: 'pagina-2' }
            : { itens: [SEMANA_PASSADA], proximo: null },
        );
      },
    });
    expect(await nomesDosItens()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(async () => expect(await nomesDosItens()).toHaveLength(3));
    expect(cursores).toEqual([null, 'pagina-2']);
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('sem tarefas com falha, diz "Nenhuma tarefa com falha."', async () => {
    abrir({ 'GET /api/tarefas-com-falha': () => Response.json({ itens: [], proximo: null }) });
    expect(await screen.findByText('Nenhuma tarefa com falha.')).toBeTruthy();
    expect(
      screen.getByText(/^Quando uma rotina ou outra tarefa falha em todas as tentativas/),
    ).toBeTruthy();
  });

  it('Rotinas: cada uma com o que faz, quando roda, a última execução e a próxima', async () => {
    abrir({
      'GET /api/tarefas-com-falha': () => Response.json({ itens: [], proximo: null }),
      'GET /api/tarefas/rotinas': () =>
        Response.json({
          rotinas: [
            {
              tarefa: 'manutencao-diaria',
              nome: 'Manutenção diária',
              descricao: 'Apaga o que venceu em cada organização.',
              agenda: 'Todo dia às 03:30',
              ultima: { momento: '2026-10-28T06:30:00.000Z', situacao: 'concluida' },
              proxima: '2026-10-29T06:30:00.000Z',
            },
          ],
        }),
    });
    const rotinas = await screen.findByRole('list', { name: 'Rotinas' });
    const [manutencao] = within(rotinas).getAllByRole('listitem');
    expect(manutencao?.textContent).toContain('Manutenção diária');
    expect(manutencao?.textContent).toContain('Apaga o que venceu em cada organização.');
    expect(manutencao?.textContent).toContain('Todo dia às 03:30');
    expect(manutencao?.textContent).toContain('Concluída');
  });

  it('"Tentar de novo" põe a tarefa de volta na fila, e ela sai da lista', async () => {
    let itens = [ONTEM, ANTEONTEM];
    const repetidas: string[] = [];
    abrir({
      'GET /api/tarefas-com-falha': () => Response.json({ itens, proximo: null }),
      [`POST /api/tarefas-com-falha/${ONTEM.id}/repeticao`]: (pedido) => {
        repetidas.push(pedido.headers.get('x-grafite-csrf') ?? '');
        itens = [ANTEONTEM];
        return new Response(null, { status: 204 });
      },
    });
    const [primeira] = within(await lista()).getAllByRole('listitem');
    fireEvent.click(
      within(primeira as HTMLElement).getByRole('button', { name: /^Tentar de novo/ }),
    );
    await waitFor(() => expect(avisos()).toContain('Tarefa de volta na fila.'));
    await waitFor(async () => expect(await nomesDosItens()).toHaveLength(1));
    expect(repetidas).toEqual(['csrf-de-teste']);
  });

  it('a recusa de "Tentar de novo" aparece, e a tarefa continua na lista', async () => {
    abrir({
      'GET /api/tarefas-com-falha': () => Response.json({ itens: [ONTEM], proximo: null }),
      [`POST /api/tarefas-com-falha/${ONTEM.id}/repeticao`]: () =>
        problema(503, 'fila-indisponivel', 'A fila de tarefas não está rodando.'),
    });
    const [item] = within(await lista()).getAllByRole('listitem');
    fireEvent.click(within(item as HTMLElement).getByRole('button', { name: /^Tentar de novo/ }));
    expect(await screen.findByText('A fila de tarefas não está rodando.')).toBeTruthy();
    expect(await nomesDosItens()).toHaveLength(1);
  });

  it('a lista se atualiza sozinha quando uma tarefa entra nela', async () => {
    const canal = criarCanalDeEventos();
    let itens = [ANTEONTEM];
    abrir(
      { 'GET /api/tarefas-com-falha': () => Response.json({ itens, proximo: null }) },
      { canal },
    );
    expect(await nomesDosItens()).toHaveLength(1);
    itens = [ONTEM, ANTEONTEM];
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000009',
      tipo: 'tarefas.mudaram',
      momento: '2026-10-07T12:00:00.000Z',
      alvo: { tipo: 'tarefa', id: ONTEM.id },
    });
    await waitFor(async () => expect(await nomesDosItens()).toHaveLength(2));
  });

  it('sem tarefas.administrar, a tela diz a quem pedir acesso', async () => {
    abrir({}, { permissoes: naOrganizacao('pessoas.ver') });
    expect(await screen.findByText('Você não tem acesso a Tarefas.')).toBeTruthy();
  });
});
