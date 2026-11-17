import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../sessao/useAcesso.ts';
import { noCelular, noComputador } from '../../teste/postura.ts';
import { naOrganizacao, sessaoAtiva } from '../../teste/sessao.ts';

// Os endereços dos chamados (spec modulo-chamados, "Chamados no dock" e "Telas atualizadas e
// módulo desligado"; change chamados-da-ti, design, decisão 14, "O módulo na casca"): o endereço
// do módulo fica no Início para quem vê os chamados e leva aos Tipos de chamado quem só configura;
// cada tela diz a quem não tem a permissão dela que não tem acesso, e a quem pedir; com o módulo
// desligado, as telas dizem que ele está desligado.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

function abrir(
  endereco: string,
  permissoes: PermissaoDaSessao[],
  {
    modulosDesligados = [],
    celular = false,
  }: { modulosDesligados?: string[]; celular?: boolean } = {},
) {
  if (celular) noCelular();
  else noComputador();
  const administradores = vi.fn(() => Response.json({ administradores: ['Ana Souza'] }));
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(
        permissoes,
        { 'GET /api/acesso/administradores': administradores },
        {},
        {},
        { modulosDesligados },
      )}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const titulo = (nome: string) => screen.findByRole('heading', { level: 1, name: nome });

const rotulos = (lugar: HTMLElement) =>
  within(lugar)
    .getAllByRole('button')
    .map((botao) => botao.getAttribute('aria-label'));

describe('os endereços dos chamados', () => {
  it('quem vê os chamados fica no Início dos chamados', async () => {
    const roteador = abrir('/chamados', naOrganizacao('chamados.ver'));
    expect(await titulo('Chamados')).toBeTruthy();
    expect(roteador.state.location.pathname).toBe('/chamados');
    expect(screen.queryByText(/Você não tem acesso/)).toBeNull();
    cleanup();
    // Quem atende e configura também fica no Início: os Tipos são só de quem não vê os chamados.
    const doQueConfigura = abrir(
      '/chamados',
      naOrganizacao('chamados.atender', 'chamados.configurar'),
    );
    expect(await titulo('Chamados')).toBeTruthy();
    expect(doQueConfigura.state.location.pathname).toBe('/chamados');
    cleanup();
    // A ação da busca leva ao Início com o ?abrir=1, que abre a gaveta (tarefa 5.18).
    const pelaBusca = abrir('/chamados?abrir=1', naOrganizacao('chamados.atender'));
    expect(await titulo('Chamados')).toBeTruthy();
    expect(pelaBusca.state.location.pathname).toBe('/chamados');
  });

  it('Quem só configura: o endereço do módulo leva aos Tipos de chamado, sem o Início no histórico', async () => {
    const roteador = abrir('/chamados', naOrganizacao('chamados.configurar'));
    expect(await titulo('Tipos de chamado')).toBeTruthy();
    expect(roteador.state.location.pathname).toBe('/chamados/tipos');
    expect(roteador.history.length).toBe(1);
  });

  it('sem nenhuma permissão dos chamados, o endereço do módulo diz que não há acesso e a quem pedir', async () => {
    abrir('/chamados', naOrganizacao('ativos.ver'));
    expect(await titulo('Chamados')).toBeTruthy();
    expect(screen.getByText('Você não tem acesso aos chamados.')).toBeTruthy();
    expect(await screen.findByText('Peça acesso a Ana Souza.')).toBeTruthy();
  });

  it('cada tela de ver tem o título dela, e quem só configura lê que não tem acesso aos chamados', async () => {
    for (const [endereco, nome] of [
      ['/chamados/quem-esta-com-o-que', 'Quem está com o quê'],
      ['/chamados/prazos', 'Prazos'],
    ] as const) {
      abrir(endereco, naOrganizacao('chamados.atender'));
      expect(await titulo(nome)).toBeTruthy();
      expect(screen.queryByText(/Você não tem acesso/)).toBeNull();
      cleanup();
      abrir(endereco, naOrganizacao('chamados.configurar'));
      expect(await titulo(nome)).toBeTruthy();
      expect(screen.getByText('Você não tem acesso aos chamados.')).toBeTruthy();
      cleanup();
    }
  });

  it('cada tela de configurar tem o título dela, e quem não configura lê que não tem acesso a ela', async () => {
    for (const [endereco, nome, semAcesso] of [
      ['/chamados/tipos', 'Tipos de chamado', 'Você não tem acesso aos tipos de chamado.'],
      [
        '/chamados/respostas-prontas',
        'Respostas prontas',
        'Você não tem acesso às respostas prontas.',
      ],
      ['/chamados/horario', 'Horário da TI', 'Você não tem acesso ao horário da TI.'],
    ] as const) {
      abrir(endereco, naOrganizacao('chamados.configurar'));
      expect(await titulo(nome)).toBeTruthy();
      expect(screen.queryByText(/Você não tem acesso/)).toBeNull();
      cleanup();
      abrir(endereco, naOrganizacao('chamados.atender'));
      expect(await titulo(nome)).toBeTruthy();
      expect(screen.getByText(semAcesso)).toBeTruthy();
      cleanup();
    }
  });

  it('com o módulo desligado, a tela diz que ele está desligado, e o dock fica sem ele', async () => {
    abrir('/chamados/prazos', naOrganizacao('chamados.atender'), {
      modulosDesligados: ['chamados'],
    });
    expect(await titulo('Chamados')).toBeTruthy();
    expect(screen.getByText('O módulo Chamados está desligado nesta organização.')).toBeTruthy();
    expect(rotulos(await screen.findByRole('navigation', { name: 'Dock' }))).toEqual([
      'Início',
      'Ajustes',
    ]);
  });

  it('com o módulo ligado, o dock começa pelo Chamados', async () => {
    abrir('/chamados', naOrganizacao('chamados.atender'));
    expect(await titulo('Chamados')).toBeTruthy();
    await waitFor(() =>
      expect(rotulos(screen.getByRole('navigation', { name: 'Dock' }))).toEqual([
        'Chamados',
        'Início',
        'Ajustes',
      ]),
    );
  });

  it('No celular: o Chamados vem antes do Início, e a conta com um módulo do "Mais" tem os Ajustes nele', async () => {
    const daTi = ['chamados.atender', 'ativos.ver', 'alertas.ver'] as const;
    abrir('/chamados', naOrganizacao(...daTi, 'ordens.atender'), { celular: true });
    const abas = await screen.findByRole('navigation', { name: 'Módulos' });
    expect(rotulos(abas)).toEqual(['Chamados', 'Início', 'Ativos', 'Alertas', 'Mais']);
    fireEvent.click(within(abas).getByRole('button', { name: 'Mais' }));
    const mais = await screen.findByRole('dialog', { name: 'Mais' });
    expect(
      within(mais)
        .getAllByRole('button')
        .map((item) => item.textContent),
    ).toEqual(expect.arrayContaining(['Operação', 'Ajustes']));
    cleanup();
    // Sem nenhum módulo do "Mais", as cinco abas cabem, com os Ajustes.
    abrir('/chamados', naOrganizacao(...daTi), { celular: true });
    expect(rotulos(await screen.findByRole('navigation', { name: 'Módulos' }))).toEqual([
      'Chamados',
      'Início',
      'Ativos',
      'Alertas',
      'Ajustes',
    ]);
  });
});
