import type { AjustesDasPreferencias } from '@grafite/domain';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarRoteador } from '../../rotas/arvore.ts';
import { sessaoAtiva } from '../../teste/sessao.ts';
import { ajustes } from './modulo.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Abre o app no endereço, com as preferências que a conta mudou. */
function abrir(endereco: string, preferencias: AjustesDasPreferencias = {}) {
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(<App roteador={roteador} sessao={sessaoAtiva([], {}, preferencias)} />);
  return roteador;
}

/** Postura computador: ponteiro fino, na largura padrão da janela de teste. */
function noComputador() {
  const original = window.matchMedia.bind(window);
  vi.stubGlobal('matchMedia', (consulta: string) => {
    const lista = original(consulta);
    if (consulta === '(pointer: fine)') Object.defineProperty(lista, 'matches', { value: true });
    return lista;
  });
}

/** Postura celular: janela de 390 px. */
function noCelular() {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
}

const titulo = (nome: string) => screen.findByRole('heading', { level: 1, name: nome });
const secoes = () => screen.getByRole('navigation', { name: 'Seções dos Ajustes' });

describe('Ajustes do Sistema', () => {
  it('abre a seção pelo endereço, escolhida na lista', async () => {
    noComputador();
    abrir('/ajustes/dock');
    await titulo('Dock');
    expect(within(secoes()).getByRole('link', { name: 'Dock' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      within(secoes())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Conta',
      'Aparência',
      'Dock',
      'Cursor',
      'Notificações',
      'Tabelas',
      'Idioma e região',
      'Acessibilidade',
    ]);
  });

  // Spec componentes-base, "Cabeçalho da página" (change cabecalhos-e-fichas, design, decisão 2):
  // a seção dos Ajustes tem a mesma linha embaixo do título que as telas dos outros módulos.
  it('cada seção abre com o título no cabeçalho da página', async () => {
    noComputador();
    const secoesDosAjustes: [string, string][] = [
      ['conta', 'Conta'],
      ['aparencia', 'Aparência'],
      ['dock', 'Dock'],
      ['cursor', 'Cursor'],
      ['notificacoes', 'Notificações'],
      ['tabelas', 'Tabelas'],
      ['idioma-e-regiao', 'Idioma e região'],
      ['acessibilidade', 'Acessibilidade'],
    ];
    for (const [endereco, nome] of secoesDosAjustes) {
      abrir(`/ajustes/${endereco}`);
      expect((await titulo(nome)).closest('[data-cabecalho-da-pagina]')).toBeTruthy();
      cleanup();
    }
  });

  it('o endereço de um ajuste abre a seção com o foco no controle dele', async () => {
    noComputador();
    abrir('/ajustes/dock?foco=tamanho-do-dock');
    await titulo('Dock');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('slider', { name: 'Tamanho' })),
    );
  });

  it('cada controle de Aparência, Dock e Acessibilidade tem um endereço com foco', async () => {
    noComputador();
    for (const [endereco, focos] of [
      ['/ajustes/aparencia', ['tema', 'destaque', 'cantos', 'densidade']],
      ['/ajustes/dock', ['posicao-do-dock', 'tamanho-do-dock', 'ampliar-o-dock', 'ocultar-o-dock']],
      ['/ajustes/acessibilidade', ['movimento', 'transparencia']],
    ] as const) {
      abrir(endereco);
      await screen.findByRole('heading', { level: 1 });
      const marcados = [...document.querySelectorAll('[data-foco]')].map((el) =>
        el.getAttribute('data-foco'),
      );
      expect(marcados, endereco).toEqual(focos);
      cleanup();
    }
  });

  // Abre o app uma vez por ajuste, mais de trinta vezes: com a suíte inteira rodando junto, passa
  // dos 5 s do Vitest.
  it('cada ajuste declarado na busca leva a um controle marcado na seção dele', {
    timeout: 30_000,
  }, async () => {
    noComputador();
    for (const entrada of ajustes.busca?.entradas ?? []) {
      if (!entrada.destino || !entrada.foco) continue;
      abrir(entrada.destino);
      await screen.findByRole('heading', { level: 1 });
      // Partes que dependem do servidor, como as da Conta, aparecem depois da leitura.
      await vi.waitFor(() =>
        expect(
          document.querySelector(`[data-foco="${entrada.foco}"]`),
          `${entrada.rotulo} → ${entrada.destino}?foco=${entrada.foco}`,
        ).not.toBeNull(),
      );
      cleanup();
    }
  });

  it('num grupo de rádios, o foco pelo endereço vai à opção escolhida', async () => {
    noComputador();
    abrir('/ajustes/aparencia?foco=tema', { aparencia: { tema: 'nevoa' } });
    await titulo('Aparência');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Névoa' })),
    );
  });

  it('no computador, o endereço de Ajustes mostra a primeira seção', async () => {
    noComputador();
    abrir('/ajustes');
    await titulo('Aparência');
    expect(
      within(secoes()).getByRole('link', { name: 'Aparência' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('escolher uma seção na lista troca a seção e leva o foco ao título', async () => {
    noComputador();
    const roteador = abrir('/ajustes/aparencia');
    await titulo('Aparência');
    fireEvent.click(within(secoes()).getByRole('link', { name: 'Acessibilidade' }));
    const novo = await titulo('Acessibilidade');
    await vi.waitFor(() => expect(document.activeElement).toBe(novo));
    expect(roteador.state.location.pathname).toBe('/ajustes/acessibilidade');
  });

  it('no celular, mostra primeiro só a lista de seções', async () => {
    noCelular();
    abrir('/ajustes');
    await titulo('Ajustes do Sistema');
    expect(within(secoes()).getAllByRole('link')).toHaveLength(8);
    expect(screen.queryByRole('heading', { level: 1, name: 'Aparência' })).toBeNull();
  });

  it('no celular, a seção aparece sozinha, com Voltar para a lista', async () => {
    noCelular();
    abrir('/ajustes');
    await titulo('Ajustes do Sistema');
    fireEvent.click(within(secoes()).getByRole('link', { name: 'Dock' }));
    await titulo('Dock');
    expect(screen.queryByRole('navigation', { name: 'Seções dos Ajustes' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Voltar' }));
    await titulo('Ajustes do Sistema');
    expect(secoes()).toBeTruthy();
  });
});
