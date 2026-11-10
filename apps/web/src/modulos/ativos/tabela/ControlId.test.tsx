// A coluna Control iD na tabela dos ativos (spec saude-do-control-id, "Situação do Control iD", e
// cadastro-de-ativos, "Coluna do Control iD" e "Controles sem resposta"; change
// p2c-saude-do-control-id, design, decisões 7 e 8): a situação em texto, com o ícone e a idade, como
// a disponibilidade, e o filtro "é qualquer de" entre as situações, com as contagens.
import { filaDeAvisos } from '@grafite/ui';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const sondado = (
  situacao: 'respondendo' | 'sem-resposta',
  minutos: number,
): Ativo['controlId'] => ({
  situacao,
  momento: antes(minutos),
  desde: antes(60),
  motivo: null,
  ultimoContato: antes(minutos),
  firmware: '6.12.2',
  produto: 'iDAccess Pro',
  login: 'tipo',
  coletor: 'Coletor de Jundiaí',
});

const CAMERA = ativo('a4', 'Controle da portaria', {
  controlId: {
    situacao: 'nao-verificado',
    momento: null,
    desde: null,
    motivo: 'Sem IP',
    ultimoContato: null,
    firmware: null,
    produto: null,
    login: null,
    coletor: null,
  },
});
const NOBREAK = ativo('a3', 'Nobreak da sala', { controlId: null });

/** O servidor com o tipo ligado à saúde do Control iD, pelo campo IP. */
function servidorComControlId(itens: () => Ativo[]) {
  const { servidor, pedidos } = servidorDeAtivos(() => lista(itens()));
  servidor['GET /api/tipos-de-ativo'] = () =>
    Response.json({
      tipos: [
        {
          ...IMPRESSORA,
          capacidades: ['controlid.saude'],
          configuracaoDasCapacidades: {
            'controlid.saude': {
              campoDoIp: IP,
              porta: 80,
              segredoId: '0199d3a0-0000-7000-8000-00000000d001',
            },
          },
          campos: CAMPOS.map((um) => ({ campoId: um.id, obrigatorio: false })),
          situacao: 'ativo',
          permite: { editar: false },
        },
      ],
      permite: { cadastrar: false },
    });
  return { servidor, pedidos };
}

const COM_A_COLUNA = '/ativos?visao=fabrica&colunas=ativo.rotulo,coleta.control-id';

describe('o Control iD na tabela dos ativos', () => {
  it('mostra a situação em texto, com o ícone e a idade; a sondagem velha diz "Desatualizado"', async () => {
    const { servidor } = servidorComControlId(() => [
      { ...M404, controlId: sondado('respondendo', 2) },
      { ...RH, controlId: sondado('sem-resposta', 20) },
      CAMERA,
      NOBREAK,
    ]);
    abrir(COM_A_COLUNA, servidor);
    expect(await cabecalhos()).toEqual(['Imagem', 'Ativo', 'Control iD']);
    const [m404, rh, camera, nobreak] = await linhas();

    const naM404 = within(celula(m404, 2));
    expect(
      naM404.getByText('Respondendo').closest('[data-situacao]')?.getAttribute('data-situacao'),
    ).toBe('sucesso');
    expect(naM404.getByText('há 2 min')).toBeTruthy();
    expect(naM404.queryByText('Desatualizado')).toBeNull();

    const naRh = within(celula(rh, 2));
    expect(
      naRh.getByText('Sem resposta').closest('[data-situacao]')?.getAttribute('data-situacao'),
    ).toBe('critico');
    expect(naRh.getByText('há 20 min')).toBeTruthy();
    expect(naRh.getByText('Desatualizado')).toBeTruthy();

    expect(celula(camera, 2).textContent).toBe('Não verificado');
    expect(celula(nobreak, 2).textContent).toBe('—');
  });

  it('filtra por "é qualquer de" entre as situações, com quantos ativos cada uma traz', async () => {
    const { servidor, pedidos } = servidorComControlId(() => []);
    servidor['GET /api/ativos/contagens'] = () =>
      Response.json({
        coluna: 'coleta.control-id',
        total: 5,
        opcoes: [
          { valor: 'sem-resposta', quantos: 2 },
          { valor: 'login-recusado', quantos: 1 },
          { valor: 'respondendo', quantos: 2 },
        ],
      });
    abrir(COM_A_COLUNA, servidor);
    await screen.findByText('Nenhum ativo encontrado.');
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const painel = await screen.findByRole('dialog', { name: 'Filtros' });
    fireEvent.click(within(painel).getByRole('option', { name: 'Control iD' }));
    const editor = await within(painel).findByRole('form', { name: 'Control iD' });
    // As situações na ordem delas, com as que não trazem nenhum ativo no fim, com "(0)".
    await waitFor(() =>
      expect(
        within(editor)
          .getAllByRole('checkbox')
          .map((opcao) => opcao.closest('label')?.textContent),
      ).toEqual([
        'Respondendo (2)',
        'Login recusado (1)',
        'Sem resposta (2)',
        'Resposta inesperada (0)',
        'Sem dado (0)',
        'Não verificado (0)',
      ]),
    );
    fireEvent.click(within(editor).getByRole('checkbox', { name: 'Sem resposta (2)' }));
    fireEvent.click(within(editor).getByRole('checkbox', { name: 'Login recusado (1)' }));
    fireEvent.click(within(editor).getByRole('button', { name: 'Mostrar 3 ativos' }));
    await waitFor(() =>
      expect(JSON.parse(pedidos.at(-1)?.get('filtros') ?? '[]')).toContainEqual({
        chave: 'coleta.control-id',
        operador: 'qualquer',
        valores: expect.arrayContaining(['sem-resposta', 'login-recusado']),
      }),
    );
  });

  it('com a coluna à vista, a lista é relida a cada 60 s', async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    const { servidor, pedidos } = servidorComControlId(() => [
      { ...M404, controlId: sondado('respondendo', 2) },
    ]);
    abrir(COM_A_COLUNA, servidor);
    await linhas();
    const antesDaReleitura = pedidos.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(antesDaReleitura));
  });
});

// A célula numa linha só (spec componentes-base, "Célula numa linha só"; change celulas-numa-linha,
// design, decisão 2).
describe('o Control iD numa coluna estreita', () => {
  it('leitura desatualizada: os dois rótulos na parte fixa, e a idade na que encolhe', async () => {
    const { servidor } = servidorComControlId(() => [
      { ...RH, controlId: sondado('sem-resposta', 20) },
      CAMERA,
    ]);
    abrir(COM_A_COLUNA, servidor);
    const [rh, camera] = await linhas();

    const fixo = celula(rh, 2).querySelector('[data-parte="fixo"]') as HTMLElement;
    expect(within(fixo).getByText('Sem resposta')).toBeTruthy();
    expect(within(fixo).getByText('Desatualizado')).toBeTruthy();
    expect(celula(rh, 2).querySelector('[data-parte="resto"]')?.textContent).toBe('há 20 min');

    expect(celula(camera, 2).querySelector('[data-parte="fixo"]')?.textContent).toBe(
      'Não verificado',
    );
    expect(celula(camera, 2).querySelector('[data-parte="resto"]')).toBeNull();
  });
});
