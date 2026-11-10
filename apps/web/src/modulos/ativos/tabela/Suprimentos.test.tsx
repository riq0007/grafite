// As colunas Suprimentos e Total de páginas na tabela dos ativos (spec cadastro-de-ativos, "Colunas
// da tabela dos ativos" e "Ordenação e filtros dos ativos"; change p2b-impressoras-por-snmp, design,
// decisões 8 e 10): o número em fonte mono, a descrição do suprimento ao lado e a idade, como a
// disponibilidade, e o filtro "de e até" em percentual e em páginas.
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

const suprimentos = (nivel: number, minutos: number, paginas = 12500): Ativo['suprimentos'] => ({
  menor: { nivel, descricao: 'Black Toner Cartridge', momento: antes(minutos) },
  total: { paginas, momento: antes(minutos) },
});

/** O servidor com a impressora ligada aos suprimentos, pelo campo IP. */
function servidorComSuprimentos(itens: () => Ativo[]) {
  const { servidor, pedidos } = servidorDeAtivos(() => lista(itens()));
  servidor['GET /api/tipos-de-ativo'] = () =>
    Response.json({
      tipos: [
        {
          ...IMPRESSORA,
          capacidades: ['snmp.suprimentos'],
          configuracaoDasCapacidades: {
            'snmp.suprimentos': { campoDoIp: IP, versao: '2c', segredoId: null },
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

const COM_AS_COLUNAS =
  '/ativos?visao=fabrica&colunas=ativo.rotulo,coleta.suprimentos,coleta.paginas';

/** Os filtros do último pedido à API. */
const filtrosPedidos = (pedidos: URLSearchParams[]) =>
  JSON.parse(pedidos.at(-1)?.get('filtros') ?? '[]');

/** Os filtros ativos à vista, em texto. */
const ativos = () =>
  within(screen.getByRole('group', { name: 'Filtros ativos' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

async function filtrar(coluna: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
  const painel = await screen.findByRole('dialog', { name: 'Filtros' });
  fireEvent.click(within(painel).getByRole('option', { name: coluna }));
  return within(painel).findByRole('form', { name: coluna });
}

describe('os suprimentos na tabela dos ativos', () => {
  it('mostra o menor nível com o suprimento ao lado e o total de páginas, com a idade', async () => {
    const NOBREAK = ativo('a3', 'Nobreak da sala', { suprimentos: null });
    const { servidor } = servidorComSuprimentos(() => [
      { ...M404, suprimentos: suprimentos(8, 3) },
      { ...RH, suprimentos: { menor: null, total: null } },
      NOBREAK,
    ]);
    abrir(COM_AS_COLUNAS, servidor);
    expect(await cabecalhos()).toEqual(['Imagem', 'Ativo', 'Suprimentos', 'Total de páginas']);
    const [m404, rh, nobreak] = await linhas();

    const nivel = within(celula(m404, 2));
    expect(nivel.getByText('8%').classList.contains('mono')).toBe(true);
    expect(nivel.getByText('Black Toner Cartridge')).toBeTruthy();
    // O medidor compacto do menor nível, na tinta do suprimento (change suprimentos-rostos-e-backups).
    const medidor = nivel.getByRole('meter', { name: 'Menor nível: Black Toner Cartridge' });
    expect(medidor.getAttribute('aria-valuetext')).toBe('8%');
    expect(medidor.closest('[data-tinta]')?.getAttribute('data-tinta')).toBe('preto');
    expect(nivel.getByText('há 3 min')).toBeTruthy();
    expect(nivel.queryByText('Desatualizado')).toBeNull();
    const total = within(celula(m404, 3));
    expect(total.getByText('12.500').classList.contains('mono')).toBe(true);
    expect(total.getByText('há 3 min')).toBeTruthy();

    expect(celula(rh, 2).textContent).toBe('—');
    expect(celula(rh, 3).textContent).toBe('—');
    expect(celula(nobreak, 2).textContent).toBe('—');
  });

  it('a leitura de mais de 30 minutos diz "Desatualizado"', async () => {
    const { servidor } = servidorComSuprimentos(() => [
      { ...M404, suprimentos: suprimentos(40, 31) },
    ]);
    abrir(COM_AS_COLUNAS, servidor);
    const [m404] = await linhas();
    expect(within(celula(m404, 2)).getByText('Desatualizado')).toBeTruthy();
    expect(within(celula(m404, 3)).getByText('Desatualizado')).toBeTruthy();
  });

  it('filtra os suprimentos de 0% até 20%, em percentual, e o filtro diz a unidade', async () => {
    const { servidor, pedidos } = servidorComSuprimentos(() => []);
    abrir(COM_AS_COLUNAS, servidor);
    await screen.findByText('Nenhum ativo encontrado.');
    const editor = await filtrar('Suprimentos');
    fireEvent.change(within(editor).getByRole('textbox', { name: 'De (%)' }), {
      target: { value: '0' },
    });
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Até (%)' }), {
      target: { value: '20' },
    });
    fireEvent.click(within(editor).getByRole('button', { name: 'Aplicar filtro' }));
    await waitFor(() =>
      expect(filtrosPedidos(pedidos)).toContainEqual({
        chave: 'coleta.suprimentos',
        operador: 'entre',
        de: 0,
        ate: 20,
      }),
    );
    await waitFor(() => expect(ativos()).toContain('Suprimentos · de 0% até 20%'));
  });

  it('filtra o total de páginas em páginas, com os milhares', async () => {
    const { servidor, pedidos } = servidorComSuprimentos(() => []);
    abrir(COM_AS_COLUNAS, servidor);
    await screen.findByText('Nenhum ativo encontrado.');
    const editor = await filtrar('Total de páginas');
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Até' }), {
      target: { value: '10.000' },
    });
    fireEvent.click(within(editor).getByRole('button', { name: 'Aplicar filtro' }));
    await waitFor(() =>
      expect(filtrosPedidos(pedidos)).toContainEqual({
        chave: 'coleta.paginas',
        operador: 'entre',
        ate: 10000,
      }),
    );
    await waitFor(() => expect(ativos()).toContain('Total de páginas · até 10.000'));
  });

  it('com as colunas à vista, a lista é relida a cada 60 s', async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    const { servidor, pedidos } = servidorComSuprimentos(() => [
      { ...M404, suprimentos: suprimentos(8, 3) },
    ]);
    abrir('/ativos?visao=fabrica&colunas=ativo.rotulo,coleta.paginas', servidor);
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
describe('os suprimentos numa coluna estreita', () => {
  it('põe o medidor e o nível na parte fixa, e a descrição e a idade na que encolhe', async () => {
    const { servidor } = servidorComSuprimentos(() => [
      { ...M404, suprimentos: suprimentos(8, 3) },
    ]);
    abrir(COM_AS_COLUNAS, servidor);
    const [m404] = await linhas();

    const fixo = celula(m404, 2).querySelector('[data-parte="fixo"]') as HTMLElement;
    expect(
      within(fixo).getByRole('meter', { name: 'Menor nível: Black Toner Cartridge' }),
    ).toBeTruthy();
    expect(within(fixo).getByText('8%')).toBeTruthy();
    const resto = celula(m404, 2).querySelector('[data-parte="resto"]') as HTMLElement;
    expect([...resto.children].map((parte) => parte.textContent)).toEqual([
      'Black Toner Cartridge',
      'há 3 min',
    ]);
  });

  it('põe o total de páginas na parte fixa, e a idade na que encolhe', async () => {
    const { servidor } = servidorComSuprimentos(() => [
      { ...M404, suprimentos: suprimentos(8, 3) },
    ]);
    abrir(COM_AS_COLUNAS, servidor);
    const [m404] = await linhas();

    expect(celula(m404, 3).querySelector('[data-parte="fixo"]')?.textContent).toBe('12.500');
    expect(celula(m404, 3).querySelector('[data-parte="resto"]')?.textContent).toBe('há 3 min');
  });

  it('a leitura velha põe o "Desatualizado" na parte fixa, ao lado do nível', async () => {
    const { servidor } = servidorComSuprimentos(() => [
      { ...M404, suprimentos: suprimentos(8, 45) },
    ]);
    abrir(COM_AS_COLUNAS, servidor);
    const [m404] = await linhas();

    const fixo = celula(m404, 2).querySelector('[data-parte="fixo"]') as HTMLElement;
    expect(within(fixo).getByText('Desatualizado')).toBeTruthy();
    expect(within(celula(m404, 3)).getByText('Desatualizado').closest('[data-parte]')).toBe(
      celula(m404, 3).querySelector('[data-parte="fixo"]'),
    );
  });
});
