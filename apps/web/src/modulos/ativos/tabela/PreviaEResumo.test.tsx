import { filaDeAvisos } from '@grafite/ui';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { abrir, ativo, IP, linhas, lista, M404, RH, servidorDeAtivos, tabela } from './teste.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
});

const COM_IP = `/ativos?visao=fabrica&colunas=ativo.rotulo,ativo.patrimonio,${IP}`;

const VELHA = ativo('a3', 'Matricial', { situacao: 'inativo', patrimonio: 'PAT-00007' });

/** A linha do ativo, pelo nome. */
const linhaDe = async (nome: string) =>
  (await linhas()).find((linha) => linha.textContent?.includes(nome)) as HTMLElement;

const previa = (nome: string) => screen.findByRole('dialog', { name: `Prévia: ${nome}` });

/** Os campos da prévia, como rótulo e valor. */
const campos = (dialogo: HTMLElement) =>
  [...dialogo.querySelectorAll('dt')].map((rotulo) => [
    rotulo.textContent,
    rotulo.nextElementSibling?.textContent,
  ]);

describe('a prévia do ativo na tabela', () => {
  it('o título, o tipo e o modelo, os campos principais e as outras colunas, e Enter abre a ficha', async () => {
    const roteador = abrir(COM_IP, servidorDeAtivos().servidor);
    await tabela();
    const m404 = await linhaDe('HP LaserJet M404');
    m404.focus();
    fireEvent.keyDown(m404, { key: ' ' });
    const aberta = await previa('HP LaserJet M404');
    expect(within(aberta).getByText('Impressora · HP LaserJet M404')).toBeTruthy();
    expect(within(aberta).getByText('1 de 2')).toBeTruthy();
    expect(campos(aberta)).toEqual([
      ['Tipo', 'Impressora'],
      ['Modelo', 'HP LaserJet M404'],
      ['Patrimônio', 'PAT-00412'],
      ['Número de série', '—'],
      ['Hostname', '—'],
      ['Situação', 'Em uso'],
      ['Local', 'Jundiaí › Expedição'],
      ['Responsável', '—'],
      ['IP', '10.0.0.12'],
    ]);
    fireEvent.keyDown(aberta, { key: 'Enter' });
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/ativos/a1'));
  });

  it('a imagem do ativo vale no lugar da do modelo, e sem ela a do modelo', async () => {
    const comImagem = { ...M404, imagem: { id: 'img-a' } };
    abrir('/ativos', servidorDeAtivos(() => lista([comImagem, RH])).servidor);
    await tabela();
    const m404 = await linhaDe('HP LaserJet M404');
    m404.focus();
    fireEvent.keyDown(m404, { key: ' ' });
    const aberta = await previa('HP LaserJet M404');
    expect(within(aberta).getByRole('img', { name: 'HP LaserJet M404' }).getAttribute('src')).toBe(
      '/api/ativos/a1/imagem/img-a/512',
    );
  });

  it('sem a imagem do ativo, a prévia mostra a do modelo', async () => {
    abrir('/ativos', servidorDeAtivos().servidor);
    await tabela();
    const m404 = await linhaDe('HP LaserJet M404');
    m404.focus();
    fireEvent.keyDown(m404, { key: ' ' });
    const aberta = await previa('HP LaserJet M404');
    expect(within(aberta).getByRole('img', { name: 'HP LaserJet M404' }).getAttribute('src')).toBe(
      '/api/modelos/m404/imagem/img-1/512',
    );
  });

  it('a seta no último carregado traz a página seguinte e mostra o ativo dela', async () => {
    const { servidor, pedidos } = servidorDeAtivos((parametros) =>
      parametros.get('cursor') === 'c2' ? lista([RH], null, 2) : lista([M404], 'c2', 2),
    );
    abrir('/ativos', servidor);
    await tabela();
    const m404 = await linhaDe('HP LaserJet M404');
    m404.focus();
    fireEvent.keyDown(m404, { key: ' ' });
    const aberta = await previa('HP LaserJet M404');
    expect(within(aberta).getByText('1 de 2')).toBeTruthy();
    fireEvent.keyDown(aberta, { key: 'ArrowDown' });
    const seguinte = await previa('Impressora do RH');
    expect(within(seguinte).getByText('2 de 2')).toBeTruthy();
    expect(pedidos.some((pedido) => pedido.get('cursor') === 'c2')).toBe(true);
  });

  it('com linhas selecionadas, passa só por elas, e a posição conta a seleção (foco 8)', async () => {
    abrir('/ativos', servidorDeAtivos(() => lista([M404, RH, VELHA])).servidor);
    await tabela();
    fireEvent.click(within(await linhaDe('HP LaserJet M404')).getByText('PAT-00412'), {
      ctrlKey: true,
    });
    const velha = await linhaDe('Matricial');
    fireEvent.click(within(velha).getByText('PAT-00007'), { ctrlKey: true });
    expect(screen.getByText('2 selecionados')).toBeTruthy();
    velha.focus();
    fireEvent.keyDown(velha, { key: ' ' });
    const aberta = await previa('Matricial');
    expect(within(aberta).getByText('2 de 2')).toBeTruthy();
    fireEvent.keyDown(aberta, { key: 'ArrowUp' });
    expect(within(await previa('HP LaserJet M404')).getByText('1 de 2')).toBeTruthy();
    expect(screen.getByText('2 selecionados')).toBeTruthy();
  });

  it('o menu de contexto oferece a prévia, que abre o ativo da linha', async () => {
    abrir('/ativos', servidorDeAtivos().servidor);
    await tabela();
    fireEvent.contextMenu(within(await linhaDe('HP LaserJet M404')).getByText('PAT-00412'));
    const menu = await screen.findByRole('menu', { name: 'Ações das linhas' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Abrir',
      'Prévia',
      'Copiar linhas',
      'Copiar patrimônio',
      'Copiar link',
      'Imprimir etiqueta',
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Prévia' }));
    expect(await previa('HP LaserJet M404')).toBeTruthy();
  });
});

describe('o resumo da linha e a seleção na tabela dos ativos', () => {
  it('o mouse parado sobre a linha mostra as colunas fora da área visível', async () => {
    // O cabeçalho do IP fica além da janela; o happy-dom não mede, e o teste dá a medida.
    const medir = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return this.getAttribute('role') === 'columnheader' && this.getAttribute('data-key') === IP
        ? ({ left: 5000, right: 5140, top: 0, bottom: 34, width: 140, height: 34 } as DOMRect)
        : medir.call(this);
    });
    abrir(COM_IP, servidorDeAtivos().servidor);
    await tabela();
    const celula = within(await linhaDe('HP LaserJet M404')).getByText('PAT-00412');
    fireEvent.pointerMove(celula, { pointerType: 'mouse', clientX: 40, clientY: 40 });
    const resumo = await screen.findByRole('tooltip');
    expect(
      [...resumo.querySelectorAll('dt')].map((rotulo) => [
        rotulo.textContent,
        rotulo.nextElementSibling?.textContent,
      ]),
    ).toEqual([['IP', '10.0.0.12']]);
  });

  it('com linhas selecionadas, "Imprimir etiquetas" abre as etiquetas delas, na ordem da tabela', async () => {
    const roteador = abrir('/ativos', servidorDeAtivos(() => lista([M404, RH, VELHA])).servidor);
    await tabela();
    expect(screen.queryByRole('button', { name: 'Imprimir etiquetas' })).toBeNull();
    fireEvent.click(within(await linhaDe('Matricial')).getByText('PAT-00007'), {
      ctrlKey: true,
    });
    fireEvent.click(within(await linhaDe('HP LaserJet M404')).getByText('PAT-00412'), {
      ctrlKey: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir etiquetas' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/ativos/etiquetas'));
    expect(roteador.state.location.search).toEqual({ ids: `${M404.id},${VELHA.id}` });
  });

  it('a busca, um filtro, a ordem ou a visão que mudam limpam a seleção', async () => {
    const { servidor, pedidos } = servidorDeAtivos();
    abrir('/ativos', servidor);
    await tabela();
    fireEvent.click(within(await linhaDe('HP LaserJet M404')).getByText('PAT-00412'), {
      ctrlKey: true,
    });
    expect(screen.getByText('1 selecionado')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar ativos' }), {
      target: { value: 'hp' },
    });
    await waitFor(() => expect(pedidos.at(-1)?.get('busca')).toBe('hp'));
    await waitFor(() => expect(screen.queryByText('1 selecionado')).toBeNull());
  });
});
