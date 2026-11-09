// O módulo Painéis (spec modulo-paineis; change painel-de-dashboards): o menu pelas permissões, a
// grade adaptativa com a situação de cada painel, o expandir e o Esc, o "Verificar agora" e a tela
// sem permissão.
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../sessao/useAcesso.ts';
import { noCelular, noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';
import { itensPermitidos } from '../registroDaConta.ts';
import { paineis } from './modulo.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Painel = components['schemas']['Painel'];

const painel = (numero: number, mudancas: Partial<Painel> = {}): Painel => ({
  id: `0199d3a0-0000-7000-8000-00000000000${numero}`,
  nome: `Painel ${numero}`,
  endereco: `http://10.0.5.2${numero}:3000`,
  local: null,
  ordem: numero,
  situacao: 'ativo',
  verificacao: {
    situacao: 'no-ar',
    momento: '2026-10-28T10:00:00.000Z',
    tempoDaResposta: 40,
    motivo: null,
  },
  ...mudancas,
});

const TRES = [
  painel(1),
  painel(2, {
    verificacao: {
      situacao: 'fora-do-ar',
      momento: '2026-10-28T10:00:00.000Z',
      tempoDaResposta: 5000,
      motivo: 'Sem resposta em 5 s',
    },
  }),
  painel(3),
];

function abrir(endereco: string, servidor: ServidorDeTeste, permissoes: PermissaoDaSessao[]) {
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
    />,
  );
  return roteador;
}

const comLista = (lista: Painel[], administrar = false): ServidorDeTeste => ({
  'GET /api/paineis': () => Response.json({ paineis: lista, permite: { administrar } }),
});

describe('o módulo Painéis', () => {
  it('Quem só vê os painéis: o menu mostra só Painéis', () => {
    const rotulos = (permissoes: string[]) =>
      itensPermitidos(paineis.menu ?? [], (chave: string) => permissoes.includes(chave)).map(
        (item) => item.rotulo,
      );
    expect(rotulos(['paineis.ver'])).toEqual(['Painéis']);
    expect(rotulos(['paineis.administrar'])).toEqual(['Painéis', 'Cadastro']);
  });

  // docs/ANTISLOP.md, seção 25: o estado vazio oferece a ação como as outras telas, num botão (change
  // um-destaque-por-tela, design, decisão 5).
  it('sem painéis, quem administra abre o cadastro por um botão', async () => {
    abrir('/paineis', comLista([], true), naOrganizacao('paineis.ver', 'paineis.administrar'));
    expect(await screen.findByRole('button', { name: 'Abrir o cadastro' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Abrir o cadastro' })).toBeNull();
  });

  it('Três painéis: lado a lado, com a situação em texto e o motivo de quem está fora do ar', async () => {
    abrir('/paineis', comLista(TRES), naOrganizacao('paineis.ver'));
    const segundo = await screen.findByRole('region', { name: 'Painel 2' });
    expect(within(segundo).getByText('Fora do ar')).toBeTruthy();
    expect(within(segundo).getByText(/Sem resposta em 5 s/)).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Painel 1' })).getByText('No ar'),
    ).toBeTruthy();
    const grade = segundo.parentElement as HTMLElement;
    expect(grade.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(grade.style.gridTemplateRows).toBe('repeat(1, minmax(0, 1fr))');
    expect(within(segundo).getByTitle('Painel 2').getAttribute('src')).toBe(
      `/api/paineis/${TRES[1]?.id}/exibicao`,
    );
    expect(within(segundo).getByTitle('Painel 2').getAttribute('sandbox')).not.toContain(
      'allow-same-origin',
    );
  });

  it('mantém o painel HTTPS e o link original do painel HTTP', async () => {
    abrir(
      '/paineis',
      comLista([painel(1), painel(2, { endereco: 'https://intranet.exemplo/painel' })]),
      naOrganizacao('paineis.ver'),
    );
    const primeiro = await screen.findByRole('region', { name: 'Painel 1' });
    expect(
      within(primeiro).getByRole('link', { name: 'Abrir em outra aba' }).getAttribute('href'),
    ).toBe('http://10.0.5.21:3000');
    expect(screen.getByTitle('Painel 2').getAttribute('src')).toBe(
      'https://intranet.exemplo/painel',
    );
    expect(screen.queryByText(/O navegador não mostra/)).toBeNull();
  });

  // Spec modulo-paineis, "Grade adaptativa" (change telas-no-celular, design, decisão 3).
  it('Três painéis no celular: um embaixo do outro, com a largura toda', async () => {
    noCelular();
    abrir('/paineis', comLista(TRES), naOrganizacao('paineis.ver'));
    const segundo = await screen.findByRole('region', { name: 'Painel 2' });
    const grade = segundo.parentElement as HTMLElement;
    expect(grade.style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))');
    expect(grade.style.gridTemplateRows).toMatch(/^repeat\(3, /);
  });

  it('Pelo mapa: o endereço abre o painel expandido, e Esc volta à grade', async () => {
    const roteador = abrir(
      `/paineis?expandido=${TRES[1]?.id}`,
      comLista(TRES),
      naOrganizacao('paineis.ver'),
    );
    expect(await screen.findByRole('region', { name: 'Painel 2' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Painel 1' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Painel 1' })).toBeTruthy());
    expect(roteador.state.location.search).toEqual({});
  });

  it('Verificar agora: o retorno diz a situação nova', async () => {
    const fora = TRES[1] as Painel;
    abrir(
      '/paineis/cadastro',
      {
        ...comLista(TRES, true),
        [`POST /api/paineis/${fora.id}/verificacao`]: () =>
          Response.json({ ...fora, verificacao: { ...fora.verificacao, situacao: 'no-ar' } }),
      },
      naOrganizacao('paineis.administrar', 'paineis.ver'),
    );
    const linha = (await screen.findByText('Painel 2')).closest('[role="row"]') as HTMLElement;
    fireEvent.click(within(linha).getByRole('button', { name: 'Verificar agora' }));
    expect(await screen.findByText('Painel verificado: No ar.')).toBeTruthy();
  });

  it('sem a permissão, a tela diz que a conta não tem acesso aos painéis', async () => {
    abrir('/paineis', comLista([]), naOrganizacao('ativos.ver'));
    expect(await screen.findByText('Você não tem acesso aos painéis.')).toBeTruthy();
  });
});
