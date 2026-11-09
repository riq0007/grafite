import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarMenusDoDock, type MenusDoDock } from './menusDoDock.ts';

let menus: MenusDoDock;
let mudancas: (string | null)[];

beforeEach(() => {
  vi.useFakeTimers();
  mudancas = [];
  menus = criarMenusDoDock({ aoMudar: (aberto) => mudancas.push(aberto) });
});

afterEach(() => {
  menus.descartar();
  vi.useRealTimers();
});

/** Deixa o menu de `id` aberto pelo caminho do ponteiro. */
function abrirPeloPonteiro(id: string) {
  menus.entrarNoItem(id, true);
  vi.advanceTimersByTime(150);
}

describe('menus do dock', () => {
  it('abre o menu depois de 150 ms com o ponteiro parado sobre o item', () => {
    menus.entrarNoItem('ajustes', true);
    vi.advanceTimersByTime(149);
    expect(menus.aberto).toBeNull();
    vi.advanceTimersByTime(1);
    expect(menus.aberto).toBe('ajustes');
    expect(mudancas).toEqual(['ajustes']);
  });

  it('não abre nada quando o ponteiro atravessa o dock sem parar', () => {
    menus.entrarNoItem('ativos', true);
    vi.advanceTimersByTime(100);
    menus.sairDoItem();
    menus.entrarNoItem('operacao', true);
    vi.advanceTimersByTime(100);
    menus.sairDoItem();
    vi.advanceTimersByTime(1000);
    expect(menus.aberto).toBeNull();
    expect(mudancas).toEqual([]);
  });

  it('com um menu aberto, troca para o de outro item em 60 ms', () => {
    abrirPeloPonteiro('ativos');
    menus.sairDoItem();
    menus.entrarNoItem('operacao', true);
    vi.advanceTimersByTime(59);
    expect(menus.aberto).toBe('ativos');
    vi.advanceTimersByTime(1);
    expect(menus.aberto).toBe('operacao');
  });

  it('fecha 320 ms depois de o ponteiro sair do dock e do menu', () => {
    abrirPeloPonteiro('ativos');
    menus.sairDoItem();
    vi.advanceTimersByTime(319);
    expect(menus.aberto).toBe('ativos');
    vi.advanceTimersByTime(1);
    expect(menus.aberto).toBeNull();
    expect(mudancas).toEqual(['ativos', null]);
  });

  it('continua aberto quando o ponteiro vai do item para o menu', () => {
    abrirPeloPonteiro('ativos');
    menus.sairDoItem();
    vi.advanceTimersByTime(200);
    menus.entrarNoMenu();
    vi.advanceTimersByTime(1000);
    expect(menus.aberto).toBe('ativos');
    menus.sairDoMenu();
    vi.advanceTimersByTime(320);
    expect(menus.aberto).toBeNull();
  });

  it('continua aberto quando o ponteiro volta ao mesmo item antes de fechar', () => {
    abrirPeloPonteiro('ativos');
    menus.sairDoItem();
    vi.advanceTimersByTime(300);
    menus.entrarNoItem('ativos', true);
    vi.advanceTimersByTime(1000);
    expect(menus.aberto).toBe('ativos');
  });

  it('um item sem menu fecha o menu aberto no tempo da troca', () => {
    abrirPeloPonteiro('ativos');
    menus.sairDoItem();
    menus.entrarNoItem('inicio', false);
    vi.advanceTimersByTime(59);
    expect(menus.aberto).toBe('ativos');
    vi.advanceTimersByTime(1);
    expect(menus.aberto).toBeNull();
  });

  it('pelo toque e pelo teclado, abre e fecha na hora, sem os atrasos do ponteiro', () => {
    menus.abrirAgora('ajustes');
    expect(menus.aberto).toBe('ajustes');
    menus.abrirAgora('ativos');
    expect(menus.aberto).toBe('ativos');
    menus.fecharAgora();
    expect(menus.aberto).toBeNull();
    expect(mudancas).toEqual(['ajustes', 'ativos', null]);
  });

  it('fechar na hora cancela uma abertura que estava para acontecer', () => {
    menus.entrarNoItem('ajustes', true);
    vi.advanceTimersByTime(100);
    menus.fecharAgora();
    vi.advanceTimersByTime(1000);
    expect(menus.aberto).toBeNull();
    expect(mudancas).toEqual([]);
  });
});
