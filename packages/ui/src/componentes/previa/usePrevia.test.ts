import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type OpcoesDaPrevia, usePrevia } from './usePrevia.ts';

interface Item {
  id: string;
}

const itens = (quantos: number, inicio = 1): Item[] =>
  Array.from({ length: quantos }, (_, indice) => ({ id: String(inicio + indice) }));

const chaveDe = (item: Item) => item.id;

/** A prévia sobre a lista dada, que o teste troca como a tela trocaria. */
const previa = (lista: Item[], opcoes?: OpcoesDaPrevia) =>
  renderHook(
    ({ lista: atual, opcoes: atuais }: { lista: Item[]; opcoes?: OpcoesDaPrevia }) =>
      usePrevia(atual, chaveDe, atuais),
    { initialProps: { lista, opcoes } },
  );

describe('a prévia de uma lista', () => {
  it('como antes: a posição e o total da lista carregada, sem passar das pontas', () => {
    const { result } = previa(itens(8));
    act(() => result.current.aoPreverLinha('3'));
    expect(result.current).toMatchObject({ aberta: true, posicao: 3, total: 8, carregando: false });
    expect(result.current.item).toEqual({ id: '3' });
    act(() => result.current.aoSeguinte?.());
    expect(result.current.posicao).toBe(4);
    act(() => result.current.aoPreverLinha('8'));
    expect(result.current.aoSeguinte).toBeUndefined();
    act(() => result.current.aoPreverLinha('1'));
    expect(result.current.aoAnterior).toBeUndefined();
    act(() => result.current.aoFechar());
    expect(result.current.aberta).toBe(false);
  });

  it('numa lista paginada, a posição conta o total, e não só os carregados', () => {
    const { result } = previa(itens(100), { total: 300 });
    act(() => result.current.aoPreverLinha('3'));
    expect(result.current).toMatchObject({ posicao: 3, total: 300 });
  });
});

describe('a página seguinte pela seta', () => {
  const comMais = (carregando = false) => ({
    haMais: true,
    carregando,
    aoCarregar: vi.fn(),
  });

  it('no último carregado, pede a página seguinte, espera com o esqueleto e mostra o seguinte', () => {
    const carregarMais = comMais();
    const { result, rerender } = previa(itens(100), { total: 300, carregarMais });
    act(() => result.current.aoPreverLinha('100'));
    expect(result.current.posicao).toBe(100);
    act(() => result.current.aoSeguinte?.());
    expect(carregarMais.aoCarregar).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({ carregando: true, posicao: 101, aberta: true });
    expect(result.current.item).toEqual({ id: '100' });
    expect(result.current.aoSeguinte).toBeUndefined();
    rerender({ lista: itens(100), opcoes: { total: 300, carregarMais: comMais(true) } });
    expect(result.current.carregando).toBe(true);
    rerender({ lista: itens(200), opcoes: { total: 300, carregarMais: comMais() } });
    expect(result.current).toMatchObject({ carregando: false, posicao: 101 });
    expect(result.current.item).toEqual({ id: '101' });
  });

  it('com a página já a caminho, não pede de novo, e só espera', () => {
    const carregarMais = comMais(true);
    const { result, rerender } = previa(itens(100), { total: 300, carregarMais });
    act(() => result.current.aoPreverLinha('100'));
    act(() => result.current.aoSeguinte?.());
    expect(carregarMais.aoCarregar).not.toHaveBeenCalled();
    expect(result.current.carregando).toBe(true);
    rerender({ lista: itens(200), opcoes: { total: 300, carregarMais: comMais() } });
    expect(result.current.item).toEqual({ id: '101' });
  });

  it('sem mais páginas, a seta no último não faz nada', () => {
    const { result } = previa(itens(100), {
      total: 100,
      carregarMais: { haMais: false, carregando: false, aoCarregar: vi.fn() },
    });
    act(() => result.current.aoPreverLinha('100'));
    expect(result.current.aoSeguinte).toBeUndefined();
  });

  it('a carga que termina sem registros novos encerra a espera no registro de antes', () => {
    const { result, rerender } = previa(itens(100), { total: 300, carregarMais: comMais() });
    act(() => result.current.aoPreverLinha('100'));
    act(() => result.current.aoSeguinte?.());
    rerender({ lista: itens(100), opcoes: { total: 300, carregarMais: comMais(true) } });
    rerender({ lista: itens(100), opcoes: { total: 300, carregarMais: comMais() } });
    expect(result.current).toMatchObject({ carregando: false, posicao: 100 });
    expect(result.current.item).toEqual({ id: '100' });
  });

  it('a seta que volta, durante a espera, desiste da página e fica no último carregado', () => {
    const { result } = previa(itens(100), { total: 300, carregarMais: comMais() });
    act(() => result.current.aoPreverLinha('100'));
    act(() => result.current.aoSeguinte?.());
    act(() => result.current.aoAnterior?.());
    expect(result.current).toMatchObject({ carregando: false, posicao: 100 });
  });
});

describe('a prévia com linhas selecionadas', () => {
  it('passa só pelos selecionados, na ordem da lista, e a posição conta a seleção', () => {
    const { result } = previa(itens(12), { selecao: new Set(['9', '2', '5']) });
    act(() => result.current.aoPreverLinha('5'));
    expect(result.current).toMatchObject({ posicao: 2, total: 3 });
    act(() => result.current.aoSeguinte?.());
    expect(result.current.item).toEqual({ id: '9' });
    expect(result.current.aoSeguinte).toBeUndefined();
    act(() => result.current.aoAnterior?.());
    act(() => result.current.aoAnterior?.());
    expect(result.current.item).toEqual({ id: '2' });
    expect(result.current.aoAnterior).toBeUndefined();
  });

  it('aberta fora da seleção, ou com uma linha só, passa pela lista toda', () => {
    const { result } = previa(itens(12), { total: 40, selecao: new Set(['2', '5']) });
    act(() => result.current.aoPreverLinha('4'));
    expect(result.current).toMatchObject({ posicao: 4, total: 40 });
    const umaSo = previa(itens(12), { selecao: new Set(['5']) });
    act(() => umaSo.result.current.aoPreverLinha('5'));
    expect(umaSo.result.current).toMatchObject({ posicao: 5, total: 12 });
  });

  it('com a seleção, a seta no último selecionado não pede a página seguinte', () => {
    const aoCarregar = vi.fn();
    const { result } = previa(itens(100), {
      total: 300,
      selecao: new Set(['50', '100']),
      carregarMais: { haMais: true, carregando: false, aoCarregar },
    });
    act(() => result.current.aoPreverLinha('100'));
    expect(result.current.aoSeguinte).toBeUndefined();
    expect(aoCarregar).not.toHaveBeenCalled();
  });
});
