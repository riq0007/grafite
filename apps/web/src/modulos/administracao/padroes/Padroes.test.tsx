import { type AjustesDasPreferencias, aplicarMudanca } from '@grafite/domain';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { CONTA_DE_EXEMPLO, naOrganizacao, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
  for (const nome of [...document.documentElement.getAttributeNames()]) {
    document.documentElement.removeAttribute(nome);
  }
});

/**
 * Abre o app no endereço, com os padrões gravados na organização. O servidor grava os pedidos de
 * mudança como a API (merge patch) e devolve os padrões no estado da sessão.
 */
async function abrir(
  endereco = '/administracao/padroes',
  {
    padroes = {},
    permissoes = naOrganizacao('organizacao.editar'),
  }: { padroes?: AjustesDasPreferencias; permissoes?: PermissaoDaSessao[] } = {},
) {
  noComputador();
  const servidor = { padroes, gravacoes: [] as unknown[] };
  const loja = sessaoAtiva(permissoes, {
    'GET /api/sessao': () =>
      Response.json({
        organizacao: { nome: 'Empresa de exemplo', preferencias: servidor.padroes },
        sessao: {
          conta: CONTA_DE_EXEMPLO,
          pendencia: null,
          csrf: 'csrf-de-teste',
          expiraEm: '2099-01-01T00:00:00.000Z',
          acesso: { permissoes },
        },
      }),
    'PATCH /api/organizacao/padroes': async (pedido) => {
      const corpo = await pedido.json();
      servidor.gravacoes.push(corpo);
      servidor.padroes = aplicarMudanca(servidor.padroes, corpo.mudancas);
      return Response.json(servidor.padroes);
    },
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  });
  await loja.validar();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={loja}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  await screen.findByRole('heading', { level: 1, name: 'Padrões' });
  return { roteador, servidor };
}

const abas = () => screen.getByRole('tablist', { name: 'Seções dos padrões' });
const aba = (nome: string) => within(abas()).getByRole('tab', { name: nome });
const opcao = (grupo: string, nome: string) =>
  within(screen.getByRole('radiogroup', { name: grupo })).getByRole('radio', {
    name: nome,
  }) as HTMLInputElement;
const botao = (nome: string) => screen.getByRole('button', { name: nome });
const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

describe('tela de padrões', () => {
  it('mostra as seções em abas, na ordem dos Ajustes, cada uma com o próprio endereço', async () => {
    const { roteador } = await abrir();
    expect(roteador.state.location.pathname).toBe('/administracao/padroes/aparencia');
    expect(
      within(abas())
        .getAllByRole('tab')
        .map((uma) => uma.textContent),
    ).toEqual([
      'Aparência',
      'Dock',
      'Cursor',
      'Notificações',
      'Tabelas',
      'Idioma e região',
      'Acessibilidade',
    ]);
    expect(aba('Aparência').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(aba('Dock'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/padroes/dock'),
    );
    expect(await screen.findByRole('radiogroup', { name: 'Posição' })).toBeTruthy();
  });

  it('o endereço de uma seção abre a aba dela', async () => {
    await abrir('/administracao/padroes/notificacoes');
    expect(aba('Notificações').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('radiogroup', { name: 'Tempo do aviso' })).toBeTruthy();
  });

  it('diz que os padrões valem para quem não mudou o ajuste nos próprios Ajustes', async () => {
    await abrir();
    expect(
      screen.getByText(
        'Os padrões valem para quem não mudou o ajuste nos próprios Ajustes do Sistema.',
      ),
    ).toBeTruthy();
  });

  it('as mudanças ficam no rascunho, com a contagem, até "Salvar padrões"', async () => {
    const { servidor } = await abrir();
    expect(screen.getByText('Nenhuma mudança para salvar.')).toBeTruthy();
    expect(botao('Salvar padrões').hasAttribute('disabled')).toBe(true);

    fireEvent.click(opcao('Tema', 'Névoa'));
    expect(screen.getByText('1 ajuste mudou.')).toBeTruthy();
    fireEvent.click(opcao('Destaque', 'Laranja'));
    expect(screen.getByText('2 ajustes mudaram.')).toBeTruthy();
    expect(servidor.gravacoes).toEqual([]);

    fireEvent.click(botao('Salvar padrões'));
    await waitFor(() => expect(avisos()).toContain('Padrões salvos.'));
    expect(servidor.gravacoes).toEqual([
      { mudancas: { aparencia: { tema: 'nevoa', destaque: 'laranja' } } },
    ]);
    expect(await screen.findByText('Nenhuma mudança para salvar.')).toBeTruthy();
    expect(opcao('Tema', 'Névoa').checked).toBe(true);
  });

  it('"Descartar" volta ao que está gravado', async () => {
    const { servidor } = await abrir('/administracao/padroes', {
      padroes: { aparencia: { tema: 'papel' } },
    });
    expect(opcao('Tema', 'Papel').checked).toBe(true);
    fireEvent.click(opcao('Tema', 'Névoa'));
    fireEvent.click(botao('Descartar'));
    expect(opcao('Tema', 'Papel').checked).toBe(true);
    expect(screen.getByText('Nenhuma mudança para salvar.')).toBeTruthy();
    expect(servidor.gravacoes).toEqual([]);
  });

  it('a casca de quem edita não muda antes de salvar, e a prévia mostra o rascunho', async () => {
    await abrir();
    const casca = document.documentElement.getAttribute('data-accent');
    fireEvent.click(opcao('Destaque', 'Laranja'));
    expect(opcao('Destaque', 'Laranja').checked).toBe(true);
    expect(document.documentElement.getAttribute('data-accent')).toBe(casca);
  });

  it('"Restaurar padrões de fábrica" também fica no rascunho até salvar', async () => {
    const { servidor } = await abrir('/administracao/padroes/dock', {
      padroes: { dock: { posicao: 'esquerda', tamanho: 36 } },
    });
    expect(opcao('Posição', 'À esquerda').checked).toBe(true);
    fireEvent.click(botao('Restaurar padrões de fábrica'));
    expect(opcao('Posição', 'Embaixo').checked).toBe(true);
    expect(screen.getByText('2 ajustes mudaram.')).toBeTruthy();
    expect(servidor.gravacoes).toEqual([]);
    fireEvent.click(botao('Salvar padrões'));
    await waitFor(() => expect(servidor.gravacoes).toHaveLength(1));
    expect(servidor.gravacoes[0]).toEqual({
      mudancas: {
        dock: { posicao: null, tamanho: null, ampliar: null, ocultar: null, modulos: null },
      },
    });
  });

  it('trocar de aba não pede confirmação, e o rascunho continua', async () => {
    const { roteador } = await abrir();
    fireEvent.click(opcao('Tema', 'Névoa'));
    fireEvent.click(aba('Dock'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/padroes/dock'),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('1 ajuste mudou.')).toBeTruthy();
  });

  it('sair com mudanças pede confirmação, e nada é gravado sem "Salvar padrões"', async () => {
    const { roteador, servidor } = await abrir();
    fireEvent.click(opcao('Tema', 'Névoa'));

    act(() => void roteador.navigate({ to: '/administracao/pessoas' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Descartar as mudanças nos padrões?',
    });
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Continuar editando' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(roteador.state.location.pathname).toBe('/administracao/padroes/aparencia');
    expect(screen.getByText('1 ajuste mudou.')).toBeTruthy();

    act(() => void roteador.navigate({ to: '/administracao/pessoas' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Descartar mudanças',
      }),
    );
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/administracao/pessoas'));
    expect(servidor.gravacoes).toEqual([]);
  });

  it('sem organizacao.editar, a tela diz a quem pedir acesso', async () => {
    noComputador();
    const roteador = criarRoteador(
      createMemoryHistory({ initialEntries: ['/administracao/padroes'] }),
    );
    render(
      <App
        roteador={roteador}
        sessao={sessaoAtiva(naOrganizacao('pessoas.ver'), {
          'GET /api/acesso/administradores': () =>
            Response.json({ administradores: ['Ana Souza'] }),
        })}
      />,
    );
    expect(await screen.findByText('Você não tem acesso a Padrões.')).toBeTruthy();
  });
});
