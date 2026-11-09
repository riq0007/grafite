import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { colunasForaDaArea, ESPERA_DO_RESUMO, relogioDoResumo } from './resumo.ts';

describe('o relógio do resumo da linha', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const relogio = () => {
    const aoMostrar = vi.fn();
    const aoEsconder = vi.fn();
    return { aoMostrar, aoEsconder, relogio: relogioDoResumo({ aoMostrar, aoEsconder }) };
  };

  it('espera 1,5 s com o mouse parado sobre a linha', () => {
    expect(ESPERA_DO_RESUMO).toBe(1500);
    const { aoMostrar, relogio: resumo } = relogio();
    resumo.mover('a');
    vi.advanceTimersByTime(1499);
    expect(aoMostrar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(aoMostrar).toHaveBeenCalledWith('a');
  });

  it('recomeça a contagem a cada movimento antes do resumo', () => {
    const { aoMostrar, relogio: resumo } = relogio();
    resumo.mover('a');
    vi.advanceTimersByTime(1000);
    resumo.mover('a');
    vi.advanceTimersByTime(1000);
    resumo.mover('b');
    vi.advanceTimersByTime(1000);
    expect(aoMostrar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(aoMostrar).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('com o resumo à vista, o movimento na mesma linha o mantém, e em outra linha o fecha', () => {
    const { aoMostrar, aoEsconder, relogio: resumo } = relogio();
    resumo.mover('a');
    vi.advanceTimersByTime(1500);
    resumo.mover('a');
    expect(aoEsconder).not.toHaveBeenCalled();
    resumo.mover('b');
    expect(aoEsconder).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1500);
    expect(aoMostrar).toHaveBeenLastCalledWith('b');
  });

  it('sair da tabela, rolar ou teclar cancela a espera e fecha o resumo', () => {
    const { aoMostrar, aoEsconder, relogio: resumo } = relogio();
    resumo.mover('a');
    vi.advanceTimersByTime(1000);
    resumo.cancelar();
    vi.advanceTimersByTime(2000);
    expect(aoMostrar).not.toHaveBeenCalled();
    resumo.mover('a');
    vi.advanceTimersByTime(1500);
    resumo.cancelar();
    expect(aoEsconder).toHaveBeenCalledOnce();
    resumo.cancelar();
    expect(aoEsconder).toHaveBeenCalledOnce();
  });

  it('o ponteiro fora de uma linha só cancela', () => {
    const { aoMostrar, aoEsconder, relogio: resumo } = relogio();
    resumo.mover('a');
    vi.advanceTimersByTime(1500);
    resumo.mover(null);
    expect(aoEsconder).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(2000);
    expect(aoMostrar).toHaveBeenCalledOnce();
  });
});

describe('as colunas fora da área visível', () => {
  /** Um elemento com a caixa na posição dada, como o navegador mediria. */
  const posicionar = (elemento: HTMLElement, esquerda: number, largura: number) => {
    elemento.getBoundingClientRect = () =>
      ({
        left: esquerda,
        right: esquerda + largura,
        width: largura,
        top: 0,
        bottom: 30,
        height: 30,
      }) as DOMRect;
    return elemento;
  };

  /**
   * A rolagem de 101 a 601 px (borda de 1 px), com as colunas dadas no cabeçalho, pela chave, e a
   * grade, que rola sozinha na tabela virtualizada.
   */
  const tabela = (colunas: [string, number, number][], grade?: { largura: number }) => {
    const rolagem = posicionar(document.createElement('div'), 100, 502);
    Object.defineProperty(rolagem, 'clientLeft', { value: 1 });
    Object.defineProperty(rolagem, 'clientWidth', { value: 500 });
    const tabelaDaGrade = posicionar(document.createElement('div'), 101, 500);
    tabelaDaGrade.setAttribute('role', 'grid');
    if (grade) {
      tabelaDaGrade.style.overflowX = 'auto';
      Object.defineProperty(tabelaDaGrade, 'clientLeft', { value: 0 });
      Object.defineProperty(tabelaDaGrade, 'clientWidth', { value: grade.largura });
    }
    for (const [chave, esquerda, largura] of colunas) {
      const cabecalho = posicionar(document.createElement('div'), esquerda, largura);
      cabecalho.setAttribute('role', 'columnheader');
      cabecalho.dataset.key = chave;
      tabelaDaGrade.append(cabecalho);
    }
    rolagem.append(tabelaDaGrade);
    document.body.append(rolagem);
    return rolagem;
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('são as cortadas e as além da rolagem, dos dois lados, na ordem dada', () => {
    const rolagem = tabela([
      ['patrimonio', 40, 120],
      ['nome', 160, 280],
      ['local', 440, 200],
      ['hostname', 640, 140],
    ]);
    expect(colunasForaDaArea(rolagem, ['nome', 'patrimonio', 'local', 'hostname'])).toEqual([
      'patrimonio',
      'local',
      'hostname',
    ]);
  });

  it('nenhuma com todas à vista, com a tolerância de 1 px nas bordas', () => {
    const rolagem = tabela([
      ['nome', 100.5, 280],
      ['local', 380.5, 221],
    ]);
    expect(colunasForaDaArea(rolagem, ['nome', 'local'])).toEqual([]);
  });

  it('a coluna sem cabeçalho desenhado está fora, como a que a tabela virtualizada não desenha', () => {
    const rolagem = tabela([['nome', 101, 280]]);
    expect(colunasForaDaArea(rolagem, ['nome', 'serie'])).toEqual(['serie']);
  });

  it('na grade que rola sozinha, a área é a dela, sem a barra de rolagem', () => {
    const rolagem = tabela(
      [
        ['nome', 101, 280],
        ['local', 381, 210],
      ],
      { largura: 485 },
    );
    expect(colunasForaDaArea(rolagem, ['nome', 'local'])).toEqual(['local']);
  });

  it('a janela também recorta a área', () => {
    vi.stubGlobal('innerWidth', 550);
    const rolagem = tabela([
      ['nome', 101, 280],
      ['local', 381, 200],
    ]);
    expect(colunasForaDaArea(rolagem, ['nome', 'local'])).toEqual(['local']);
    vi.unstubAllGlobals();
  });
});
