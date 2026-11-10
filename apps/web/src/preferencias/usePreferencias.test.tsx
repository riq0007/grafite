import {
  type AjustesDasPreferencias,
  aplicarMudanca,
  PADRAO_DE_FABRICA,
  type TipoDeEvento,
} from '@grafite/domain';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CanalDeEventos, criarCanalDeEventos } from '../eventos/canal.ts';
import { criarLojaDaSessao, type LojaDaSessao } from '../sessao/loja.ts';
import { bloquearArmazenamento } from '../teste/armazenamento.ts';
import {
  copiaDasPreferencias as copia,
  guardarCopia,
  preferenciasDaCopia as salvas,
} from '../teste/preferencias.ts';
import { CONTA_DE_EXEMPLO } from '../teste/sessao.ts';
import { atributosDaInterface } from './preferencias.ts';
import { ProvedorDePreferencias, usePreferencias } from './usePreferencias.tsx';

const envolver = ({ children }: { children: ReactNode }) => (
  <ProvedorDePreferencias>{children}</ProvedorDePreferencias>
);

const raiz = () => document.documentElement;

const lojas: LojaDaSessao[] = [];

afterEach(() => {
  cleanup();
  for (const loja of lojas.splice(0)) loja.parar();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  for (const nome of [...raiz().getAttributeNames()]) raiz().removeAttribute(nome);
  // Volta à visibilidade do próprio documento.
  Reflect.deleteProperty(document, 'visibilityState');
});

/**
 * O servidor de um teste com a sessão: os padrões da organização e a camada da conta, que o
 * PATCH muda como a API (merge patch). Sem a camada da conta, não há sessão. Fora do ar, nenhum
 * pedido chega a ele.
 */
interface Servidor {
  padroes: AjustesDasPreferencias;
  conta: AjustesDasPreferencias | null;
  /** O id da conta da sessão. */
  contaId: string;
  foraDoAr: boolean;
  pedidos: Request[];
  /** O corpo de cada gravação das preferências, na ordem. */
  gravacoes: unknown[];
}

function criarServidor(
  inicial: {
    padroes?: AjustesDasPreferencias;
    conta?: AjustesDasPreferencias | null;
    contaId?: string;
  } = {},
) {
  const servidor: Servidor = {
    padroes: inicial.padroes ?? {},
    conta: inicial.conta === undefined ? {} : inicial.conta,
    contaId: inicial.contaId ?? (CONTA_DE_EXEMPLO.id as string),
    foraDoAr: false,
    pedidos: [],
    gravacoes: [],
  };
  const loja = criarLojaDaSessao({
    buscar: async (pedido) => {
      if (servidor.foraDoAr) throw new TypeError('Failed to fetch');
      servidor.pedidos.push(pedido);
      const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
      if (caminho === 'DELETE /api/sessao') {
        servidor.conta = null;
        return new Response(null, { status: 204 });
      }
      // A entrada abre a sessão da conta, com a camada que ela já tinha.
      if (caminho === 'POST /api/sessao') servidor.conta ??= {};
      if (caminho === 'GET /api/sessao' || caminho === 'POST /api/sessao') {
        return Response.json({
          organizacao: { nome: 'Empresa de exemplo', preferencias: servidor.padroes },
          sessao: servidor.conta && {
            conta: { ...CONTA_DE_EXEMPLO, id: servidor.contaId, preferencias: servidor.conta },
            pendencia: null,
            csrf: 'csrf-de-teste',
            expiraEm: '2099-01-01T00:00:00.000Z',
            acesso: { permissoes: [] },
          },
        });
      }
      if (caminho === 'PATCH /api/conta/preferencias') {
        const corpo = await pedido.clone().json();
        servidor.gravacoes.push(corpo);
        servidor.conta = aplicarMudanca(servidor.conta ?? {}, corpo.mudancas);
        return Response.json(servidor.conta);
      }
      throw new Error(`O teste não preparou o servidor para ${caminho}.`);
    },
  });
  lojas.push(loja);
  return { servidor, loja, canal: criarCanalDeEventos() };
}

function renderizar(loja: LojaDaSessao, canal: CanalDeEventos) {
  return renderHook(usePreferencias, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ProvedorDePreferencias loja={loja} canal={canal}>
        {children}
      </ProvedorDePreferencias>
    ),
  });
}

/** O provedor com a loja já validada, na sessão do servidor, e o canal dos eventos. */
async function comASessao(inicial: Parameters<typeof criarServidor>[0] = {}) {
  const { servidor, loja, canal } = criarServidor(inicial);
  await loja.validar();
  return { servidor, loja, canal, ...renderizar(loja, canal) };
}

const leiturasDaSessao = (servidor: Servidor) =>
  servidor.pedidos.filter((pedido) => new URL(pedido.url).pathname === '/api/sessao').length;

function ocultarAPagina() {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

const esperar = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('usePreferencias', () => {
  it('abre com o que está salvo e já aplica no <html>', () => {
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({ versao: 1, aparencia: { tema: 'papel' }, dock: { posicao: 'direita' } }),
    );
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    expect(result.current.preferencias.aparencia.tema).toBe('papel');
    expect(raiz().getAttribute('data-theme')).toBe('papel');
    expect(raiz().getAttribute('data-dock')).toBe('direita');
  });

  it('uma mudança vale na hora no <html> e fica gravada', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('dock', { posicao: 'esquerda', ocultar: true }));
    expect(raiz().getAttribute('data-dock')).toBe('esquerda');
    expect(raiz().getAttribute('data-dock-ocultar')).toBe('sim');
    expect(copia()).toMatchObject({ versao: 2 });
    expect(salvas()).toMatchObject({ dock: { posicao: 'esquerda', ocultar: true } });
  });

  it('desligar o ocultar automático tira o atributo do <html>', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('dock', { ocultar: true }));
    act(() => result.current.mudar('dock', { ocultar: false }));
    expect(raiz().hasAttribute('data-dock-ocultar')).toBe(false);
  });

  // Spec design-tokens, "Tema e destaque personalizados em tempo de execução".
  it('volta a um tema de fábrica: nenhuma variável do tema personalizado fica no <html>', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() =>
      result.current.mudar('aparencia', {
        tema: 'personalizado',
        personalizado: { tom: 'claro', matiz: 80, tingimento: 40, contraste: 45 },
      }),
    );
    expect(raiz().getAttribute('data-theme')).toBe('nevoa');
    expect(raiz().style.getPropertyValue('--cor-fundo')).not.toBe('');
    act(() => result.current.mudar('aparencia', { tema: 'nevoa', destaque: 'azul' }));
    expect(raiz().getAttribute('data-theme')).toBe('nevoa');
    expect(raiz().getAttribute('data-accent')).toBe('azul');
    const variaveis = Array.from(raiz().style).filter((nome) => /^--(cor|sombra)-/.test(nome));
    expect(variaveis).toEqual([]);
    expect(raiz().style.getPropertyValue('--cor-fundo')).toBe('');
  });

  it('uma mudança fora do intervalo fica presa ao limite', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('dock', { tamanho: 90 }));
    expect(result.current.preferencias.dock.tamanho).toBe(64);
    expect(raiz().style.getPropertyValue('--tamanho-item-dock')).toBe('64px');
  });

  it('com o armazenamento bloqueado, a mudança vale na sessão, sem erro', () => {
    bloquearArmazenamento();
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('aparencia', { tema: 'oled' }));
    expect(raiz().getAttribute('data-theme')).toBe('oled');
    expect(result.current.preferencias.aparencia.tema).toBe('oled');
  });

  it('cursor, notificações e tabelas mudam na hora e ficam gravados', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('cursor', { tipo: 'sistema' }));
    act(() => result.current.mudar('notificacoes', { informacao: false, tempo: 20 }));
    act(() => result.current.mudar('tabelas', { miniaturas: false }));
    expect(result.current.preferencias.cursor.tipo).toBe('sistema');
    expect(salvas()).toMatchObject({
      cursor: { tipo: 'sistema', suavizacao: 95 },
      notificacoes: { atencao: true, informacao: false, tempo: 20 },
      tabelas: { linhasAlternadas: true, miniaturas: false },
    });
  });

  it('a suavização fora do intervalo fica presa a 100%', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('cursor', { suavizacao: 130 }));
    expect(result.current.preferencias.cursor.suavizacao).toBe(100);
  });

  it('com o armazenamento bloqueado, as tabelas mudam na sessão, sem erro', () => {
    bloquearArmazenamento();
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('tabelas', { linhasAlternadas: false }));
    expect(result.current.preferencias.tabelas.linhasAlternadas).toBe(false);
  });

  it('o fuso e a ordem da tela inicial mudam na hora e ficam gravados', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('regiao', { fuso: 'America/Manaus' }));
    act(() =>
      result.current.mudar('inicio', { ordenacao: { coluna: 'ativo', direcao: 'crescente' } }),
    );
    expect(result.current.preferencias.regiao.fuso).toBe('America/Manaus');
    expect(result.current.preferencias.inicio.ordenacao).toEqual({
      coluna: 'ativo',
      direcao: 'crescente',
    });
    expect(salvas()).toMatchObject({
      regiao: { fuso: 'America/Manaus' },
      inicio: { ordenacao: { coluna: 'ativo', direcao: 'crescente' } },
    });
  });

  it('um fuso que o navegador não reconhece volta a seguir o sistema', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('regiao', { fuso: 'America/Manaus' }));
    act(() => result.current.mudar('regiao', { fuso: 'Marte/Olympus' }));
    expect(result.current.preferencias.regiao.fuso).toBe('sistema');
    expect(salvas()).toMatchObject({ regiao: { fuso: 'sistema' } });
  });

  it('com o armazenamento bloqueado, o fuso e a ordem mudam na sessão, sem erro', () => {
    bloquearArmazenamento();
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('regiao', { fuso: 'America/Manaus' }));
    act(() =>
      result.current.mudar('inicio', { ordenacao: { coluna: 'ha', direcao: 'crescente' } }),
    );
    expect(result.current.preferencias.regiao.fuso).toBe('America/Manaus');
    expect(result.current.preferencias.inicio.ordenacao.coluna).toBe('ha');
  });

  it('restaurar a seção Idioma e região não mexe na ordem da tela inicial', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() =>
      result.current.mudar('inicio', { ordenacao: { coluna: 'ha', direcao: 'crescente' } }),
    );
    act(() => result.current.mudar('regiao', { fuso: 'America/Manaus' }));
    act(() => result.current.restaurar('regiao'));
    expect(result.current.preferencias.regiao).toEqual({ fuso: 'sistema' });
    expect(result.current.preferencias.inicio.ordenacao).toEqual({
      coluna: 'ha',
      direcao: 'crescente',
    });
    expect(salvas()).toMatchObject({
      regiao: { fuso: 'sistema' },
      inicio: { ordenacao: { coluna: 'ha', direcao: 'crescente' } },
    });
  });

  it('restaurar a seção Cursor não mexe nas notificações', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('notificacoes', { tempo: 10 }));
    act(() => result.current.mudar('cursor', { tipo: 'sistema', suavizacao: 40, abracar: false }));
    act(() => result.current.restaurar('cursor'));
    expect(result.current.preferencias.cursor).toEqual({
      tipo: 'suavizado',
      suavizacao: 95,
      abracar: true,
    });
    expect(result.current.preferencias.notificacoes.tempo).toBe(10);
  });

  it('restaurar uma seção volta só ela aos padrões de fábrica', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('aparencia', { tema: 'papel' }));
    act(() => result.current.mudar('dock', { posicao: 'direita', tamanho: 36, ampliar: false }));
    act(() => result.current.restaurar('dock'));
    expect(result.current.preferencias.dock).toEqual({
      posicao: 'embaixo',
      tamanho: 48,
      ampliar: true,
      ocultar: false,
      modulos: [],
    });
    expect(result.current.preferencias.aparencia.tema).toBe('papel');
  });
});

describe('usePreferencias com a sessão', () => {
  it('a fábrica, os padrões da organização e a conta valem campo a campo', async () => {
    const { result } = await comASessao({
      padroes: { aparencia: { tema: 'nevoa' }, dock: { posicao: 'esquerda' } },
      conta: { dock: { tamanho: 36 } },
    });
    expect(result.current.preferencias.aparencia.tema).toBe('nevoa');
    expect(result.current.preferencias.dock).toEqual({
      posicao: 'esquerda',
      tamanho: 36,
      ampliar: true,
      ocultar: false,
      modulos: [],
    });
    expect(raiz().getAttribute('data-theme')).toBe('nevoa');
    expect(raiz().getAttribute('data-dock')).toBe('esquerda');
  });

  it('a escolha da conta fica acima do padrão da organização', async () => {
    const { result } = await comASessao({
      padroes: { aparencia: { tema: 'nevoa' } },
      conta: { aparencia: { tema: 'grafite' } },
    });
    expect(result.current.preferencias.aparencia.tema).toBe('grafite');
  });

  it('até a sessão ser validada vale a cópia; depois, as camadas do servidor', async () => {
    guardarCopia({
      versao: 2,
      contaId: CONTA_DE_EXEMPLO.id,
      organizacao: {},
      conta: { aparencia: { tema: 'oled' } },
      pendentes: {},
    });
    const { loja, canal } = criarServidor({ padroes: { aparencia: { tema: 'nevoa' } } });
    const { result } = renderizar(loja, canal);
    expect(raiz().getAttribute('data-theme')).toBe('oled');
    await act(() => loja.validar());
    expect(result.current.preferencias.aparencia.tema).toBe('nevoa');
    expect(raiz().getAttribute('data-theme')).toBe('nevoa');
  });

  it('sem a sessão que vale, valem só os padrões da organização', async () => {
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({ versao: 1, aparencia: { tema: 'oled' }, dock: { posicao: 'direita' } }),
    );
    const { result } = await comASessao({ padroes: { aparencia: { tema: 'papel' } }, conta: null });
    expect(result.current.preferencias.aparencia.tema).toBe('papel');
    expect(result.current.preferencias.dock.posicao).toBe('embaixo');
    expect(raiz().getAttribute('data-theme')).toBe('papel');
  });

  it('a mudança vale na hora e é gravada uma vez, 400 ms depois da última', async () => {
    vi.useFakeTimers();
    const { result, servidor } = await comASessao();
    act(() => result.current.mudar('dock', { posicao: 'esquerda' }));
    expect(raiz().getAttribute('data-dock')).toBe('esquerda');
    await esperar(300);
    act(() => result.current.mudar('dock', { tamanho: 40 }));
    await esperar(399);
    expect(servidor.gravacoes).toEqual([]);
    await esperar(1);
    expect(servidor.gravacoes).toEqual([
      { mudancas: { dock: { posicao: 'esquerda', tamanho: 40 } } },
    ]);
    expect(servidor.conta).toEqual({ dock: { posicao: 'esquerda', tamanho: 40 } });
    expect(result.current.preferencias.dock).toMatchObject({ posicao: 'esquerda', tamanho: 40 });
  });

  it('o valor fora do permitido vai preso ao limite, e o desconhecido tira o ajuste da conta', async () => {
    vi.useFakeTimers();
    const { result, servidor } = await comASessao({
      padroes: { regiao: { fuso: 'America/Manaus' } },
      conta: { regiao: { fuso: 'America/Recife' } },
    });
    act(() => result.current.mudar('dock', { tamanho: 90 }));
    act(() => result.current.mudar('regiao', { fuso: 'Marte/Olympus' }));
    expect(result.current.preferencias.dock.tamanho).toBe(64);
    expect(result.current.preferencias.regiao.fuso).toBe('America/Manaus');
    await esperar(400);
    expect(servidor.gravacoes).toEqual([
      { mudancas: { dock: { tamanho: 64 }, regiao: { fuso: null } } },
    ]);
  });

  it('ao ocultar a página, a mudança pendente vai na hora, com keepalive', async () => {
    vi.useFakeTimers();
    const { result, servidor } = await comASessao();
    act(() => result.current.mudar('aparencia', { destaque: 'verde' }));
    ocultarAPagina();
    await esperar(0);
    const gravacao = servidor.pedidos.find((pedido) => pedido.method === 'PATCH');
    expect(gravacao?.keepalive).toBe(true);
    expect(servidor.conta).toEqual({ aparencia: { destaque: 'verde' } });
    await esperar(400);
    expect(servidor.gravacoes).toHaveLength(1);
  });

  it('restaurar volta a seção ao padrão da organização e tira da conta os ajustes dela', async () => {
    vi.useFakeTimers();
    const { result, servidor } = await comASessao({
      padroes: { dock: { posicao: 'esquerda' } },
      conta: { dock: { posicao: 'direita', tamanho: 36 }, aparencia: { tema: 'papel' } },
    });
    act(() => result.current.restaurar('dock'));
    expect(result.current.preferencias.dock).toEqual({
      posicao: 'esquerda',
      tamanho: 48,
      ampliar: true,
      ocultar: false,
      modulos: [],
    });
    expect(result.current.preferencias.aparencia.tema).toBe('papel');
    await esperar(400);
    expect(servidor.conta).toEqual({ aparencia: { tema: 'papel' } });
  });

  it.each<TipoDeEvento>(['preferencias.mudaram', 'padroes.mudaram'])(
    '%s relê o estado da sessão 300 ms depois, uma vez só, e aplica as camadas',
    async (tipo) => {
      vi.useFakeTimers();
      const { result, servidor, canal } = await comASessao();
      const leituras = leiturasDaSessao(servidor);
      // A mudança feita em outro dispositivo, ou nos padrões da organização.
      servidor.conta = { aparencia: { destaque: 'laranja' } };
      servidor.padroes = { dock: { posicao: 'direita' } };
      const evento = { id: '1', tipo, momento: '2026-10-07T12:00:00.000Z', alvo: null };
      canal.publicar(evento);
      await esperar(100);
      canal.publicar({ ...evento, id: '2' });
      await esperar(299);
      expect(leiturasDaSessao(servidor)).toBe(leituras);
      await esperar(1);
      expect(leiturasDaSessao(servidor)).toBe(leituras + 1);
      expect(result.current.preferencias.aparencia.destaque).toBe('laranja');
      expect(result.current.preferencias.dock.posicao).toBe('direita');
      expect(raiz().getAttribute('data-accent')).toBe('laranja');
    },
  );
});

describe('a cópia no navegador', () => {
  const VERSAO_2 = { versao: 2, contaId: null, organizacao: {}, conta: {}, pendentes: {} };

  it('guarda a conta, as camadas e as mudanças ainda não gravadas, na versão 2', async () => {
    vi.useFakeTimers();
    const { result } = await comASessao({
      padroes: { aparencia: { tema: 'nevoa' } },
      conta: { dock: { tamanho: 36 } },
    });
    act(() => result.current.mudar('dock', { posicao: 'esquerda' }));
    expect(copia()).toEqual({
      versao: 2,
      contaId: CONTA_DE_EXEMPLO.id,
      organizacao: { aparencia: { tema: 'nevoa' } },
      conta: { dock: { tamanho: 36 } },
      pendentes: { dock: { posicao: 'esquerda' } },
    });
    await esperar(400);
    expect(copia()).toMatchObject({
      conta: { dock: { tamanho: 36, posicao: 'esquerda' } },
      pendentes: {},
    });
  });

  it('abre com a cópia, com as mudanças por cima, antes de o servidor responder', () => {
    guardarCopia({
      ...VERSAO_2,
      contaId: CONTA_DE_EXEMPLO.id,
      organizacao: { aparencia: { tema: 'nevoa' } },
      conta: { dock: { posicao: 'esquerda' } },
      pendentes: { aparencia: { destaque: 'verde' } },
    });
    const { loja, canal } = criarServidor();
    const { result } = renderizar(loja, canal);
    expect(result.current.preferencias.aparencia).toMatchObject({
      tema: 'nevoa',
      destaque: 'verde',
    });
    expect(result.current.preferencias.dock.posicao).toBe('esquerda');
    expect(raiz().getAttribute('data-theme')).toBe('nevoa');
  });

  it('sem servidor, a mudança vale na hora, fica na cópia e vai quando a sessão da mesma conta volta', async () => {
    vi.useFakeTimers();
    const { servidor, loja, canal } = criarServidor({ conta: { aparencia: { tema: 'papel' } } });
    await loja.validar();
    const { result } = renderizar(loja, canal);
    servidor.foraDoAr = true;
    await act(() => loja.validar());
    expect(loja.ler().tipo).toBe('desconhecida');
    act(() => result.current.mudar('dock', { posicao: 'esquerda' }));
    expect(raiz().getAttribute('data-dock')).toBe('esquerda');
    await esperar(400);
    expect(copia()).toMatchObject({ pendentes: { dock: { posicao: 'esquerda' } } });

    servidor.foraDoAr = false;
    await act(() => loja.validar());
    await esperar(400);
    expect(servidor.gravacoes).toEqual([{ mudancas: { dock: { posicao: 'esquerda' } } }]);
    expect(result.current.preferencias.dock.posicao).toBe('esquerda');
    expect(result.current.preferencias.aparencia.tema).toBe('papel');
    expect(copia()).toMatchObject({ pendentes: {} });
  });

  it('a mudança que ficou na cópia vai depois de reabrir, com a sessão da mesma conta', async () => {
    vi.useFakeTimers();
    guardarCopia({
      ...VERSAO_2,
      contaId: CONTA_DE_EXEMPLO.id,
      pendentes: { dock: { posicao: 'esquerda' } },
    });
    const { servidor, loja, canal } = criarServidor();
    const { result } = renderizar(loja, canal);
    await act(() => loja.validar());
    expect(result.current.preferencias.dock.posicao).toBe('esquerda');
    await esperar(400);
    expect(servidor.gravacoes).toEqual([{ mudancas: { dock: { posicao: 'esquerda' } } }]);
  });

  it('a mudança que ficou na cópia é descartada quando volta outra conta', async () => {
    vi.useFakeTimers();
    guardarCopia({
      ...VERSAO_2,
      contaId: '0199a6e0-0000-7000-8000-0000000000ff',
      conta: { aparencia: { tema: 'oled' } },
      pendentes: { dock: { posicao: 'esquerda' } },
    });
    const { servidor, loja, canal } = criarServidor({ conta: { aparencia: { tema: 'papel' } } });
    const { result } = renderizar(loja, canal);
    await act(() => loja.validar());
    expect(result.current.preferencias.aparencia.tema).toBe('papel');
    expect(result.current.preferencias.dock.posicao).toBe('embaixo');
    await esperar(400);
    expect(servidor.gravacoes).toEqual([]);
    expect(copia()).toMatchObject({ contaId: CONTA_DE_EXEMPLO.id, pendentes: {} });
  });

  it('a mudança que ficou na cópia é descartada quando volta sem sessão', async () => {
    vi.useFakeTimers();
    guardarCopia({
      ...VERSAO_2,
      contaId: CONTA_DE_EXEMPLO.id,
      pendentes: { dock: { posicao: 'esquerda' } },
    });
    const { servidor, loja, canal } = criarServidor({
      padroes: { aparencia: { tema: 'papel' } },
      conta: null,
    });
    const { result } = renderizar(loja, canal);
    await act(() => loja.validar());
    expect(result.current.preferencias.dock.posicao).toBe('embaixo');
    await esperar(400);
    expect(servidor.gravacoes).toEqual([]);
    expect(copia()).toEqual({
      versao: 2,
      contaId: null,
      organizacao: { aparencia: { tema: 'papel' } },
      conta: null,
      pendentes: {},
    });
  });

  it('depois de "Sair", a cópia fica só com os padrões da organização', async () => {
    const { result, loja } = await comASessao({
      padroes: { aparencia: { tema: 'papel' } },
      conta: { aparencia: { tema: 'oled' } },
    });
    expect(result.current.preferencias.aparencia.tema).toBe('oled');
    await act(() => loja.sair());
    expect(result.current.preferencias.aparencia.tema).toBe('papel');
    expect(copia()).toEqual({
      versao: 2,
      contaId: null,
      organizacao: { aparencia: { tema: 'papel' } },
      conta: null,
      pendentes: {},
    });
    expect(
      JSON.parse(localStorage.getItem('grafite.preferencias.atributos') ?? '{}'),
    ).toMatchObject({ 'data-theme': 'papel' });
  });

  it('com a leitura do armazenamento bloqueada, abre nos padrões e a mudança vale, sem erro', async () => {
    bloquearArmazenamento({ leitura: true });
    const { result } = await comASessao({ padroes: { aparencia: { tema: 'nevoa' } } });
    expect(result.current.preferencias.aparencia.tema).toBe('nevoa');
    act(() => result.current.mudar('aparencia', { tema: 'oled' }));
    expect(raiz().getAttribute('data-theme')).toBe('oled');
  });

  it('o anti-flash continua com os atributos de sempre, das preferências que valem', () => {
    const { result } = renderHook(usePreferencias, { wrapper: envolver });
    act(() => result.current.mudar('dock', { posicao: 'esquerda', tamanho: 36 }));
    const atributos = JSON.parse(localStorage.getItem('grafite.preferencias.atributos') ?? '{}');
    expect(atributos).toEqual(atributosDaInterface(result.current.preferencias));
    expect(atributos).toMatchObject({ 'data-dock': 'esquerda', '--tamanho-item-dock': '36px' });
  });
});

describe('a passagem da cópia da versão 1 para a conta', () => {
  /** A cópia que a versão 1 gravava: as preferências inteiras que valiam neste navegador. */
  const guardarCopiaDaVersao1 = (mudadas: Record<string, Record<string, unknown>>) => {
    const inteiras: Record<string, unknown> = { versao: 1 };
    for (const [secao, campos] of Object.entries(PADRAO_DE_FABRICA)) {
      inteiras[secao] = { ...campos, ...mudadas[secao] };
    }
    localStorage.setItem('grafite.preferencias', JSON.stringify(inteiras));
  };

  it('a conta sem preferências recebe só os ajustes da cópia antiga que diferem da fábrica', async () => {
    vi.useFakeTimers();
    guardarCopiaDaVersao1({ aparencia: { tema: 'meia-noite' }, dock: { posicao: 'direita' } });
    const { servidor, loja, canal } = criarServidor();
    const { result } = renderizar(loja, canal);
    expect(raiz().getAttribute('data-theme')).toBe('meia-noite');
    await act(() => loja.validar());
    expect(result.current.preferencias.aparencia.tema).toBe('meia-noite');
    await esperar(400);
    expect(servidor.gravacoes).toEqual([
      { mudancas: { aparencia: { tema: 'meia-noite' }, dock: { posicao: 'direita' } } },
    ]);
    expect(copia()).toMatchObject({
      versao: 2,
      contaId: CONTA_DE_EXEMPLO.id,
      conta: { aparencia: { tema: 'meia-noite' }, dock: { posicao: 'direita' } },
      pendentes: {},
    });
  });

  it('a conta com preferências fica com as do servidor, e a cópia antiga é descartada', async () => {
    vi.useFakeTimers();
    guardarCopiaDaVersao1({ aparencia: { tema: 'meia-noite' } });
    const { servidor, loja, canal } = criarServidor({ conta: { aparencia: { tema: 'papel' } } });
    const { result } = renderizar(loja, canal);
    await act(() => loja.validar());
    expect(result.current.preferencias.aparencia.tema).toBe('papel');
    await esperar(400);
    expect(servidor.gravacoes).toEqual([]);
    expect(copia()).toMatchObject({ versao: 2, contaId: CONTA_DE_EXEMPLO.id, pendentes: {} });
  });

  it('sem sessão, a entrada usa os padrões, e a cópia antiga espera a primeira entrada', async () => {
    vi.useFakeTimers();
    guardarCopiaDaVersao1({ aparencia: { tema: 'meia-noite' } });
    const { servidor, loja, canal } = criarServidor({
      padroes: { aparencia: { tema: 'papel' } },
      conta: null,
    });
    const { result } = renderizar(loja, canal);
    await act(() => loja.validar());
    expect(result.current.preferencias.aparencia.tema).toBe('papel');
    await act(() => loja.entrar({ usuario: 'ana.souza', senha: 'senha' }));
    expect(result.current.preferencias.aparencia.tema).toBe('meia-noite');
    await esperar(400);
    expect(servidor.gravacoes).toEqual([{ mudancas: { aparencia: { tema: 'meia-noite' } } }]);
  });

  it('a passagem acontece uma vez só, para a primeira conta', async () => {
    vi.useFakeTimers();
    guardarCopiaDaVersao1({ aparencia: { tema: 'meia-noite' } });
    const primeira = criarServidor();
    const aberta = renderizar(primeira.loja, primeira.canal);
    await act(() => primeira.loja.validar());
    await esperar(400);
    expect(primeira.servidor.gravacoes).toHaveLength(1);
    aberta.unmount();

    // A página reaberta neste navegador, com outra conta, que ainda não mudou nada.
    const outra = criarServidor({ contaId: '0199a6e0-0000-7000-8000-0000000000ff' });
    const { result } = renderizar(outra.loja, outra.canal);
    await act(() => outra.loja.validar());
    await esperar(400);
    expect(outra.servidor.gravacoes).toEqual([]);
    expect(result.current.preferencias.aparencia.tema).toBe('grafite');
  });

  it('a aparência que o F0 guardava passa do mesmo jeito', async () => {
    vi.useFakeTimers();
    localStorage.setItem('grafite.aparencia', JSON.stringify({ tema: 'papel', raio: 4 }));
    const { servidor, loja, canal } = criarServidor();
    renderizar(loja, canal);
    await act(() => loja.validar());
    await esperar(400);
    expect(servidor.gravacoes).toEqual([{ mudancas: { aparencia: { tema: 'papel', raio: 4 } } }]);
  });
});
