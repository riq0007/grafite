import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../sessao/useAcesso.ts';
import { noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';

// O Início do Operação (spec modulo-operacao, "Início do Operação" e "Operação no dock"; change
// redesenho-da-interface, design, decisão 4): o endereço do módulo mostra as ações principais em
// blocos, conforme as permissões, e os atalhos para as listas.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const VAZIO = { itens: [], total: 0, proximo: null };

const servidor: ServidorDeTeste = {
  'GET /api/consumiveis': () => Response.json({ ...VAZIO, permite: { cadastrar: false } }),
  'GET /api/estoque/saldos': () => Response.json({ ...VAZIO, permite: { movimentar: true } }),
  'GET /api/solicitacoes': () => Response.json(VAZIO),
  'GET /api/ordens': () => Response.json(VAZIO),
  'GET /api/locais': () => Response.json({ locais: [] }),
  'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
};

function abrir(permissoes: PermissaoDaSessao[]) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/operacao'] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const bloco = (nome: string) => screen.queryByRole('link', { name: new RegExp(`^${nome}`) });

describe('o Início do Operação', () => {
  it('Almoxarife sem os consumíveis: o Operação abre no Início, com a entrada no estoque', async () => {
    const roteador = abrir(naOrganizacao('estoque.movimentar'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Operação' })).toBeTruthy();
    expect(roteador.state.location.pathname).toBe('/operacao');
    expect(bloco('Entrada no estoque')).toBeTruthy();
    expect(bloco('Pedido de toner')).toBeNull();
    expect(bloco('Nova ordem de serviço')).toBeNull();
  });

  it('Pedido de toner pelo Início: abre as Solicitações com o formulário do toner', async () => {
    const roteador = abrir(naOrganizacao('solicitacoes.atender', 'solicitacoes.ver'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Operação' })).toBeTruthy();
    expect(bloco('Conserto')).toBeTruthy();
    expect(bloco('Equipamento')).toBeTruthy();
    bloco('Pedido de toner')?.click();
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/solicitacoes'));
    expect(roteador.state.location.search).toMatchObject({ nova: 'toner' });
  });

  it('Técnico só das OS: o Início tem a nova ordem de serviço', async () => {
    abrir(naOrganizacao('ordens.atender', 'ordens.ver'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Operação' })).toBeTruthy();
    expect(bloco('Nova ordem de serviço')?.getAttribute('href')).toBe('/operacao/ordens?nova=true');
    expect(bloco('Pedido de toner')).toBeNull();
  });

  it('Quem só vê as OS: o atalho das Ordens de serviço, sem o bloco da nova', async () => {
    abrir(naOrganizacao('ordens.ver'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Operação' })).toBeTruthy();
    const atalhos = screen.getByRole('navigation', { name: 'Listas do Operação' });
    expect(within(atalhos).getByRole('link', { name: /^Ordens de serviço/ })).toBeTruthy();
    expect(within(atalhos).queryByRole('link', { name: /^Estoque/ })).toBeNull();
    expect(bloco('Nova ordem de serviço')).toBeNull();
  });

  it('Conta sem a permissão: o endereço diz que ela não tem acesso à Operação', async () => {
    abrir(naOrganizacao('ativos.ver'));
    expect(await screen.findByText('Você não tem acesso à Operação.')).toBeTruthy();
  });
});
