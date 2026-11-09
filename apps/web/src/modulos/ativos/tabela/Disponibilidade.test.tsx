import { filaDeAvisos } from '@grafite/ui';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { naOrganizacao } from '../../../teste/sessao.ts';
import {
  type Ativo,
  abrir,
  ativo,
  CAMPOS,
  cabecalhos,
  celula,
  IMPRESSORA,
  IP,
  linhas,
  lista,
  M404,
  RH,
  servidorDeAtivos,
  tabela,
} from './teste.tsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
});

const MINUTO = 60_000;
// Meio minuto a mais: a idade na tela não cai para o minuto de baixo quando a resposta chega
// depois do relógio da tela.
const antes = (minutos: number) => new Date(Date.now() - (minutos + 0.5) * MINUTO).toISOString();

const online = (momento: string): Ativo['disponibilidade'] => ({
  situacao: 'online',
  momento,
  desde: antes(60),
  motivo: null,
  latencia: { valor: 3, inconsistente: false },
  coletor: 'Coletor de Jundiaí',
});

const NOBREAK = ativo('a3', 'Nobreak da sala', { disponibilidade: null });
const CAMERA = ativo('a4', 'Câmera da portaria', {
  disponibilidade: {
    situacao: 'nao-verificado',
    momento: null,
    desde: null,
    motivo: 'Sem IP',
    latencia: null,
    coletor: null,
  },
});

/** O servidor com a impressora ligada à disponibilidade, pelo campo IP. */
function servidorComDisponibilidade(itens: () => Ativo[]) {
  const { servidor, pedidos } = servidorDeAtivos(() => lista(itens()));
  servidor['GET /api/tipos-de-ativo'] = () =>
    Response.json({
      tipos: [
        {
          ...IMPRESSORA,
          capacidades: ['rede.disponibilidade'],
          configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: IP } },
          campos: CAMPOS.map((um) => ({ campoId: um.id, obrigatorio: false })),
          situacao: 'ativo',
          permite: { editar: false },
        },
      ],
      permite: { cadastrar: false },
    });
  return { servidor, pedidos };
}

const COM_A_COLUNA = '/ativos?visao=fabrica&colunas=ativo.rotulo,coleta.disponibilidade';

describe('a disponibilidade na tabela dos ativos', () => {
  it('mostra a situação em texto, com o ícone e a idade; a leitura velha diz "Desatualizado"', async () => {
    const { servidor } = servidorComDisponibilidade(() => [
      { ...M404, disponibilidade: online(antes(2)) },
      {
        ...RH,
        disponibilidade: {
          ...(online(antes(20)) as NonNullable<Ativo['disponibilidade']>),
          situacao: 'offline',
          latencia: null,
        },
      },
      CAMERA,
      NOBREAK,
    ]);
    abrir(COM_A_COLUNA, servidor);
    expect(await cabecalhos()).toEqual(['Imagem', 'Ativo', 'Disponibilidade']);
    const [m404, rh, camera, nobreak] = await linhas();

    const naM404 = within(celula(m404, 2));
    expect(
      naM404.getByText('Online').closest('[data-situacao]')?.getAttribute('data-situacao'),
    ).toBe('sucesso');
    expect(naM404.getByText('há 2 min')).toBeTruthy();
    expect(naM404.queryByText('Desatualizado')).toBeNull();

    const naRh = within(celula(rh, 2));
    expect(
      naRh.getByText('Offline').closest('[data-situacao]')?.getAttribute('data-situacao'),
    ).toBe('critico');
    expect(naRh.getByText('há 20 min')).toBeTruthy();
    expect(naRh.getByText('Desatualizado')).toBeTruthy();

    expect(celula(camera, 2).textContent).toBe('Não verificado');
    expect(celula(nobreak, 2).textContent).toBe('—');
  });

  it('a idade mostra o momento exato ao parar o mouse', async () => {
    const momento = antes(2);
    const { servidor } = servidorComDisponibilidade(() => [
      { ...M404, disponibilidade: online(momento) },
    ]);
    abrir(COM_A_COLUNA, servidor);
    const [m404] = await linhas();
    const idade = within(celula(m404, 2)).getByText('há 2 min');
    expect(idade.closest('time')?.getAttribute('datetime')).toBe(momento);
    expect(idade.closest('[title]')?.getAttribute('title')).toMatch(
      /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/,
    );
  });

  it('filtra por "é qualquer de" entre as situações, com quantos ativos cada uma traz', async () => {
    const { servidor, pedidos } = servidorComDisponibilidade(() => []);
    servidor['GET /api/ativos/contagens'] = () =>
      Response.json({
        coluna: 'coleta.disponibilidade',
        total: 4,
        opcoes: [
          { valor: 'online', quantos: 3 },
          { valor: 'offline', quantos: 1 },
        ],
      });
    abrir(COM_A_COLUNA, servidor);
    await screen.findByText('Nenhum ativo encontrado.');
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const painel = await screen.findByRole('dialog', { name: 'Filtros' });
    fireEvent.click(within(painel).getByRole('option', { name: 'Disponibilidade' }));
    const editor = await within(painel).findByRole('form', { name: 'Disponibilidade' });
    // As situações sem nenhum ativo vão ao fim, com "(0)".
    await waitFor(() =>
      expect(
        within(editor)
          .getAllByRole('checkbox')
          .map((opcao) => opcao.closest('label')?.textContent),
      ).toEqual(['Online (3)', 'Offline (1)', 'Sem dado (0)', 'Não verificado (0)']),
    );
    fireEvent.click(within(editor).getByRole('checkbox', { name: 'Offline (1)' }));
    fireEvent.click(within(editor).getByRole('checkbox', { name: 'Sem dado (0)' }));
    fireEvent.click(within(editor).getByRole('button', { name: 'Mostrar 1 ativo' }));
    await waitFor(() =>
      expect(JSON.parse(pedidos.at(-1)?.get('filtros') ?? '[]')).toContainEqual({
        chave: 'coleta.disponibilidade',
        operador: 'qualquer',
        valores: ['offline', 'sem-dado'],
      }),
    );
  });

  it('o evento disponibilidade.mudou relê a lista', async () => {
    const canal = criarCanalDeEventos();
    let disponibilidade = online(antes(2));
    const { servidor } = servidorComDisponibilidade(() => [{ ...M404, disponibilidade }]);
    abrir(COM_A_COLUNA, servidor, undefined, canal);
    const [m404] = await linhas();
    expect(within(celula(m404, 2)).getByText('Online')).toBeTruthy();
    disponibilidade = {
      ...(online(antes(0)) as NonNullable<Ativo['disponibilidade']>),
      situacao: 'offline',
      latencia: null,
    };
    canal.publicar({
      id: 'e1',
      tipo: 'disponibilidade.mudou',
      momento: new Date().toISOString(),
      alvo: { tipo: 'ativo', id: 'a1' },
    });
    await waitFor(async () => {
      const [depois] = await linhas();
      expect(within(celula(depois, 2)).getByText('Offline')).toBeTruthy();
    });
  });

  it('com a coluna à vista, a lista é relida a cada 60 s, e a idade anda', async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    vi.setSystemTime(new Date('2026-10-12T12:00:00.000Z'));
    const { servidor, pedidos } = servidorComDisponibilidade(() => [
      { ...M404, disponibilidade: online('2026-10-12T11:58:00.000Z') },
    ]);
    abrir(COM_A_COLUNA, servidor);
    const [m404] = await linhas();
    expect(within(celula(m404, 2)).getByText('há 2 min')).toBeTruthy();
    const antesDaReleitura = pedidos.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(async () => {
      const [depois] = await linhas();
      expect(within(celula(depois, 2)).getByText('há 3 min')).toBeTruthy();
    });
    expect(pedidos.length).toBeGreaterThan(antesDaReleitura);
  });

  it('sem a coluna, a lista não é relida sozinha', async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    const { servidor, pedidos } = servidorComDisponibilidade(() => [M404]);
    abrir('/ativos?visao=fabrica&colunas=ativo.rotulo', servidor, naOrganizacao('ativos.ver'));
    await tabela();
    await linhas();
    const antesDaEspera = pedidos.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(pedidos.length).toBe(antesDaEspera);
  });
});
