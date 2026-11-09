// As notificações lidas do servidor (spec notificacoes, "Notificações gravadas no servidor", "Sino e
// não lidas", "Central de notificações" e "Ações do alerta na notificação"; change
// p3b-notificacoes-no-servidor, design, decisões 5, 7 e 8): o sino conta as não lidas da API, a
// central lista e filtra pelo servidor, e as ações vão às rotas das notificações e dos alertas.
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { criarClienteDeConsultas } from '../api/consultas.ts';
import { criarCanalDeEventos } from '../eventos/canal.ts';
import { criarRoteador } from '../rotas/arvore.ts';
import { noComputador } from '../teste/postura.ts';
import { type ServidorDeTeste, sessaoAtiva } from '../teste/sessao.ts';

type Notificacao = components['schemas']['NotificacaoNaLista'];

afterEach(() => {
  cleanup();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const notificacao = (dados: Partial<Notificacao> = {}): Notificacao => ({
  id: 'n1',
  severidade: 'critico',
  titulo: 'Black Toner Cartridge em 8%',
  descricao: 'HP LaserJet M404 · PAT-00412',
  origem: 'Alertas',
  destino: '/ajustes',
  criadaEm: new Date().toISOString(),
  lida: false,
  alerta: null,
  ...dados,
});

const BACKUP = notificacao({
  id: 'n2',
  severidade: 'info',
  titulo: 'Backup concluído',
  descricao: null,
  origem: 'Operação',
  destino: null,
  lida: true,
});

const lista = (itens: Notificacao[], naoLidas = itens.filter(({ lida }) => !lida).length) => ({
  itens,
  naoLidas,
  proximo: null,
});

function abrir(servidor: ServidorDeTeste) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }));
  const canal = criarCanalDeEventos();
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva([], servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return { roteador, canal };
}

const central = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /^Notificações,/ }));
  return screen.findByRole('dialog', { name: 'Notificações' });
};

describe('notificações do servidor', () => {
  it('o sino conta as não lidas do servidor, e a central lista as notificações dele', async () => {
    abrir({ 'GET /api/notificacoes': () => Response.json(lista([notificacao(), BACKUP])) });
    expect(await screen.findByRole('button', { name: 'Notificações, 1 não lida' })).toBeTruthy();
    const dialogo = await central();
    expect(await within(dialogo).findByText('Black Toner Cartridge em 8%')).toBeTruthy();
    expect(within(dialogo).getByText('Backup concluído')).toBeTruthy();
  });

  it('o evento das notificações relê o sino, sem recarregar', async () => {
    let itens = [BACKUP];
    const { canal } = abrir({ 'GET /api/notificacoes': () => Response.json(lista(itens)) });
    expect(
      await screen.findByRole('button', { name: 'Notificações, nenhuma não lida' }),
    ).toBeTruthy();
    itens = [notificacao(), notificacao({ id: 'n3' }), BACKUP];
    canal.publicar({
      id: 'evento-1',
      tipo: 'notificacoes.mudaram',
      momento: new Date().toISOString(),
      alvo: null,
    });
    expect(await screen.findByRole('button', { name: 'Notificações, 2 não lidas' })).toBeTruthy();
  });

  it('"Abrir" leva ao endereço e marca a notificação como lida no servidor', async () => {
    const lidas: string[] = [];
    const { roteador } = abrir({
      'GET /api/notificacoes': () => Response.json(lista([notificacao()])),
      'POST /api/notificacoes/n1/leitura': () => {
        lidas.push('n1');
        return new Response(null, { status: 204 });
      },
    });
    const dialogo = await central();
    const item = (await within(dialogo).findByText('Black Toner Cartridge em 8%')).closest(
      'li',
    ) as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Abrir' }));
    await waitFor(() => expect(lidas).toEqual(['n1']));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/ajustes'));
  });

  it('"Marcar todas como lidas" pede ao servidor, pela contagem de todas as páginas', async () => {
    let todas = 0;
    abrir({
      'GET /api/notificacoes': () => Response.json(lista([BACKUP], 130)),
      'POST /api/notificacoes/leitura': () => {
        todas += 1;
        return Response.json({ lidas: 130 });
      },
    });
    const dialogo = await central();
    const marcar = await within(dialogo).findByRole('button', { name: 'Marcar todas como lidas' });
    await waitFor(() => expect((marcar as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(marcar);
    await waitFor(() => expect(todas).toBe(1));
  });

  it('os filtros da central vão ao servidor', async () => {
    const pedidos: string[] = [];
    abrir({
      'GET /api/notificacoes': (pedido) => {
        pedidos.push(new URL(pedido.url).search);
        return Response.json(lista([notificacao()]));
      },
    });
    const dialogo = await central();
    await within(dialogo).findByText('Black Toner Cartridge em 8%');
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Crítico' }));
    await waitFor(() =>
      expect(pedidos.some((busca) => busca.includes('severidade=critico'))).toBe(true),
    );
  });

  it('"Reconhecer" reconhece o alerta e marca a notificação como lida', async () => {
    const pedidos: string[] = [];
    abrir({
      'GET /api/notificacoes': () =>
        Response.json(
          lista([
            notificacao({
              alerta: {
                id: 'al1',
                situacao: 'aberto',
                reconhecido: null,
                adiado: null,
                permite: { tratar: true },
              },
            }),
          ]),
        ),
      'POST /api/alertas/al1/reconhecimento': () => {
        pedidos.push('reconhecimento');
        return Response.json({ reconhecido: { nome: 'Ana Souza', em: new Date().toISOString() } });
      },
      'POST /api/notificacoes/n1/leitura': () => {
        pedidos.push('leitura');
        return new Response(null, { status: 204 });
      },
    });
    const dialogo = await central();
    const item = (await within(dialogo).findByText('Black Toner Cartridge em 8%')).closest(
      'li',
    ) as HTMLElement;
    expect(within(item).getByRole('button', { name: 'Adiar 15 min' })).toBeTruthy();
    fireEvent.click(within(item).getByRole('button', { name: 'Reconhecer' }));
    await waitFor(() => expect(pedidos).toEqual(['reconhecimento', 'leitura']));
  });

  it('o modo Foco liga pela central, e o sino diz isso', async () => {
    abrir({
      'GET /api/notificacoes': () => Response.json(lista([notificacao()])),
      'PATCH /api/conta/preferencias': async (pedido) =>
        Response.json((await pedido.json()).mudancas),
    });
    const dialogo = await central();
    fireEvent.click(within(dialogo).getByRole('switch', { name: /Modo Foco/ }));
    expect(
      await screen.findByRole('button', { name: 'Notificações, 1 não lida, Foco ligado' }),
    ).toBeTruthy();
  });

  it('o alerta já reconhecido aparece em texto, sem as ações', async () => {
    abrir({
      'GET /api/notificacoes': () =>
        Response.json(
          lista([
            notificacao({
              alerta: {
                id: 'al1',
                situacao: 'aberto',
                reconhecido: { nome: 'Ana Souza', em: new Date().toISOString() },
                adiado: null,
                permite: { tratar: true },
              },
            }),
          ]),
        ),
    });
    const dialogo = await central();
    const item = (await within(dialogo).findByText('Black Toner Cartridge em 8%')).closest(
      'li',
    ) as HTMLElement;
    expect(within(item).getByText('Reconhecido por Ana Souza')).toBeTruthy();
    expect(within(item).queryByRole('button', { name: 'Reconhecer' })).toBeNull();
  });
});
