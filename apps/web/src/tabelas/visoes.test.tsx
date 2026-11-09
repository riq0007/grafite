import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { ProvedorDePreferencias, usePreferencias } from '../preferencias/usePreferencias.tsx';
import type { LojaDaSessao } from '../sessao/loja.ts';
import { ProvedorDaSessao } from '../sessao/useSessao.tsx';
import { comApi } from '../teste/provedores.tsx';
import type { ServidorDeTeste } from '../teste/sessao.ts';
import {
  listaAoDesafixar,
  listaAoFixar,
  useAcoesDasVisoes,
  useGravarEscolhaDaVisao,
  useGuardarTabela,
  useVisoes,
  visaoQueAbreDasCamadas,
  visoesUsaveis,
} from './visoes.ts';

type Visao = components['schemas']['VisaoDaTabela'];

const DEFINICAO = {
  colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.tipo' }],
  ordenacao: null,
  filtros: [{ chave: 'ativo.tipo', operador: 'qualquer' as const, valores: ['switch'] }],
};

const SWITCHES: Visao = {
  id: '0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d',
  nome: 'Switches',
  compartilhada: false,
  definicao: DEFINICAO,
  permite: { editar: true },
};

const IMPRESSORAS: Visao = {
  id: '1c8d2e3f-4051-4b6c-9d7e-8f9a0b1c2d3e',
  nome: 'Impressoras de Jundiaí',
  compartilhada: true,
  definicao: DEFINICAO,
  permite: { editar: false },
};

let avisados: MockInstance<typeof filaDeAvisos.avisar>;

beforeEach(() => {
  avisados = vi.spyOn(filaDeAvisos, 'avisar');
});

afterEach(() => {
  avisados.mockRestore();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
});

/** Os retornos dados, na ordem. */
const avisos = () => avisados.mock.calls.map(([aviso]) => aviso.titulo);

// As visões fixadas no menu (change visoes-no-dock, design, decisão 1): a tela grava a lista
// inteira, só com as visões que ainda existem, até 20.
describe('as listas das visões fixadas', () => {
  const existe = (id: string) => id !== 'sumiu';

  it('fixar põe a visão no fim, sem as que não existem mais', () => {
    expect(listaAoFixar(['a', 'sumiu', 'b'], 'c', existe)).toEqual(['a', 'b', 'c']);
  });

  it('com 20 fixadas, outra não cabe; as que não existem mais não contam', () => {
    const vinte = Array.from({ length: 20 }, (_, indice) => `v${indice}`);
    expect(listaAoFixar(vinte, 'nova', existe)).toBeNull();
    expect(listaAoFixar([...vinte.slice(0, 19), 'sumiu'], 'nova', existe)).toHaveLength(20);
  });

  it('desafixar tira a visão e as que não existem mais', () => {
    expect(listaAoDesafixar(['a', 'sumiu', 'b'], 'a', existe)).toEqual(['b']);
  });
});

describe('as visões que a conta pode usar', () => {
  it('a de fábrica da tabela e as que a API deu, pelo id, com o nome e a definição', () => {
    const usaveis = visoesUsaveis('ativos', [SWITCHES, IMPRESSORAS]);
    expect([...(usaveis?.keys() ?? [])]).toEqual(['fabrica', SWITCHES.id, IMPRESSORAS.id]);
    expect(usaveis?.get('fabrica')?.nome).toBe('Todos os ativos');
    expect(usaveis?.get(SWITCHES.id)).toEqual({
      nome: 'Switches',
      definicao: DEFINICAO,
      daConta: true,
    });
    expect(usaveis?.get(IMPRESSORAS.id)?.daConta).toBe(false);
  });

  it('enquanto a API não respondeu, nenhuma', () => {
    expect(visoesUsaveis('ativos', undefined)).toBeUndefined();
  });
});

describe('a visão que abre, pelas duas camadas', () => {
  const usaveis = new Set(['fabrica', SWITCHES.id, IMPRESSORAS.id]);

  it('a escolhida pela conta, depois a padrão da organização, depois a de fábrica', () => {
    expect(
      visaoQueAbreDasCamadas(
        { daConta: SWITCHES.id, daOrganizacao: IMPRESSORAS.id, resolvida: SWITCHES.id },
        usaveis,
      ),
    ).toBe(SWITCHES.id);
    expect(
      visaoQueAbreDasCamadas({ daOrganizacao: IMPRESSORAS.id, resolvida: IMPRESSORAS.id }, usaveis),
    ).toBe(IMPRESSORAS.id);
    expect(visaoQueAbreDasCamadas({}, usaveis)).toBe('fabrica');
  });

  it('a escolhida pela conta e removida é pulada, e vale a da organização (foco 6)', () => {
    const removida = 'ffffffff-3f40-4a5b-8c6d-7e8f9a0b1c2d';
    expect(
      visaoQueAbreDasCamadas(
        { daConta: removida, daOrganizacao: IMPRESSORAS.id, resolvida: removida },
        usaveis,
      ),
    ).toBe(IMPRESSORAS.id);
  });

  it('a escolha ainda não gravada na conta vale, pela preferência resolvida', () => {
    expect(
      visaoQueAbreDasCamadas({ daOrganizacao: IMPRESSORAS.id, resolvida: SWITCHES.id }, usaveis),
    ).toBe(SWITCHES.id);
  });
});

describe('a visão escolhida no menu', () => {
  it('fica nas preferências da conta, para abrir a tabela em qualquer aparelho', () => {
    const { result } = renderHook(
      () => ({ gravar: useGravarEscolhaDaVisao('ativos'), controle: usePreferencias() }),
      { wrapper: ProvedorDePreferencias },
    );
    act(() => result.current.gravar(SWITCHES.id));
    expect(result.current.controle.preferencias.tabelas.visoes).toEqual({ ativos: SWITCHES.id });
    localStorage.clear();
  });
});

/** Os provedores do teste: a API sobre o servidor dado e uma sessão que só revalida. */
function provedores(servidor: ServidorDeTeste) {
  const Api = comApi(servidor);
  const validar = vi.fn(async () => {});
  const loja = {
    ler: () => ({ tipo: 'validando' }),
    assinar: () => () => {},
    lerPadroes: () => null,
    validar,
  } as unknown as LojaDaSessao;
  function Provedores({ children }: { children: ReactNode }) {
    return (
      <ProvedorDaSessao loja={loja}>
        <Api>{children}</Api>
      </ProvedorDaSessao>
    );
  }
  return { Provedores, validar };
}

describe('as visões na API', () => {
  it('lê as visões da tabela', async () => {
    const pedidos: string[] = [];
    const { Provedores } = provedores({
      'GET /api/visoes': (pedido) => {
        pedidos.push(new URL(pedido.url).search);
        return Response.json({ visoes: [SWITCHES], permite: { compartilhar: false } });
      },
    });
    const { result } = renderHook(() => useVisoes('ativos'), { wrapper: Provedores });
    await waitFor(() => expect(result.current.data?.visoes).toEqual([SWITCHES]));
    expect(pedidos).toEqual(['?tabela=ativos']);
  });

  it('criar, salvar, renomear e remover, com os retornos', async () => {
    const corpos: unknown[] = [];
    const { Provedores } = provedores({
      'POST /api/visoes': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(SWITCHES, { status: 201 });
      },
      'PATCH /api/visoes/0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(SWITCHES);
      },
      'DELETE /api/visoes/0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d': () =>
        new Response(null, { status: 204 }),
    });
    const { result } = renderHook(() => useAcoesDasVisoes('ativos'), { wrapper: Provedores });
    await act(async () => {
      expect(
        await result.current.criar({
          nome: 'Switches',
          compartilhada: false,
          definicao: DEFINICAO,
        }),
      ).toEqual({ ok: true, visao: SWITCHES });
      expect(await result.current.salvar(SWITCHES.id, DEFINICAO)).toEqual({ ok: true });
      expect(await result.current.renomear(SWITCHES.id, 'Switches do CPD')).toEqual({ ok: true });
      expect(await result.current.remover(SWITCHES.id)).toEqual({ ok: true });
    });
    expect(corpos).toEqual([
      { tabela: 'ativos', nome: 'Switches', compartilhada: false, definicao: DEFINICAO },
      { definicao: DEFINICAO },
      { nome: 'Switches do CPD' },
    ]);
    expect(avisos()).toEqual([
      'Visão criada.',
      'Visão salva.',
      'Visão renomeada.',
      'Visão removida.',
    ]);
  });

  it('a recusa volta com a mensagem de cada campo, sem retorno de sucesso', async () => {
    const { Provedores } = provedores({
      'POST /api/visoes': () =>
        Response.json(
          {
            type: 'urn:grafite:problema:conflito',
            title: 'Conflito',
            status: 409,
            detail: 'Já existe uma visão com este nome.',
            codigoDeRastreio: 'abc',
            campos: { nome: 'Já existe uma visão com este nome.' },
          },
          { status: 409 },
        ),
    });
    const { result } = renderHook(() => useAcoesDasVisoes('ativos'), { wrapper: Provedores });
    let resultado: unknown;
    await act(async () => {
      resultado = await result.current.criar({
        nome: 'notebooks',
        compartilhada: false,
        definicao: DEFINICAO,
      });
    });
    expect(resultado).toEqual({
      ok: false,
      erro: 'Já existe uma visão com este nome.',
      campos: { nome: 'Já existe uma visão com este nome.' },
    });
    expect(avisos()).toEqual([]);
  });

  it('duplicar cria a visão da conta, e salvar na visão da organização grava as mudanças nela', async () => {
    const PUBLICADA = {
      ...DEFINICAO,
      ordenacao: { chave: 'ativo.rotulo', direcao: 'crescente' as const },
    };
    const pedidos: { caminho: string; corpo: unknown }[] = [];
    let impressoras = IMPRESSORAS;
    let mudancas = [
      { visao: IMPRESSORAS.id, definicao: PUBLICADA, atualizadaEm: '2026-10-13T12:00:00.000Z' },
    ];
    const { Provedores } = provedores({
      'GET /api/visoes': () =>
        Response.json({ visoes: [impressoras], mudancas, permite: { compartilhar: true } }),
      'POST /api/visoes': async (pedido) => {
        pedidos.push({ caminho: 'POST /visoes', corpo: await pedido.json() });
        return Response.json(SWITCHES, { status: 201 });
      },
      [`POST /api/visoes/${IMPRESSORAS.id}/publicar`]: () => {
        pedidos.push({ caminho: 'publicar', corpo: null });
        mudancas = [];
        impressoras = { ...IMPRESSORAS, definicao: PUBLICADA };
        return Response.json(impressoras);
      },
    });
    const { result } = renderHook(
      () => ({ acoes: useAcoesDasVisoes('ativos'), lista: useVisoes('ativos') }),
      { wrapper: Provedores },
    );
    await waitFor(() => expect(result.current.lista.data?.mudancas).toHaveLength(1));
    await act(async () => {
      expect(
        await result.current.acoes.duplicar({ nome: 'Switches', definicao: DEFINICAO }),
      ).toEqual({ ok: true, visao: SWITCHES });
      expect(await result.current.acoes.publicar(IMPRESSORAS.id)).toEqual({ ok: true });
    });
    expect(pedidos).toEqual([
      {
        caminho: 'POST /visoes',
        corpo: { tabela: 'ativos', nome: 'Switches', compartilhada: false, definicao: DEFINICAO },
      },
      { caminho: 'publicar', corpo: null },
    ]);
    expect(avisos()).toEqual(['Visão duplicada.', 'Visão salva.']);
    // A visão publicada vale na lista guardada, sem as mudanças da conta sobre ela.
    await waitFor(() => expect(result.current.lista.data?.mudancas).toEqual([]));
    expect(
      result.current.lista.data?.visoes.find((visao) => visao.id === IMPRESSORAS.id)?.definicao,
    ).toEqual(PUBLICADA);
  });

  it('usar como padrão da organização grava nos padrões e relê a sessão', async () => {
    const corpos: unknown[] = [];
    const { Provedores, validar } = provedores({
      'PATCH /api/organizacao/padroes': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json({});
      },
    });
    const { result } = renderHook(() => useAcoesDasVisoes('ativos'), { wrapper: Provedores });
    await act(async () => {
      expect(await result.current.usarComoPadrao(IMPRESSORAS.id)).toEqual({ ok: true });
    });
    expect(corpos).toEqual([{ mudancas: { tabelas: { visoes: { ativos: IMPRESSORAS.id } } } }]);
    expect(validar).toHaveBeenCalledOnce();
    expect(avisos()).toEqual(['Padrão da organização definido.']);
  });
});

// A gravação da tabela (change visoes-da-conta, design, decisão 3): 400 ms depois da última
// mudança, a última de cada visão; na saída da página, na hora, com o keepalive.
describe('a gravação da tabela', () => {
  const COM_IP = { ...DEFINICAO, colunas: [...DEFINICAO.colunas, { chave: 'c-ip' }] };

  afterEach(() => {
    vi.useRealTimers();
  });

  function servidorDasMudancas() {
    const pedidos: { caminho: string; corpo: unknown; keepalive: boolean }[] = [];
    const guardar = async (pedido: Request) => {
      const url = new URL(pedido.url);
      const texto = await pedido.text();
      pedidos.push({
        caminho: `${pedido.method} ${url.pathname}${url.search}`,
        corpo: texto ? JSON.parse(texto) : null,
        keepalive: pedido.keepalive,
      });
    };
    const { Provedores } = provedores({
      'PUT /api/visoes/mudancas': async (pedido) => {
        await guardar(pedido);
        return Response.json({
          visao: 'fabrica',
          definicao: COM_IP,
          atualizadaEm: '2026-10-13T12:00:00.000Z',
        });
      },
      'DELETE /api/visoes/mudancas': async (pedido) => {
        await guardar(pedido);
        return new Response(null, { status: 204 });
      },
      [`PATCH /api/visoes/${SWITCHES.id}`]: async (pedido) => {
        await guardar(pedido);
        return Response.json({ ...SWITCHES, definicao: COM_IP });
      },
    });
    return { pedidos, Provedores };
  }

  it('junta as mudanças de 400 ms numa gravação só, com a última', async () => {
    vi.useFakeTimers();
    const { pedidos, Provedores } = servidorDasMudancas();
    const { result } = renderHook(() => useGuardarTabela('ativos'), { wrapper: Provedores });
    act(() => {
      void result.current.guardar({ tipo: 'mudancas', visao: 'fabrica', definicao: DEFINICAO });
      void result.current.guardar({ tipo: 'mudancas', visao: 'fabrica', definicao: COM_IP });
    });
    expect(pedidos).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(pedidos).toEqual([
      {
        caminho: 'PUT /api/visoes/mudancas',
        corpo: { tabela: 'ativos', visao: 'fabrica', definicao: COM_IP },
        keepalive: false,
      },
    ]);
  });

  it('a própria visão pelo PATCH, e restaurar pelo DELETE com a visão', async () => {
    vi.useFakeTimers();
    const { pedidos, Provedores } = servidorDasMudancas();
    const { result } = renderHook(() => useGuardarTabela('ativos'), { wrapper: Provedores });
    act(() => {
      void result.current.guardar({ tipo: 'visao', id: SWITCHES.id, definicao: COM_IP });
      void result.current.guardar({ tipo: 'restaurar', visao: IMPRESSORAS.id });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(pedidos.map((pedido) => pedido.caminho).sort()).toEqual([
      `DELETE /api/visoes/mudancas?tabela=ativos&visao=${IMPRESSORAS.id}`,
      `PATCH /api/visoes/${SWITCHES.id}`,
    ]);
  });

  it('descarregar grava na hora o que espera, e acaba quando a gravação acaba', async () => {
    const { pedidos, Provedores } = servidorDasMudancas();
    const { result } = renderHook(() => useGuardarTabela('ativos'), { wrapper: Provedores });
    act(() => {
      void result.current.guardar({ tipo: 'mudancas', visao: 'fabrica', definicao: COM_IP });
    });
    expect(pedidos).toEqual([]);
    await act(async () => {
      await result.current.descarregar();
    });
    expect(pedidos).toEqual([
      {
        caminho: 'PUT /api/visoes/mudancas',
        corpo: { tabela: 'ativos', visao: 'fabrica', definicao: COM_IP },
        keepalive: false,
      },
    ]);
  });

  it('na saída da página, grava na hora o que espera, com o keepalive', async () => {
    vi.useFakeTimers();
    const { pedidos, Provedores } = servidorDasMudancas();
    const { result } = renderHook(() => useGuardarTabela('ativos'), { wrapper: Provedores });
    act(() => {
      void result.current.guardar({ tipo: 'mudancas', visao: 'fabrica', definicao: COM_IP });
    });
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(pedidos).toEqual([
      {
        caminho: 'PUT /api/visoes/mudancas',
        corpo: { tabela: 'ativos', visao: 'fabrica', definicao: COM_IP },
        keepalive: true,
      },
    ]);
    // E não grava de novo quando a espera acabaria.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(pedidos).toHaveLength(1);
  });
});
