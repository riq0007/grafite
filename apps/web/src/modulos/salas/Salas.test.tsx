// O módulo Salas (spec modulo-salas; change salas-de-reuniao): o menu pelas permissões, a Agenda com
// as reservas e o horário livre que abre a Nova reserva, o pedido, o convite aceito, o pedido
// aprovado e a tela sem permissão.
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../sessao/useAcesso.ts';
import { noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';
import { itensPermitidos } from '../registroDaConta.ts';
import { salas } from './modulo.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Reserva = components['schemas']['ReservaDeSala'];

const PARATY = '0199d3a0-0000-7000-8000-0000000000a1';
const RUI = '0199d3a0-0000-7000-8000-0000000000c2';
const VE = naOrganizacao('salas.ver');
const ADMINISTRA = naOrganizacao('salas.administrar', 'salas.ver');

const hoje = (hora: string) => {
  const agora = new Date();
  const [h = 0, m = 0] = hora.split(':').map(Number);
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), h, m).toISOString();
};

const reserva = (mudancas: Partial<Reserva> = {}): Reserva => ({
  id: '0199d3a0-0000-7000-8000-0000000000r1',
  sala: { id: PARATY, nome: 'Sala Paraty' },
  inicio: hoje('14:00'),
  fim: hoje('15:00'),
  assunto: 'Revisão do orçamento',
  situacao: 'pendente',
  pedidaPor: { id: '0199d3a0-0000-7000-8000-0000000000c1', nome: 'Paula Reis' },
  comentario: null,
  motivo: null,
  participantes: null,
  itens: [],
  minhaResposta: null,
  permite: { aprovar: false, cancelar: false, responder: false },
  ...mudancas,
});

const SALA = {
  id: PARATY,
  nome: 'Sala Paraty',
  local: null,
  capacidade: 8,
  recursos: null,
  situacao: 'ativo' as const,
};

function servidor(extras: ServidorDeTeste = {}): ServidorDeTeste {
  return {
    'GET /api/salas': () =>
      Response.json({ salas: [SALA], itens: [], permite: { administrar: false } }),
    'GET /api/salas/agenda': () =>
      Response.json({ salas: [SALA], reservas: [reserva()], permite: { administrar: false } }),
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
    ...extras,
  };
}

function abrir(
  endereco: string,
  servidorDoTeste: ServidorDeTeste,
  permissoes: PermissaoDaSessao[],
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidorDoTeste)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

describe('o módulo Salas', () => {
  it('Quem só pede reservas: o menu mostra a Agenda e as Minhas reservas', () => {
    const rotulos = (permissoes: string[]) =>
      itensPermitidos(salas.menu ?? [], (chave: string) => permissoes.includes(chave)).map(
        (item) => item.rotulo,
      );
    expect(rotulos(['salas.ver'])).toEqual(['Agenda', 'Minhas reservas']);
    expect(rotulos(['salas.administrar'])).toEqual([
      'Agenda',
      'Minhas reservas',
      'Pedidos',
      'Cadastro',
    ]);
  });

  it('a Agenda mostra a sala e a reserva com a situação em texto', async () => {
    abrir('/salas', servidor(), VE);
    expect(await screen.findByText('Sala Paraty')).toBeTruthy();
    const bloco = await screen.findByRole('article', { name: /Revisão do orçamento/ });
    expect(within(bloco).getByText('Aguardando aprovação')).toBeTruthy();
    expect(within(bloco).getByText('Paula Reis')).toBeTruthy();
  });

  it('Horário livre: abre a Nova reserva com a sala e a hora, e o pedido sai com o retorno', async () => {
    // O relógio às 9 h de hoje: a reserva às 20:00 não pode ficar no passado, que a regra recusa,
    // quando o teste roda de noite. Só a data é falsa; os temporizadores continuam os de verdade.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(new Date().setHours(9, 0, 0, 0)));
    let corpo: Record<string, unknown> = {};
    abrir(
      '/salas',
      servidor({
        'POST /api/salas/reservas': async (pedido) => {
          corpo = await pedido.json();
          return Response.json(reserva(), { status: 201 });
        },
      }),
      VE,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Reservar Sala Paraty às 20:00' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Nova reserva' });
    expect(
      (within(gaveta).getByRole('textbox', { name: /^Início/ }) as HTMLInputElement).value,
    ).toBe('20:00');
    fireEvent.change(within(gaveta).getByRole('textbox', { name: /^Fim/ }), {
      target: { value: '20:30' },
    });
    fireEvent.change(within(gaveta).getByRole('textbox', { name: /^Assunto/ }), {
      target: { value: 'Alinhamento' },
    });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Pedir reserva' }));
    expect(await screen.findByText('Reserva pedida.')).toBeTruthy();
    expect(corpo).toMatchObject({ salaId: PARATY, assunto: 'Alinhamento', participantes: [] });
  });

  it('Convite aceito: o participante aceita nas Minhas reservas', async () => {
    let resposta: unknown;
    const convite = reserva({
      situacao: 'aprovada',
      minhaResposta: 'sem-resposta',
      permite: { aprovar: false, cancelar: false, responder: true },
    });
    abrir(
      '/salas/minhas',
      servidor({
        'GET /api/salas/reservas/minhas': () => Response.json({ reservas: [convite] }),
        [`POST /api/salas/reservas/${convite.id}/resposta`]: async (pedido) => {
          resposta = await pedido.json();
          return Response.json({ ...convite, minhaResposta: 'aceitou' });
        },
      }),
      VE,
    );
    expect(await screen.findByText('Você ainda não respondeu')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }));
    expect(await screen.findByText('Convite aceito.')).toBeTruthy();
    expect(resposta).toEqual({ resposta: 'aceitou' });
  });

  // docs/ANTISLOP.md, seção 25: o estado vazio oferece a ação como as outras telas, num botão (change
  // um-destaque-por-tela, design, decisão 5).
  it('vazias, as Minhas reservas e a Agenda oferecem a ação num botão', async () => {
    abrir(
      '/salas/minhas',
      servidor({ 'GET /api/salas/reservas/minhas': () => Response.json({ reservas: [] }) }),
      VE,
    );
    await screen.findByText('Nenhuma reserva nem convite.');
    expect(screen.getByRole('button', { name: 'Nova reserva' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Nova reserva' })).toBeNull();
    cleanup();
    abrir(
      '/salas',
      servidor({
        'GET /api/salas/agenda': () =>
          Response.json({ salas: [], reservas: [], permite: { administrar: true } }),
      }),
      ADMINISTRA,
    );
    expect(await screen.findByRole('button', { name: 'Abrir o cadastro' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Abrir o cadastro' })).toBeNull();
  });

  it('Aprovar pelo Pedidos: o pedido aprovado dá o retorno', async () => {
    const pedido = reserva({
      participantes: [{ conta: { id: RUI, nome: 'Rui Lima' }, resposta: 'sem-resposta' }],
      permite: { aprovar: true, cancelar: true, responder: false },
    });
    let aprovada = false;
    abrir(
      '/salas/pedidos',
      servidor({
        'GET /api/salas/reservas/pendentes': () =>
          Response.json({ reservas: aprovada ? [] : [pedido] }),
        [`POST /api/salas/reservas/${pedido.id}/aprovacao`]: () => {
          aprovada = true;
          return Response.json({ ...pedido, situacao: 'aprovada' });
        },
      }),
      ADMINISTRA,
    );
    expect(await screen.findByText('Rui Lima: Sem resposta')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByText('Reserva aprovada.')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText('Nenhum pedido aguardando aprovação.')).toBeTruthy(),
    );
  });

  it('sem a permissão, a tela diz que a conta não tem acesso às salas', async () => {
    abrir('/salas', servidor(), naOrganizacao('ativos.ver'));
    expect(await screen.findByText('Você não tem acesso às salas.')).toBeTruthy();
  });
});
