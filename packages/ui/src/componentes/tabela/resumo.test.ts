import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  colunasComConteudoCortado,
  colunasForaDaArea,
  ESPERA_DO_RESUMO,
  relogioDoResumo,
} from './resumo.ts';

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

describe('as colunas com o conteúdo cortado na célula', () => {
  interface Medida {
    /** A largura que o elemento tem. */
    tem: number;
    /** A largura que o conteúdo dele pede. */
    pede: number;
    /** Se o elemento recorta o que passa dele; sem recorte, o que passa continua à vista. */
    recorta?: boolean;
  }

  /** Um elemento com as medidas dadas, como o navegador as mediria. */
  const medir = (elemento: HTMLElement, { tem, pede, recorta = true }: Medida) => {
    Object.defineProperty(elemento, 'clientWidth', { value: tem });
    Object.defineProperty(elemento, 'scrollWidth', { value: pede });
    if (recorta) elemento.style.overflowX = 'hidden';
    return elemento;
  };

  /**
   * Uma tabela com o cabeçalho e uma linha: cada coluna com a medida da célula e, na célula
   * composta, a do resto dela.
   */
  const tabela = (
    colunas: ({ chave: string; resto?: Medida } & Medida)[],
    {
      comIndice = true,
      indiceNasCelulas = comIndice,
    }: { comIndice?: boolean; indiceNasCelulas?: boolean } = {},
  ) => {
    const rolagem = document.createElement('div');
    const grade = document.createElement('div');
    grade.setAttribute('role', 'grid');
    const cabecalho = document.createElement('div');
    cabecalho.setAttribute('role', 'row');
    const linha = document.createElement('div');
    linha.setAttribute('role', 'row');
    colunas.forEach(({ chave, resto, ...medida }, indice) => {
      const titulo = document.createElement('div');
      titulo.setAttribute('role', 'columnheader');
      titulo.dataset.key = chave;
      const celula = medir(document.createElement('div'), medida);
      celula.setAttribute('role', 'gridcell');
      if (comIndice) titulo.setAttribute('aria-colindex', String(indice + 1));
      if (indiceNasCelulas) celula.setAttribute('aria-colindex', String(indice + 1));
      if (resto) {
        const parte = medir(document.createElement('span'), resto);
        parte.dataset.parte = 'resto';
        celula.append(parte);
      }
      cabecalho.append(titulo);
      linha.append(celula);
    });
    grade.append(cabecalho, linha);
    rolagem.append(grade);
    document.body.append(rolagem);
    return { rolagem, linha };
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('são as que pedem mais largura do que têm, na célula ou no resto dela, na ordem dada', () => {
    const { rolagem, linha } = tabela([
      { chave: 'nome', tem: 150, pede: 150 },
      { chave: 'suprimentos', tem: 86, pede: 86, resto: { tem: 30, pede: 140 } },
      { chave: 'local', tem: 100, pede: 180 },
    ]);
    expect(colunasComConteudoCortado(rolagem, linha, ['local', 'nome', 'suprimentos'])).toEqual([
      'local',
      'suprimentos',
    ]);
  });

  it('nenhuma com o conteúdo inteiro, com a tolerância de 1 px', () => {
    const { rolagem, linha } = tabela([
      { chave: 'nome', tem: 150, pede: 151 },
      { chave: 'suprimentos', tem: 200, pede: 200, resto: { tem: 120, pede: 121 } },
    ]);
    expect(colunasComConteudoCortado(rolagem, linha, ['nome', 'suprimentos'])).toEqual([]);
  });

  it('o que passa de um elemento sem recorte continua à vista e não conta', () => {
    const { rolagem, linha } = tabela([{ chave: 'nome', tem: 150, pede: 190, recorta: false }]);
    expect(colunasComConteudoCortado(rolagem, linha, ['nome'])).toEqual([]);
  });

  it('sem o índice da coluna, a célula casa com o cabeçalho pela posição', () => {
    const { rolagem, linha } = tabela(
      [
        { chave: 'nome', tem: 150, pede: 150 },
        { chave: 'local', tem: 100, pede: 180 },
      ],
      { comIndice: false },
    );
    expect(colunasComConteudoCortado(rolagem, linha, ['nome', 'local'])).toEqual(['local']);
  });

  it('com o índice só no cabeçalho, como na tabela que desenha todas as linhas, vale a posição', () => {
    const { rolagem, linha } = tabela(
      [
        { chave: 'nome', tem: 150, pede: 150 },
        { chave: 'suprimentos', tem: 110, pede: 110, resto: { tem: 61, pede: 139 } },
      ],
      { indiceNasCelulas: false },
    );
    expect(colunasComConteudoCortado(rolagem, linha, ['nome', 'suprimentos'])).toEqual([
      'suprimentos',
    ]);
  });

  it('a coluna sem cabeçalho ou sem célula desenhados fica para as colunas fora da área', () => {
    const { rolagem, linha } = tabela([{ chave: 'nome', tem: 150, pede: 150 }]);
    expect(colunasComConteudoCortado(rolagem, linha, ['nome', 'serie'])).toEqual([]);
  });
});
