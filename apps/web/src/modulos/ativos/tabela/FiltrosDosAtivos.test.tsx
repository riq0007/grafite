import { filaDeAvisos } from '@grafite/ui';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { campoDeLocal, escolherLocal } from '../../../teste/escolhas.ts';
import { naOrganizacao } from '../../../teste/sessao.ts';
import {
  abrir,
  DONO,
  FOTO,
  JUNDIAI,
  lista,
  M404,
  NOTA,
  PORTAS,
  REFERENCIAS,
  RH,
  servidorDeAtivos,
  tabela,
} from './teste.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
});

const SO_ATIVOS = { chave: 'ativo.situacao', operador: 'situacao', situacao: 'ativos' };

/** Os filtros do último pedido à API. */
const filtrosPedidos = (pedidos: URLSearchParams[]) =>
  JSON.parse(pedidos.at(-1)?.get('filtros') ?? '[]');

/** Os filtros ativos à vista, em texto. */
const ativos = () =>
  within(screen.getByRole('group', { name: 'Filtros ativos' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

/** O painel de filtros aberto. */
const painel = () => screen.findByRole('dialog', { name: 'Filtros' });

/** Abre o painel de filtros pelo botão "Filtros" e escolhe a coluna: o editor dela fica à direita. */
async function filtrar(coluna: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
  const aberto = await painel();
  fireEvent.click(within(aberto).getByRole('option', { name: coluna }));
  await within(aberto).findByRole('form', { name: coluna });
  return aberto;
}

/** O endereço da tabela com os filtros dados, além do de só os ativos. */
const comFiltros = (...filtros: object[]) =>
  `/ativos?visao=fabrica&filtros=${encodeURIComponent(JSON.stringify([SO_ATIVOS, ...filtros]))}`;

describe('os filtros da tabela dos ativos', () => {
  it('o filtro de texto vai ao pedido e fica guardado na conta, e aparece nos filtros ativos', async () => {
    const { servidor, pedidos, gravacoes } = servidorDeAtivos();
    const roteador = abrir('/ativos', servidor);
    await tabela();
    const editor = await filtrar('Hostname');
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Texto' }), {
      target: { value: 'almox' },
    });
    fireEvent.click(within(editor).getByRole('button', { name: 'Aplicar filtro' }));
    const hostname = { chave: 'ativo.hostname', operador: 'contem', texto: 'almox' };
    await waitFor(() => expect(filtrosPedidos(pedidos)).toEqual([SO_ATIVOS, hostname]));
    expect(ativos()).toEqual(['Hostname · contém · almox']);
    // A mudança fica na conta, e não no endereço (change visoes-da-conta).
    await waitFor(() =>
      expect(gravacoes.at(-1)).toMatchObject({
        metodo: 'PUT',
        visao: 'fabrica',
        definicao: { filtros: [SO_ATIVOS, hostname] },
      }),
    );
    expect(roteador.state.location.search).toEqual({ visao: 'fabrica' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Limpar o filtro Hostname: contém almox' }));
    await waitFor(() => expect(filtrosPedidos(pedidos)).toEqual([SO_ATIVOS]));
    expect(screen.queryByRole('group', { name: 'Filtros ativos' })).toBeNull();
    // Igual à visão de fábrica, a tabela volta a ela: as mudanças da conta saem.
    await waitFor(() => expect(gravacoes.at(-1)).toEqual({ metodo: 'DELETE', visao: 'fabrica' }));
  });

  it('o tipo pelas opções do catálogo e o local pela árvore, com tudo dentro dele', async () => {
    const { servidor, pedidos } = servidorDeAtivos(() => lista([], null, 0));
    abrir('/ativos', {
      ...servidor,
      'GET /api/ativos': (pedido) => {
        pedidos.push(new URL(pedido.url).searchParams);
        return Response.json({
          itens: [],
          proximo: null,
          total: 0,
          referencias: { ...REFERENCIAS, locais: { [JUNDIAI]: 'Jundiaí' } },
          permite: { cadastrar: true },
        });
      },
    });
    await screen.findByText('Nenhum ativo encontrado.');
    const tipo = await filtrar('Tipo');
    fireEvent.click(await within(tipo).findByRole('checkbox', { name: 'Impressora (2)' }));
    fireEvent.click(within(tipo).getByRole('button', { name: 'Mostrar 2 ativos' }));
    await waitFor(() =>
      expect(filtrosPedidos(pedidos)).toContainEqual({
        chave: 'ativo.tipo',
        operador: 'qualquer',
        valores: ['impressora'],
      }),
    );

    const local = await filtrar('Local');
    await escolherLocal('Local', 'Jundiaí', local);
    await waitFor(() => expect(campoDeLocal('Local', local).textContent).toContain('Jundiaí'));
    fireEvent.click(within(local).getByRole('button', { name: 'Aplicar filtro' }));
    await waitFor(() =>
      expect(filtrosPedidos(pedidos)).toContainEqual({
        chave: 'ativo.local',
        operador: 'em',
        local: JUNDIAI,
      }),
    );
    await waitFor(() => expect(ativos()).toEqual(['Tipo · Impressora', 'Local · em · Jundiaí']));
  });

  it('as pessoas pela busca na API, uma ou mais', async () => {
    const { servidor, pedidos } = servidorDeAtivos();
    abrir('/ativos', servidor);
    await tabela();
    const editor = await filtrar('Dono');
    const pessoas = within(editor).getByRole('combobox', { name: 'Pessoas' });
    pessoas.focus();
    fireEvent.change(pessoas, { target: { value: 'bru' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Bruno Lima' }));
    await waitFor(() => expect(screen.queryByRole('listbox', { name: 'Pessoas' })).toBeNull());
    expect(within(editor).getByRole('button', { name: 'Tirar Bruno Lima' })).toBeTruthy();
    fireEvent.click(within(editor).getByRole('button', { name: 'Aplicar filtro' }));
    await waitFor(() =>
      expect(filtrosPedidos(pedidos)).toContainEqual({
        chave: DONO,
        operador: 'qualquer',
        valores: ['bruno'],
      }),
    );
    await waitFor(() => expect(ativos()).toEqual(['Dono · é qualquer de · Bruno Lima']));
  });

  it('os fornecedores pela busca, com os inativos para quem vê os fornecedores', async () => {
    const { servidor, pedidos } = servidorDeAtivos();
    const fornecedor = (id: string, nome: string, situacao: 'ativo' | 'inativo') => ({
      id,
      nome,
      cnpj: null,
      contato: null,
      email: null,
      telefone: null,
      observacoes: null,
      situacao,
      criadoEm: '2026-10-14T12:00:00.000Z',
      atualizadoEm: '2026-10-14T12:00:00.000Z',
    });
    servidor['GET /api/fornecedores'] = () =>
      Response.json({
        itens: [
          fornecedor('hp', 'HP Brasil', 'ativo'),
          fornecedor('locadora', 'Locadora Norte', 'inativo'),
        ],
        total: 2,
        proximo: null,
        permite: { cadastrar: false },
      });
    abrir('/ativos', servidor, naOrganizacao('ativos.editar', 'ativos.ver', 'fornecedores.ver'));
    await tabela();
    const editor = await filtrar('Fornecedor');
    const fornecedores = within(editor).getByRole('combobox', { name: 'Fornecedores' });
    fornecedores.focus();
    fireEvent.change(fornecedores, { target: { value: 'loc' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Locadora Norte (inativo)' }));
    await waitFor(() => expect(screen.queryByRole('listbox', { name: 'Fornecedores' })).toBeNull());
    fireEvent.click(within(editor).getByRole('button', { name: 'Aplicar filtro' }));
    await waitFor(() =>
      expect(filtrosPedidos(pedidos)).toContainEqual({
        chave: 'ativo.fornecedor',
        operador: 'qualquer',
        valores: ['locadora'],
      }),
    );
  });

  it('o arquivo e a imagem se filtram só por "Está vazio" e "Está preenchido"', async () => {
    const { servidor, pedidos } = servidorDeAtivos();
    abrir(`/ativos?visao=fabrica&colunas=ativo.rotulo,${NOTA},${FOTO}`, servidor);
    await tabela();
    const editor = await filtrar('PDF da nota fiscal');
    expect(
      within(editor)
        .getAllByRole('radio')
        .map((opcao) => opcao.closest('label')?.textContent),
    ).toEqual(['Está vazio', 'Está preenchido']);
    fireEvent.click(within(editor).getByRole('radio', { name: 'Está vazio' }));
    fireEvent.click(within(editor).getByRole('button', { name: 'Aplicar filtro' }));
    await waitFor(() =>
      expect(filtrosPedidos(pedidos)).toEqual([SO_ATIVOS, { chave: NOTA, operador: 'vazio' }]),
    );
    expect(ativos()).toEqual(['PDF da nota fiscal · está vazio']);

    const daImagem = await filtrar('Foto da etiqueta');
    fireEvent.click(within(daImagem).getByRole('radio', { name: 'Está preenchido' }));
    fireEvent.click(within(daImagem).getByRole('button', { name: 'Aplicar filtro' }));
    await waitFor(() =>
      expect(filtrosPedidos(pedidos)).toEqual([
        SO_ATIVOS,
        { chave: NOTA, operador: 'vazio' },
        { chave: FOTO, operador: 'preenchido' },
      ]),
    );
  });

  it('a situação à vista na barra, fora dos filtros ativos', async () => {
    const { servidor, pedidos } = servidorDeAtivos();
    abrir('/ativos', servidor);
    await tabela();
    const [situacao] = screen
      .getAllByRole('button', { name: /Situação$/ })
      .filter((botao) => botao.getAttribute('aria-haspopup') === 'listbox');
    fireEvent.click(situacao as HTMLElement);
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Ativos',
      'Em uso',
      'Em estoque',
      'Em manutenção',
      'Inativos',
      'Todos',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Inativos' }));
    await waitFor(() =>
      expect(filtrosPedidos(pedidos)).toEqual([
        { chave: 'ativo.situacao', operador: 'situacao', situacao: 'inativos' },
      ]),
    );
    expect(screen.queryByRole('group', { name: 'Filtros ativos' })).toBeNull();
  });

  it('"Filtrar…" no menu da coluna abre o editor dela, já com o filtro que ela tem', async () => {
    abrir(
      '/ativos?visao=fabrica&filtros=' +
        encodeURIComponent(
          JSON.stringify([
            SO_ATIVOS,
            { chave: 'ativo.patrimonio', operador: 'contem', texto: '004' },
          ]),
        ),
      servidorDeAtivos().servidor,
    );
    await tabela();
    fireEvent.click(screen.getByRole('button', { name: 'Opções da coluna Patrimônio' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Filtrar…' }));
    // O painel inteiro, preso ao cabeçalho da coluna, já nela.
    const aberto = await painel();
    expect(
      within(aberto).getByRole('option', { name: 'Patrimônio' }).getAttribute('aria-selected'),
    ).toBe('true');
    const editor = await within(aberto).findByRole('form', { name: 'Patrimônio' });
    expect(within(editor).getByRole('textbox', { name: 'Texto' })).toHaveProperty('value', '004');
    expect(within(editor).getByRole('button', { name: 'Tirar filtro' })).toBeTruthy();
  });

  it('o painel lista as colunas que se filtram nos grupos, com "Filtrada" nas que têm filtro', async () => {
    abrir(
      comFiltros({ chave: 'ativo.patrimonio', operador: 'contem', texto: '004' }),
      servidorDeAtivos().servidor,
    );
    await tabela();
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const aberto = await painel();
    const patrimonio = within(aberto).getByRole('option', { name: 'Patrimônio' });
    expect(patrimonio.textContent).toBe('PatrimônioFiltrada');
    expect(within(aberto).getByRole('option', { name: 'Hostname' }).textContent).toBe('Hostname');
    // A situação fica na barra, e não no painel.
    expect(within(aberto).queryByRole('option', { name: 'Situação' })).toBeNull();
    expect(within(aberto).getByText('Escolha uma coluna para filtrar.')).toBeTruthy();
  });

  it('cada tipo diz quantos ativos traz, com a busca e os outros filtros, e o botão diz o resultado', async () => {
    const { servidor, contagens } = servidorDeAtivos();
    abrir('/ativos?visao=fabrica&busca=hp', servidor);
    await tabela();
    const aberto = await filtrar('Tipo');
    const rotulos = () =>
      within(aberto)
        .getAllByRole('checkbox')
        .map((caixa) => caixa.closest('label')?.textContent);
    await waitFor(() => expect(rotulos()).toEqual(['Impressora (2)', 'Switch (0)']));
    expect(contagens.at(-1)?.get('coluna')).toBe('ativo.tipo');
    expect(contagens.at(-1)?.get('busca')).toBe('hp');
    expect(JSON.parse(contagens.at(-1)?.get('filtros') ?? '[]')).toEqual([SO_ATIVOS]);
    fireEvent.click(within(aberto).getByRole('checkbox', { name: 'Impressora (2)' }));
    expect(within(aberto).getByRole('button', { name: 'Mostrar 2 ativos' })).toBeTruthy();
  });

  it('com o filtro de Tipo, o de Modelo traz primeiro os modelos do tipo, numa seção à parte', async () => {
    const { servidor, buscasDeModelos } = servidorDeAtivos();
    abrir(
      comFiltros({ chave: 'ativo.tipo', operador: 'qualquer', valores: ['impressora'] }),
      servidor,
    );
    await tabela();
    const aberto = await filtrar('Modelo');
    const modelos = within(aberto).getByRole('combobox', { name: 'Modelos' });
    modelos.focus();
    fireEvent.change(modelos, { target: { value: 'a' } });
    expect(await screen.findByText('Modelos de Impressora')).toBeTruthy();
    // A lista das sugestões, à parte da lista das colunas do painel.
    const sugestoes = (await screen.findByRole('option', { name: 'HP LaserJet M404' })).closest(
      '[role="listbox"]',
    ) as HTMLElement;
    expect(
      within(sugestoes)
        .getAllByRole('option')
        .map((opcao) => opcao.textContent),
    ).toEqual([
      // O leitor de tela ouve que a do tipo é sugerida.
      'HP LaserJet M404Sugerido: Modelos de Impressora',
      'Dell OptiPlex 7010',
    ]);
    expect(buscasDeModelos.some((busca) => busca.get('tipos') === 'impressora')).toBe(true);
  });

  it('o modelo de outro tipo continua no filtro, marcado "de outro tipo"', async () => {
    const { servidor } = servidorDeAtivos(() =>
      Response.json({
        itens: [M404, RH],
        proximo: null,
        total: 2,
        referencias: {
          ...REFERENCIAS,
          modelos: { optiplex: 'Dell OptiPlex 7010' },
          tiposDosModelos: { optiplex: 'computador' },
        },
        permite: { cadastrar: true },
      }),
    );
    abrir(
      comFiltros(
        { chave: 'ativo.modelo', operador: 'qualquer', valores: ['optiplex'] },
        { chave: 'ativo.tipo', operador: 'qualquer', valores: ['impressora'] },
      ),
      servidor,
    );
    await tabela();
    await waitFor(() =>
      expect(ativos()).toEqual([
        'Modelo · é qualquer de · Dell OptiPlex 7010 (de outro tipo)',
        'Tipo · Impressora',
      ]),
    );
  });

  it('o filtro ativo abre o editor dele preso ao rótulo, e Backspace nele o tira', async () => {
    const { servidor, pedidos } = servidorDeAtivos();
    abrir(comFiltros({ chave: 'ativo.patrimonio', operador: 'contem', texto: '004' }), servidor);
    await tabela();
    const rotulo = screen.getByRole('button', { name: 'Editar o filtro Patrimônio: contém 004' });
    fireEvent.click(rotulo);
    const editor = await screen.findByRole('dialog', { name: 'Filtro de Patrimônio' });
    expect(within(editor).getByRole('textbox', { name: 'Texto' })).toHaveProperty('value', '004');
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Texto' }), {
      target: { value: '0041' },
    });
    fireEvent.click(within(editor).getByRole('button', { name: 'Aplicar filtro' }));
    await waitFor(() =>
      expect(filtrosPedidos(pedidos)).toEqual([
        SO_ATIVOS,
        { chave: 'ativo.patrimonio', operador: 'contem', texto: '0041' },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Editar o filtro Patrimônio: contém 0041' }),
      { key: 'Backspace' },
    );
    await waitFor(() => expect(filtrosPedidos(pedidos)).toEqual([SO_ATIVOS]));
  });

  it('com o filtro de Tipo, os campos dos outros tipos ficam em "Outros tipos", recolhido', async () => {
    abrir(
      comFiltros({ chave: 'ativo.tipo', operador: 'qualquer', valores: ['impressora'] }),
      servidorDeAtivos().servidor,
    );
    await tabela();
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }));
    const colunas = await screen.findByRole('dialog', { name: 'Colunas' });
    expect(within(colunas).queryByRole('checkbox', { name: 'Portas' })).toBeNull();
    fireEvent.click(within(colunas).getByRole('button', { name: 'Mostrar Outros tipos (1)' }));
    expect(within(colunas).getByRole('checkbox', { name: 'Portas' })).toBeTruthy();
    expect(PORTAS).toBeTruthy();
  });

  it('vazia com filtro, "Limpar filtros" tira a busca e os filtros', async () => {
    const { servidor } = servidorDeAtivos(() => lista([]));
    const roteador = abrir('/ativos?visao=fabrica&busca=nada', servidor);
    const vazio = (await screen.findByText('Nenhum ativo encontrado.'))
      .parentElement as HTMLElement;
    fireEvent.click(within(vazio).getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({ visao: 'fabrica' }));
    await waitFor(() =>
      expect(
        within(screen.getByText('Nenhum ativo encontrado.').parentElement as HTMLElement).getByRole(
          'button',
          { name: 'Novo ativo' },
        ),
      ).toBeTruthy(),
    );
  });
});
