import { createMemoryHistory, createRoute, type HistoryLocation } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Box } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { REGISTRO } from '../modulos/registro.ts';
import { definirModulo, type ModuloRegistrado } from '../modulos/tipos.ts';
import { criarRoteador } from '../rotas/arvore.ts';
import { raiz } from '../rotas/raiz.tsx';
import { criarLojaDaSessao, type LojaDaSessao } from '../sessao/loja.ts';
import { bloquearArmazenamento } from '../teste/armazenamento.ts';
import {
  CONTA_DE_EXEMPLO,
  naOrganizacao,
  sessaoAtiva,
  sessaoDesconhecida,
} from '../teste/sessao.ts';
import { destinoAoEntrar } from './primeiraTela.ts';

// A primeira tela ao entrar (spec modulo-chamados, "Primeira tela ao entrar"; change chamados-da-ti,
// design, decisão 14): só na primeira carga de cada aba, a raiz pura leva ao Início dos chamados a
// conta que os vê, com o módulo ligado; a marca da aba, com a conta, faz o recarregar ficar onde
// estava.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const ATENDE = naOrganizacao('chamados.atender');
const rotasDoSem = createRoute({ getParentRoute: () => raiz, path: '/sem' });
const rotasDoPrimeiro = createRoute({ getParentRoute: () => raiz, path: '/primeiro' });
const rotasDoSegundo = createRoute({ getParentRoute: () => raiz, path: '/segundo' });
const RAIZ: Pick<HistoryLocation, 'pathname' | 'search' | 'hash'> = {
  pathname: '/',
  search: '',
  hash: '',
};

describe('destinoAoEntrar', () => {
  const destino = (
    sessao: LojaDaSessao,
    {
      local = RAIZ,
      marca = null,
      modulos = REGISTRO,
    }: {
      local?: Pick<HistoryLocation, 'pathname' | 'search' | 'hash'>;
      marca?: string | null;
      modulos?: readonly ModuloRegistrado[];
    } = {},
  ) => destinoAoEntrar({ sessao, modulos, local, marca });

  it('leva da raiz ao Início dos chamados quem os vê e quem os atende', () => {
    expect(destino(sessaoAtiva(naOrganizacao('chamados.ver')))).toBe('/chamados');
    expect(destino(sessaoAtiva(ATENDE))).toBe('/chamados');
  });

  it('deixa no Início quem só configura, quem não tem os chamados e quem os tem desligados', () => {
    expect(destino(sessaoAtiva(naOrganizacao('chamados.configurar')))).toBeNull();
    expect(destino(sessaoAtiva(naOrganizacao('ativos.ver')))).toBeNull();
    const desligado = sessaoAtiva(ATENDE, {}, {}, {}, { modulosDesligados: ['chamados'] });
    expect(destino(desligado)).toBeNull();
  });

  it('só troca a raiz pura: outro endereço, a busca e a âncora ficam', () => {
    const sessao = sessaoAtiva(ATENDE);
    expect(destino(sessao, { local: { ...RAIZ, pathname: '/ativos' } })).toBeNull();
    expect(destino(sessao, { local: { ...RAIZ, search: '?foco=conteudo' } })).toBeNull();
    expect(destino(sessao, { local: { ...RAIZ, hash: '#conteudo' } })).toBeNull();
  });

  it('com a marca da conta, fica no Início; com a de outra conta, troca', () => {
    const sessao = sessaoAtiva(ATENDE);
    expect(destino(sessao, { marca: CONTA_DE_EXEMPLO.usuario })).toBeNull();
    expect(destino(sessao, { marca: 'bruno.lima' })).toBe('/chamados');
  });

  it('com a sessão desconhecida, fica no Início', () => {
    expect(destino(criarLojaDaSessao({ estado: { tipo: 'desconhecida' } }))).toBeNull();
  });

  it('vale o primeiro módulo da conta que declara a primeira tela, com a permissão dela', () => {
    const sem = definirModulo({
      id: 'sem',
      nome: 'Sem',
      icone: Box,
      endereco: '/sem',
      prioridadeNoCelular: 1,
      rotas: rotasDoSem,
    });
    const primeiro = definirModulo({
      id: 'primeiro',
      nome: 'Primeiro',
      icone: Box,
      endereco: '/primeiro',
      prioridadeNoCelular: 2,
      rotas: rotasDoPrimeiro,
      primeiraTela: { permissoes: ['ativos.ver'] },
    });
    const segundo = definirModulo({
      id: 'segundo',
      nome: 'Segundo',
      icone: Box,
      endereco: '/segundo',
      prioridadeNoCelular: 3,
      rotas: rotasDoSegundo,
      primeiraTela: { permissoes: ['chamados.ver'] },
    });
    const modulos = [sem, primeiro, segundo];
    const comAsDuas = sessaoAtiva(naOrganizacao('ativos.ver', 'chamados.ver'));
    expect(destino(comAsDuas, { modulos })).toBe('/primeiro');
    expect(destino(sessaoAtiva(naOrganizacao('chamados.ver')), { modulos })).toBe('/segundo');
  });
});

describe('a primeira tela ao entrar', () => {
  function abrir(endereco: string, sessao: LojaDaSessao) {
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
    render(<App roteador={roteador} sessao={sessao} />);
    return roteador;
  }

  const titulo = (nome: string) => screen.findByRole('heading', { level: 1, name: nome });
  const dock = () => screen.findByRole('navigation', { name: 'Dock' });
  /** O tempo de uma troca que viesse depois da tela aparecer. */
  const umInstante = () => new Promise((resolver) => setTimeout(resolver, 50));

  /** Ana entra pela raiz, vai aos chamados e escolhe o Início no dock. */
  async function entrarEVoltarAoInicio(sessao: LojaDaSessao = sessaoAtiva(ATENDE)) {
    const roteador = abrir('/', sessao);
    await titulo('Chamados');
    fireEvent.click(within(await dock()).getByRole('button', { name: 'Início' }));
    await titulo('O que resolver agora');
    return roteador;
  }

  it('Ana, que atende os chamados, entra pela raiz e vê o Início dos chamados', async () => {
    const roteador = abrir('/', sessaoAtiva(ATENDE));
    await titulo('Chamados');
    expect(roteador.state.location.pathname).toBe('/chamados');
    // A troca toma o lugar da raiz: o voltar do navegador não leva a ela.
    expect(roteador.history.length).toBe(1);
  });

  it('a troca vem antes da primeira carga: o roteador não começa pela raiz', async () => {
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }));
    const carregados: string[] = [];
    roteador.subscribe('onBeforeLoad', ({ toLocation }) => carregados.push(toLocation.pathname));
    render(<App roteador={roteador} sessao={sessaoAtiva(ATENDE)} />);
    await titulo('Chamados');
    expect(carregados).toContain('/chamados');
    expect(carregados).not.toContain('/');
  });

  it('a troca faz parte da abertura: o foco fica onde estava, para o primeiro Tab', async () => {
    abrir('/', sessaoAtiva(ATENDE));
    await titulo('Chamados');
    await umInstante();
    expect(document.activeElement).toBe(document.body);
  });

  it('escolher o Início no dock abre o Início, sem voltar aos chamados', async () => {
    const roteador = await entrarEVoltarAoInicio();
    await umInstante();
    expect(roteador.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'O que resolver agora' })).toBeTruthy();
  });

  it('recarregar no Início mantém o Início', async () => {
    await entrarEVoltarAoInicio();
    cleanup();
    const recarregado = abrir('/', sessaoAtiva(ATENDE));
    await titulo('O que resolver agora');
    await umInstante();
    expect(recarregado.state.location.pathname).toBe('/');
  });

  it('uma aba nova, sem a marca da outra, abre no Início dos chamados', async () => {
    await entrarEVoltarAoInicio();
    cleanup();
    // Cada aba tem o próprio sessionStorage.
    sessionStorage.clear();
    const abaNova = abrir('/', sessaoAtiva(ATENDE));
    await titulo('Chamados');
    expect(abaNova.state.location.pathname).toBe('/chamados');
  });

  it('outra conta que entra na mesma aba tem a primeira tela dela', async () => {
    await entrarEVoltarAoInicio();
    cleanup();
    const bruno = sessaoAtiva(ATENDE, {}, {}, { usuario: 'bruno.lima', nome: 'Bruno Lima' });
    const roteador = abrir('/', bruno);
    await titulo('Chamados');
    expect(roteador.state.location.pathname).toBe('/chamados');
  });

  it.each([
    ['Paula, sem nenhuma permissão dos chamados', sessaoAtiva()],
    ['quem só configura os chamados', sessaoAtiva(naOrganizacao('chamados.configurar'))],
    [
      'quem atende, com o módulo desligado',
      sessaoAtiva(ATENDE, {}, {}, {}, { modulosDesligados: ['chamados'] }),
    ],
  ])('%s entra no Início', async (_quem, sessao) => {
    const roteador = abrir('/', sessao);
    await titulo('O que resolver agora');
    await umInstante();
    expect(roteador.state.location.pathname).toBe('/');
  });

  it('um endereço salvo abre nele, e a aba fica marcada: a raiz depois fica no Início', async () => {
    const roteador = abrir('/ajustes', sessaoAtiva(ATENDE));
    await titulo('Aparência');
    expect(roteador.state.location.pathname).toBe('/ajustes');
    cleanup();
    const depois = abrir('/', sessaoAtiva(ATENDE));
    await titulo('O que resolver agora');
    await umInstante();
    expect(depois.state.location.pathname).toBe('/');
  });

  it('sem resposta do servidor, a casca fica no Início, também quando ele volta', async () => {
    const sessao = sessaoDesconhecida(ATENDE);
    const roteador = abrir('/', sessao);
    await titulo('O que resolver agora');
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(sessao.ler().tipo).toBe('ativa'));
    await umInstante();
    expect(roteador.state.location.pathname).toBe('/');
    sessao.parar();
    cleanup();
    // A sessão que ficou conhecida marcou a aba: recarregar mantém o Início.
    const recarregado = abrir('/', sessaoAtiva(ATENDE));
    await titulo('O que resolver agora');
    await umInstante();
    expect(recarregado.state.location.pathname).toBe('/');
  });

  it('sem o sessionStorage, a raiz leva aos chamados a cada carga, sem erro', async () => {
    bloquearArmazenamento({ leitura: true, qual: 'sessionStorage' });
    await entrarEVoltarAoInicio();
    cleanup();
    const recarregado = abrir('/', sessaoAtiva(ATENDE));
    await titulo('Chamados');
    expect(recarregado.state.location.pathname).toBe('/chamados');
  });
});
