// As equipes e os canais na tela (spec modulo-chat, "Equipes e canais na tela"; change
// chat-com-chamados, design, decisão 15): só para quem configura o chat, que abre o Chat do dock
// nelas, sem a moldura do chat, que é de quem o usa; a lista, com a situação em texto; e a gaveta,
// com o aviso da criação e, na alteração, o grupo gravado inativo como o escolhido.
import type { components } from '@grafite/api-client';
import type { Permissao } from '@grafite/domain';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { LojaDaSessao } from '../../sessao/loja.ts';
import { CHAT_VAZIO } from '../../teste/chat.tsx';
import { noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';

type EquipeOuCanal = components['schemas']['EquipeOuCanal'];

let lojas: LojaDaSessao[] = [];

afterEach(() => {
  cleanup();
  for (const loja of lojas) loja.parar();
  lojas = [];
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

/** A casca no endereço, no computador, com as permissões dadas e o chat vazio por baixo. */
function abrir(endereco: string, permissoes: Permissao[], servidor: ServidorDeTeste = {}) {
  noComputador();
  const loja = sessaoAtiva(naOrganizacao(...permissoes), { ...CHAT_VAZIO, ...servidor });
  lojas.push(loja);
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={loja}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={criarCanalDeEventos()}
    />,
  );
  return roteador;
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

const FINANCEIRO = '0199a6e0-0000-7000-8000-0000000000f1';
const TI = '0199a6e0-0000-7000-8000-0000000000f2';
const COMPRAS = '0199a6e0-0000-7000-8000-0000000000f3';
const EQUIPE_FINANCEIRO = '0199a6e0-0000-7000-8000-0000000000e1';
const EQUIPE_COMPRAS = '0199a6e0-0000-7000-8000-0000000000e2';

/** Os grupos ativos da escolha, como o `GET /chat/grupos` os dá, sem o Compras, que está inativo. */
const GRUPOS: ServidorDeTeste = {
  'GET /api/chat/grupos': () =>
    Response.json({
      itens: [
        { id: FINANCEIRO, nome: 'Financeiro' },
        { id: TI, nome: 'TI' },
      ],
    }),
};

/** A Equipe Compras, do grupo Compras, que foi inativado depois. */
const DO_GRUPO_INATIVO: EquipeOuCanal = {
  id: EQUIPE_COMPRAS,
  tipo: 'equipe',
  nome: 'Equipe Compras',
  grupo: { id: COMPRAS, nome: 'Compras', ativo: false },
  escreve: null,
  avisar: false,
  arquivada: false,
};

const linhaDe = async (nome: string) =>
  (
    await within(await screen.findByRole('grid', { name: 'Equipes e canais' })).findByText(nome)
  ).closest('[role="row"]') as HTMLElement;

describe('as equipes e os canais na casca', () => {
  it('quem só configura o chat abre o Chat do dock nas Equipes e canais, sem a moldura do chat', async () => {
    const roteador = abrir('/conversas', ['chat.configurar'], {
      ...GRUPOS,
      'GET /api/chat/equipes-e-canais': () => Response.json({ itens: [] }),
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Equipes e canais' })).toBeTruthy();
    expect(roteador.state.location.pathname).toBe('/conversas/equipes-e-canais');
    expect(screen.queryByRole('navigation', { name: 'Vistas do chat' })).toBeNull();
    expect(screen.queryByText('Você não tem acesso ao chat.')).toBeNull();
    expect(
      within(await screen.findByRole('navigation', { name: 'Dock' }))
        .getByRole('button', { name: 'Chat' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('quem usa o chat sem configurá-lo vê, nas Equipes e canais, que não tem acesso, sem pedir a lista', async () => {
    let pedidos = 0;
    abrir('/conversas/equipes-e-canais', ['chat.usar'], {
      'GET /api/chat/equipes-e-canais': () => {
        pedidos += 1;
        return Response.json({ itens: [] });
      },
    });
    expect(await screen.findByText('Você não tem acesso às equipes e aos canais.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Equipes e canais' })).toBeTruthy();
    expect(pedidos).toBe(0);
  });

  it('Criar a equipe: "Nova equipe", o nome e o grupo Financeiro, e salvar avisa e põe a linha', async () => {
    let itens: EquipeOuCanal[] = [];
    let pedido: unknown = null;
    abrir('/conversas/equipes-e-canais', ['chat.configurar'], {
      ...GRUPOS,
      'GET /api/chat/equipes-e-canais': () => Response.json({ itens }),
      'POST /api/chat/equipes-e-canais': async (requisicao) => {
        pedido = await requisicao.json();
        const criada: EquipeOuCanal = {
          id: EQUIPE_FINANCEIRO,
          tipo: 'equipe',
          nome: 'Equipe Financeiro',
          grupo: { id: FINANCEIRO, nome: 'Financeiro', ativo: true },
          escreve: null,
          avisar: false,
          arquivada: false,
        };
        itens = [criada];
        return Response.json(criada, { status: 201 });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Nova equipe' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Nova equipe' });
    fireEvent.change(within(gaveta).getByRole('textbox', { name: /^Nome/ }), {
      target: { value: 'Equipe Financeiro' },
    });
    fireEvent.click(await within(gaveta).findByRole('button', { name: /Grupo da equipe/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Financeiro' }));
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(avisos()).toContain('Equipe Financeiro criada.'));
    expect(pedido).toEqual({
      nome: 'Equipe Financeiro',
      tipo: 'equipe',
      grupoId: FINANCEIRO,
      quemEscreve: 'todos',
      escreveGrupoId: null,
      avisar: false,
    });
    const linha = await linhaDe('Equipe Financeiro');
    expect(within(linha).getByText('Equipe')).toBeTruthy();
    expect(within(linha).getByText('Financeiro')).toBeTruthy();
    expect(within(linha).getByText('Ativo')).toBeTruthy();
  });

  it('na alteração, o grupo gravado inativo aparece como o escolhido, com "(inativo)", e fica ao salvar', async () => {
    let pedido: unknown = null;
    abrir('/conversas/equipes-e-canais', ['chat.configurar'], {
      ...GRUPOS,
      'GET /api/chat/equipes-e-canais': () => Response.json({ itens: [DO_GRUPO_INATIVO] }),
      [`PUT /api/chat/equipes-e-canais/${EQUIPE_COMPRAS}`]: async (requisicao) => {
        pedido = await requisicao.json();
        return Response.json({ ...DO_GRUPO_INATIVO, nome: 'Compras e Suprimentos' });
      },
    });
    const linha = await linhaDe('Equipe Compras');
    expect(within(linha).getByText('Compras (inativo)')).toBeTruthy();
    fireEvent.click(within(linha).getByText('Equipe Compras'));
    const gaveta = await screen.findByRole('dialog', { name: 'Equipe Compras' });
    expect(
      (await within(gaveta).findByRole('button', { name: /Grupo da equipe/ })).textContent,
    ).toContain('Compras (inativo)');
    fireEvent.change(within(gaveta).getByRole('textbox', { name: /^Nome/ }), {
      target: { value: 'Compras e Suprimentos' },
    });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(avisos()).toContain('Compras e Suprimentos salva.'));
    expect(pedido).toEqual({
      nome: 'Compras e Suprimentos',
      tipo: 'equipe',
      grupoId: COMPRAS,
      quemEscreve: 'todos',
      escreveGrupoId: null,
      avisar: false,
    });
  });
});
