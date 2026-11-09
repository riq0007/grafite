import { marcacaoDoCarregamento } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect, useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { criarClienteDeConsultas } from '../api/consultas.ts';
import { etapaDosAlertas } from '../notificacoes/etapa.ts';
import { ProvedorDePreferencias } from '../preferencias/usePreferencias.tsx';
import { criarRoteador } from '../rotas/arvore.ts';
import { etapaDaSessao } from '../sessao/etapa.ts';
import { criarLojaDaSessao, type LojaDaSessao } from '../sessao/loja.ts';
import { bloquearArmazenamento } from '../teste/armazenamento.ts';
import { type TelaDaChegada, useChegada } from './avisos.tsx';
import { chegar } from './chegar.tsx';
import {
  CARREGANDO_O_GRAFITE,
  type EtapaDaChegada,
  type SituacaoDoCarregamento,
} from './etapas.ts';
import { criarPrazoDoServidor } from './prazo.ts';

const ORGANIZACAO = { nome: 'Empresa' };
const SESSAO_ATIVA = {
  conta: { id: '0199a6e0-0000-7000-8000-0000000000c1', usuario: 'ana.souza', nome: 'Ana Souza' },
  pendencia: null,
  csrf: 'csrf',
  expiraEm: '2099-01-01T00:00:00.000Z',
  acesso: { permissoes: [] },
};
const comSessao = () => Response.json({ organizacao: ORGANIZACAO, sessao: SESSAO_ATIVA });
const semSessao = () => Response.json({ organizacao: ORGANIZACAO, sessao: null });

const lojas: LojaDaSessao[] = [];

/** Uma loja da sessão cujo servidor dá as respostas na ordem. */
function lojaQueResponde(...respostas: Array<() => Response | Promise<Response>>) {
  const loja = criarLojaDaSessao({
    buscar: async () => {
      const resposta = respostas.shift();
      if (!resposta) throw new Error('Sem resposta preparada.');
      return resposta();
    },
  });
  lojas.push(loja);
  return loja;
}

/**
 * As etapas que dependem do servidor, como no main.tsx: a sessão e os alertas, no mesmo prazo, com
 * a conexão de eventos já aberta.
 */
function etapasDoServidor(loja: LojaDaSessao): EtapaDaChegada[] {
  const prazo = criarPrazoDoServidor();
  return [
    etapaDaSessao(loja, prazo),
    etapaDosAlertas({
      loja,
      consultas: criarClienteDeConsultas({ esperaEntreTentativas: 0 }),
      conexao: { aberta: () => Promise.resolve() },
      prazo,
    }),
  ];
}

/** Em que estado da chegada cada tela de teste se desenhou. */
let desenhadas: Array<{ tela: TelaDaChegada; chegada: string | null }> = [];
/** O tema e o dock do <html> quando cada tela de teste se desenhou. */
let aparencias: Array<{ tema: string | null; dock: string | null }> = [];

function TelaDeTeste({ tela, children }: { tela: TelaDaChegada; children?: ReactNode }) {
  const { telaDesenhada } = useChegada();
  useEffect(() => {
    const raiz = document.documentElement;
    desenhadas.push({ tela, chegada: raiz.getAttribute('data-chegada') });
    aparencias.push({
      tema: raiz.getAttribute('data-theme'),
      dock: raiz.getAttribute('data-dock'),
    });
    telaDesenhada(tela);
  }, [tela, telaDesenhada]);
  return <main aria-label={tela === 'casca' ? 'Casca' : 'Entrada'}>{children}</main>;
}

/** Uma porta mínima, como a do App: a entrada sem sessão e a casca com ela, ou sem servidor. */
function PortaDeTeste({ loja }: { loja: LojaDaSessao }) {
  const sessao = useSyncExternalStore(loja.assinar, loja.ler);
  if (sessao.tipo === 'validando') return null;
  if (sessao.tipo === 'ativa' || sessao.tipo === 'desconhecida')
    return <TelaDeTeste tela="casca" />;
  return (
    <TelaDeTeste tela="entrada">
      <button type="button" onClick={() => void loja.entrar({ usuario: 'ana.souza', senha: 'x' })}>
        Entrar
      </button>
    </TelaDeTeste>
  );
}

beforeEach(() => {
  desenhadas = [];
  aparencias = [];
  document.body.innerHTML = `${marcacaoDoCarregamento({
    etapa: CARREGANDO_O_GRAFITE,
    progresso: 0,
    visivel: false,
  })}<div id="raiz"></div>`;
});

afterEach(() => {
  cleanup();
  for (const loja of lojas.splice(0)) loja.parar();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-chegada');
  localStorage.clear();
});

/** A marca de boas-vindas vistas, que o preparo dos testes grava antes de cada um. */
const MARCA_DAS_BOAS_VINDAS = 'grafite.chegada.boasVindas';

const camada = () => document.getElementById('chegada');

/** Uma navegação que começa agora: o relógio do processo de teste já passou dos 500 ms. */
const agora = () => performance.now();

interface OpcoesDoTeste {
  /** O app desenhado; o padrão é o de verdade, com uma sessão que vale. */
  app?: ReactNode;
  /** As etapas acrescentadas; com o app de verdade, o padrão é a validação da sessão dele. */
  etapas?: readonly EtapaDaChegada[];
  inicio?: number;
  agora?: () => number;
}

/** Começa a chegada, registrando cada situação e cada estado do <html>. */
function comecarAChegada({ app, etapas, ...relogio }: OpcoesDoTeste = {}) {
  // O app de verdade, com a sessão que a etapa valida.
  if (!app) {
    const loja = lojaQueResponde(comSessao);
    app = (
      <App roteador={criarRoteador(createMemoryHistory({ initialEntries: ['/'] }))} sessao={loja} />
    );
    etapas ??= etapasDoServidor(loja);
  }
  const situacoes: SituacaoDoCarregamento[] = [];
  const estados: Array<string | null> = [];
  const registrarEstado = () => {
    const estado = document.documentElement.getAttribute('data-chegada');
    if (estados.at(-1) !== estado) estados.push(estado);
  };
  const observador = new MutationObserver(registrarEstado);
  observador.observe(document.documentElement, { attributes: true });
  const chegada = chegar({
    app,
    desenhar: (elemento) => {
      render(elemento, { container: document.getElementById('raiz') as HTMLElement });
    },
    camada: camada(),
    etapas: etapas ?? [],
    aoMudar: (situacao) => situacoes.push(situacao),
    inicio: relogio.inicio ?? agora(),
    agora: relogio.agora ?? agora,
  });
  const terminada = chegada.then(() => {
    registrarEstado();
    observador.disconnect();
  });
  const etapasVistas = () =>
    situacoes.map((situacao) => situacao.etapa).filter((etapa, i, todas) => etapa !== todas[i - 1]);
  return { situacoes, etapas: etapasVistas, estados, terminada };
}

/** Chega com o app de verdade até o fim. */
async function chegarComOApp(relogio?: { inicio: number; agora: () => number }) {
  const chegada = comecarAChegada(relogio);
  await chegada.terminada;
  return { ...chegada, etapas: chegada.etapas() };
}

/** Chega com a porta de teste, ligada à loja. */
function chegarComAPorta(loja: LojaDaSessao, relogio: Omit<OpcoesDoTeste, 'app' | 'etapas'> = {}) {
  return comecarAChegada({
    app: (
      <ProvedorDePreferencias loja={loja}>
        <PortaDeTeste loja={loja} />
      </ProvedorDePreferencias>
    ),
    etapas: etapasDoServidor(loja),
    ...relogio,
  });
}

const boasVindas = () => screen.queryByRole('dialog', { name: 'Bem-vindo ao Grafite' });

describe('chegar', () => {
  it('passa pelas etapas reais na ordem e termina com a casca à vista', async () => {
    const { etapas, situacoes } = await chegarComOApp();
    expect(etapas).toEqual([
      'Carregando o Grafite',
      'Carregando suas preferências',
      'Validando sessão',
      'Conectando alertas',
      'Pronto',
    ]);
    expect(situacoes.at(-1)?.progresso).toBe(1);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'O que resolver agora' }),
    ).toBeTruthy();
  });

  it('no acesso seguinte, vai direto à casca, sem boas-vindas nem montagem', async () => {
    const { estados } = await chegarComOApp();
    expect(estados).toEqual(['carregando', 'pronta']);
    expect(boasVindas()).toBeNull();
  });

  it('numa chegada rápida, a camada nunca aparece e sai na hora', async () => {
    const { situacoes } = await chegarComOApp();
    expect(situacoes.some((situacao) => situacao.visivel)).toBe(false);
    expect(camada()).toBeNull();
  });

  it('numa chegada lenta, a camada sai por troca de opacidade e é removida no fim dela', async () => {
    await chegarComOApp({ inicio: 0, agora: () => 900 });
    const saindo = camada();
    expect(saindo).not.toBeNull();
    expect(saindo?.hasAttribute('data-visivel')).toBe(false);
    saindo?.dispatchEvent(new Event('transitionend'));
    expect(camada()).toBeNull();
  });
});

describe('a sessão na chegada', () => {
  it('"Pronto" só termina com a primeira tela desenhada', async () => {
    const chegada = comecarAChegada({
      app: (
        <ProvedorDePreferencias>
          <p>Nenhuma tela</p>
        </ProvedorDePreferencias>
      ),
      etapas: [],
    });
    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(chegada.situacoes.at(-1)).toMatchObject({ etapa: 'Pronto', progresso: 2 / 3 });
    expect(chegada.estados).toEqual(['carregando']);
  });

  it('com a sessão valendo, a primeira tela é a casca', async () => {
    const chegada = chegarComAPorta(lojaQueResponde(comSessao));
    await chegada.terminada;
    expect(desenhadas).toEqual([{ tela: 'casca', chegada: 'carregando' }]);
    expect(chegada.estados).toEqual(['carregando', 'pronta']);
  });

  it('as preferências que o estado da sessão traz valem antes de a primeira tela aparecer', async () => {
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({ versao: 1, aparencia: { tema: 'oled' }, dock: { posicao: 'direita' } }),
    );
    const chegada = chegarComAPorta(
      lojaQueResponde(() =>
        Response.json({
          organizacao: { ...ORGANIZACAO, preferencias: { aparencia: { tema: 'nevoa' } } },
          sessao: {
            ...SESSAO_ATIVA,
            conta: { ...SESSAO_ATIVA.conta, preferencias: { dock: { posicao: 'esquerda' } } },
          },
        }),
      ),
    );
    await chegada.terminada;
    expect(desenhadas).toEqual([{ tela: 'casca', chegada: 'carregando' }]);
    expect(aparencias).toEqual([{ tema: 'nevoa', dock: 'esquerda' }]);
  });

  it('sem sessão, a primeira tela é a entrada, e a chegada espera nela', async () => {
    const chegada = chegarComAPorta(lojaQueResponde(semSessao));
    await vi.waitFor(() => expect(chegada.estados).toEqual(['carregando', 'entrada']));
    expect(desenhadas).toEqual([{ tela: 'entrada', chegada: 'carregando' }]);
    expect(chegada.situacoes.at(-1)).toMatchObject({ etapa: 'Pronto', progresso: 1 });
    expect(chegada.etapas()).toEqual([
      'Carregando o Grafite',
      'Carregando suas preferências',
      'Validando sessão',
      'Pronto',
    ]);
    expect(screen.getByRole('main', { name: 'Entrada' })).toBeTruthy();
  });

  it('sem resposta do servidor, "Validando sessão" termina em 5 s, e a casca abre', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    let relogio = 0;
    const loja = lojaQueResponde(() => new Promise<Response>(() => {}));
    const chegada = chegarComAPorta(loja, { inicio: 0, agora: () => relogio });
    const avancar = async (ms: number) => {
      relogio += ms;
      await vi.advanceTimersByTimeAsync(ms);
    };
    await avancar(4999);
    expect(chegada.situacoes.at(-1)).toMatchObject({ etapa: 'Validando sessão', visivel: true });
    await avancar(1);
    await chegada.terminada;
    expect(loja.ler()).toEqual({ tipo: 'desconhecida' });
    expect(chegada.etapas()).not.toContain('Conectando alertas');
    expect(chegada.estados).toEqual(['carregando', 'pronta']);
    expect(screen.getByRole('main', { name: 'Casca' })).toBeTruthy();
  });

  it('no primeiro acesso sem sessão: boas-vindas, entrada e depois a montagem', async () => {
    localStorage.removeItem(MARCA_DAS_BOAS_VINDAS);
    const chegada = chegarComAPorta(lojaQueResponde(semSessao, comSessao));
    await screen.findByRole('dialog', { name: 'Bem-vindo ao Grafite' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await vi.waitFor(() => expect(chegada.estados.at(-1)).toBe('entrada'));
    expect(boasVindas()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await chegada.terminada;
    expect(chegada.estados).toEqual(['carregando', 'boas-vindas', 'entrada', 'montando', 'pronta']);
    expect(desenhadas).toEqual([
      { tela: 'entrada', chegada: 'carregando' },
      { tela: 'casca', chegada: 'entrada' },
    ]);
  });

  it('num acesso seguinte sem sessão: a entrada e depois a casca, por troca de opacidade', async () => {
    const chegada = chegarComAPorta(lojaQueResponde(semSessao, comSessao));
    await vi.waitFor(() => expect(chegada.estados.at(-1)).toBe('entrada'));
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await chegada.terminada;
    expect(chegada.estados).toEqual(['carregando', 'entrada', 'pronta']);
    // A casca se desenha ainda na entrada, transparente, e aparece na troca para "pronta".
    expect(desenhadas.at(-1)).toEqual({ tela: 'casca', chegada: 'entrada' });
    expect(screen.getByRole('main', { name: 'Casca' })).toBeTruthy();
  });
});

describe('primeiro acesso', () => {
  beforeEach(() => localStorage.removeItem(MARCA_DAS_BOAS_VINDAS));

  it('mostra as boas-vindas e grava a marca assim que elas aparecem', async () => {
    const chegada = comecarAChegada();
    expect(await screen.findByRole('dialog', { name: 'Bem-vindo ao Grafite' })).toBeTruthy();
    expect(document.documentElement.getAttribute('data-chegada')).toBe('boas-vindas');
    expect(localStorage.getItem(MARCA_DAS_BOAS_VINDAS)).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await chegada.terminada;
    expect(boasVindas()).toBeNull();
  });

  it('só monta a casca depois das boas-vindas, e termina pronta', async () => {
    const chegada = comecarAChegada();
    await screen.findByRole('dialog', { name: 'Bem-vindo ao Grafite' });
    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(chegada.estados).toEqual(['carregando', 'boas-vindas']);
    fireEvent.keyDown(document, { key: 'Escape' });
    await chegada.terminada;
    expect(chegada.estados).toEqual(['carregando', 'boas-vindas', 'montando', 'pronta']);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'O que resolver agora' }),
    ).toBeTruthy();
  });

  it('com o armazenamento bloqueado, não mostra as boas-vindas, para não repeti-las', async () => {
    bloquearArmazenamento();
    const { estados } = await chegarComOApp();
    expect(estados).toEqual(['carregando', 'pronta']);
    expect(boasVindas()).toBeNull();
  });

  it('com a leitura do armazenamento bloqueada, também não', async () => {
    bloquearArmazenamento({ leitura: true });
    const { estados } = await chegarComOApp();
    expect(estados).toEqual(['carregando', 'pronta']);
  });
});
