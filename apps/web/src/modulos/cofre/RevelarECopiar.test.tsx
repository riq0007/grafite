import type { components } from '@grafite/api-client';
import { criarDataHora, filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import type { ClienteDaApi } from '../../api/cliente.ts';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import { noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';
import { ENTRADAS_DO_COFRE, provedorDeSegredos } from './busca.ts';
import { cofre } from './modulo.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Ficha = components['schemas']['FichaDoSegredo'];

const SWITCH: Ficha = {
  id: 'switch',
  nome: 'Switch do CPD',
  tipo: 'conta-administrativa',
  classificacao: 'equipamento',
  identificador: 'admin',
  endereco: null,
  pessoa: null,
  validade: null,
  proximaRotacao: null,
  situacao: 'ativo',
  notas: null,
  ativos: [],
  valorTrocadoEm: '2026-10-01T12:00:00.000Z',
  criadoEm: '2026-10-01T12:00:00.000Z',
  atualizadoEm: '2026-10-01T12:00:00.000Z',
  permite: { revelar: true, administrar: false },
};

const SENHA = 'S3nh@ do switch';
const MINUTO = 60_000;
const USA = naOrganizacao('cofre.usar');

const problema = (status: number, codigo: string, detalhe: string) =>
  Response.json(
    {
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
    },
    { status },
  );

const cofreFechado = () =>
  problema(403, 'cofre-fechado', 'Confirme o código do app para revelar e copiar.');

/**
 * O cofre no servidor do teste: a liberação vale até o momento guardado, e a revelação e a cópia
 * respondem o valor só com ela em vigor, como a API.
 */
function servidorDoCofre({ liberadoAte = null as string | null } = {}) {
  const estado = { liberadoAte, ficha: SWITCH };
  const codigos: string[] = [];
  const pedidos: string[] = [];
  const liberado = () =>
    estado.liberadoAte !== null && new Date(estado.liberadoAte).getTime() > Date.now();
  const valor = (pedido: string) => () => {
    pedidos.push(pedido);
    return liberado() ? Response.json({ valor: SENHA }) : cofreFechado();
  };
  const servidor: ServidorDeTeste = {
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
    'GET /api/cofre/segredos': () =>
      Response.json({ segredos: [estado.ficha], permite: { cadastrar: false } }),
    'GET /api/cofre/segredos/switch': () => Response.json(estado.ficha),
    'GET /api/cofre/liberacao': () =>
      Response.json({ liberadoAte: liberado() ? estado.liberadoAte : null }),
    'POST /api/cofre/liberacao': async (pedido) => {
      const { codigo } = (await pedido.json()) as { codigo: string };
      codigos.push(codigo);
      if (codigo !== '123456') {
        return problema(
          401,
          'codigo-invalido',
          'Código incorreto. Confira se o relógio do celular está certo e tente de novo.',
        );
      }
      estado.liberadoAte = new Date(Date.now() + 5 * MINUTO).toISOString();
      return Response.json({ liberadoAte: estado.liberadoAte });
    },
    'POST /api/cofre/segredos/switch/revelacao': valor('revelacao'),
    'POST /api/cofre/segredos/switch/copia': valor('copia'),
  };
  return { servidor, estado, codigos, pedidos };
}

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  canal: CanalDeEventos = criarCanalDeEventos(),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(USA, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return roteador;
}

function relogioFalso() {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  vi.setSystemTime(new Date('2026-10-12T17:27:00.000Z'));
}

function areaDeTransferencia() {
  const escrever = vi.fn(async (_texto: string) => {});
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: escrever },
    configurable: true,
  });
  return escrever;
}

const avancar = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe('revelar e copiar', () => {
  it('com o cofre fechado, "Revelar" pede o código e continua sozinho', async () => {
    relogioFalso();
    const { servidor, codigos, estado } = servidorDoCofre();
    abrir('/cofre/switch', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Revelar' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo.textContent).toContain(
      'Revelar e copiar ficam liberados por 5 minutos nesta sessão.',
    );
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Código do app' }), {
      target: { value: '123456' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(SENHA)).toBeTruthy();
    expect(codigos).toEqual(['123456']);
    expect(screen.queryByRole('dialog')).toBeNull();
    const ate = criarDataHora().formatarHora(new Date(estado.liberadoAte ?? ''));
    expect(screen.getByText(`Cofre liberado até ${ate}`)).toBeTruthy();
  });

  it('o código errado fica no pedido, com a recusa da API', async () => {
    const { servidor } = servidorDoCofre();
    abrir('/cofre/switch', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Código do app' }), {
      target: { value: '000000' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    expect(
      await within(dialogo).findByText(
        'Código incorreto. Confira se o relógio do celular está certo e tente de novo.',
      ),
    ).toBeTruthy();
  });

  it('com o cofre liberado, revela sem o código, e o valor some depois de 30 segundos', async () => {
    relogioFalso();
    const { servidor } = servidorDoCofre({
      liberadoAte: new Date(Date.now() + 5 * MINUTO).toISOString(),
    });
    abrir('/cofre/switch', servidor);
    expect(await screen.findByText(/^Cofre liberado até/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Revelar' }));
    const revelado = await screen.findByText(SENHA);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Em fonte mono, para não confundir l, 1 e I.
    expect(revelado.className).toMatch(/valor/);
    await avancar(29_000);
    expect(screen.queryByText(SENHA)).toBeTruthy();
    await avancar(1_500);
    await waitFor(() => expect(screen.queryByText(SENHA)).toBeNull());
    expect(screen.getByRole('button', { name: 'Revelar' })).toBeTruthy();
  });

  it('"Copiar" põe o valor na área de transferência sem mostrá-lo e diz "Copiado"', async () => {
    relogioFalso();
    const escrever = areaDeTransferencia();
    const { servidor, pedidos } = servidorDoCofre({
      liberadoAte: new Date(Date.now() + 5 * MINUTO).toISOString(),
    });
    abrir('/cofre/switch', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(escrever).toHaveBeenCalledWith(SENHA));
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeTruthy();
    expect(screen.queryByText(SENHA)).toBeNull();
    expect(pedidos).toEqual(['copia']);
  });

  it('terminada a liberação, o aviso some, e a ação seguinte pede o código de novo', async () => {
    relogioFalso();
    const { servidor } = servidorDoCofre({
      liberadoAte: new Date(Date.now() + 10_000).toISOString(),
    });
    abrir('/cofre/switch', servidor);
    expect(await screen.findByText(/^Cofre liberado até/)).toBeTruthy();
    await avancar(11_000);
    await waitFor(() => expect(screen.queryByText(/^Cofre liberado até/)).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Revelar' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('o segredo que o cofre não abre mostra a frase da API', async () => {
    const { servidor } = servidorDoCofre({
      liberadoAte: new Date(Date.now() + 5 * MINUTO).toISOString(),
    });
    servidor['POST /api/cofre/segredos/switch/revelacao'] = () =>
      problema(
        500,
        'segredo-nao-abre',
        'O cofre não abre este segredo: confira a chave mestra na configuração do servidor.',
      );
    abrir('/cofre/switch', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Revelar' }));
    expect(
      await screen.findByText(
        'O cofre não abre este segredo: confira a chave mestra na configuração do servidor.',
      ),
    ).toBeTruthy();
  });

  it('sem o alcance, a ficha não oferece revelar nem copiar', async () => {
    const { servidor, estado } = servidorDoCofre();
    estado.ficha = { ...SWITCH, permite: { revelar: false, administrar: false } };
    abrir('/cofre/switch', servidor);
    await screen.findByRole('heading', { name: /Switch do CPD/ });
    expect(screen.queryByRole('button', { name: 'Revelar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copiar' })).toBeNull();
  });
});

describe('o cofre na busca e nos eventos', () => {
  it('a busca mostra os segredos pelo nome, com o tipo, e leva à ficha', async () => {
    const GET = vi.fn(async () => ({
      data: { segredos: [SWITCH], permite: { cadastrar: false } },
      response: new Response(),
    }));
    const api = { GET } as unknown as ClienteDaApi;
    const resultados = await provedorDeSegredos.buscar('switch', new AbortController().signal, api);
    expect(resultados).toEqual([
      {
        id: 'switch',
        rotulo: 'Switch do CPD',
        caminho: 'Conta administrativa · admin',
        destino: '/cofre/switch',
      },
    ]);
    expect(GET).toHaveBeenCalledWith('/cofre/segredos', {
      params: { query: { busca: 'switch' } },
      signal: expect.any(AbortSignal),
    });
    expect(cofre.busca?.provedores).toContain(provedorDeSegredos);
  });

  it('"Novo segredo" fica na busca para quem administra o cofre', () => {
    expect(ENTRADAS_DO_COFRE).toEqual([
      expect.objectContaining({
        rotulo: 'Novo segredo',
        destino: '/cofre/novo',
        permissoes: ['cofre.administrar'],
      }),
    ]);
  });

  it('o evento cofre.mudou relê a lista aberta', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDoCofre();
    abrir('/cofre', servidor, canal);
    await screen.findByText('Switch do CPD');
    estado.ficha = { ...SWITCH, nome: 'Switch do CPD (novo)' };
    canal.publicar({
      id: 'e1',
      tipo: 'cofre.mudou',
      momento: '2026-10-12T12:00:00.000Z',
      alvo: { tipo: 'segredo', id: 'switch' },
    });
    expect(await screen.findByText('Switch do CPD (novo)')).toBeTruthy();
  });
});
