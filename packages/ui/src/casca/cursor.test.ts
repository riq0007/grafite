import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alvoDoAbraco,
  aproximar,
  cursorVisivel,
  fatorNoTempo,
  fatorPorQuadro,
  formaDoAbraco,
  pedeCursorDoSistema,
  type SituacaoDoCursor,
} from './cursor.ts';

describe('fatorPorQuadro', () => {
  it('segue o Apêndice B: 0,65 − 0,55 × suavização/100', () => {
    expect(fatorPorQuadro(95)).toBeCloseTo(0.1275, 4);
    expect(fatorPorQuadro(0)).toBeCloseTo(0.65, 4);
    expect(fatorPorQuadro(100)).toBeCloseTo(0.1, 4);
  });
});

describe('fatorNoTempo', () => {
  /** Distância que falta depois de `quadros` quadros de `duracao` ms, partindo de 100 px. */
  function restante(k60: number, duracao: number, quadros: number): number {
    let anel = 0;
    for (let i = 0; i < quadros; i++) anel = aproximar(anel, 100, fatorNoTempo(k60, duracao));
    return 100 - anel;
  }

  it('deixa a mesma distância depois de 100 ms em 60 Hz e em 120 Hz', () => {
    const k60 = fatorPorQuadro(95);
    // 100 × (1 − 0,1275)^6 ≈ 44,12 px
    expect(restante(k60, 1000 / 60, 6)).toBeCloseTo(44.12, 1);
    expect(restante(k60, 1000 / 120, 12)).toBeCloseTo(44.12, 1);
  });

  it('num quadro de 60 Hz, vale o próprio fator do Apêndice B', () => {
    expect(fatorNoTempo(0.1275, 1000 / 60)).toBeCloseTo(0.1275, 6);
  });

  it('um intervalo longo, como a volta de uma aba oculta, encosta o anel no ponto', () => {
    expect(aproximar(0, 100, fatorNoTempo(fatorPorQuadro(95), 2000))).toBeCloseTo(100, 3);
  });

  it('sem tempo decorrido, o anel não se move', () => {
    expect(fatorNoTempo(fatorPorQuadro(95), 0)).toBe(0);
  });
});

describe('formaDoAbraco', () => {
  it('envolve o elemento com 4 px de cada lado e o raio dele mais 4 px, a partir do centro', () => {
    expect(formaDoAbraco({ left: 10, top: 20, width: 80, height: 28 }, 7)).toEqual({
      x: 50,
      y: 34,
      largura: 88,
      altura: 36,
      raio: 11,
    });
  });

  it('limita o raio à metade da altura do anel', () => {
    expect(formaDoAbraco({ left: 0, top: 0, width: 24, height: 24 }, 20).raio).toBe(16);
  });
});

describe('alvoDoAbraco', () => {
  /** Monta o HTML no corpo e devolve o elemento marcado com id="alvo". */
  function montar(html: string): HTMLElement {
    document.body.innerHTML = html;
    return document.getElementById('alvo') as HTMLElement;
  }

  const comTamanho = (elemento: Element, width: number, height: number) =>
    vi
      .spyOn(elemento, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width, height }));

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('sobe do elemento sob o ponteiro até o botão, o link ou a aba', () => {
    const icone = montar('<button type="button"><span id="alvo">ícone</span></button>');
    expect(alvoDoAbraco(icone)?.tagName).toBe('BUTTON');
    expect(alvoDoAbraco(montar('<a id="alvo" href="/ajustes">Ajustes</a>'))?.id).toBe('alvo');
    expect(alvoDoAbraco(montar('<div id="alvo" role="tab">Geral</div>'))?.id).toBe('alvo');
    expect(alvoDoAbraco(montar('<div id="alvo" data-cursor-abracar>Item</div>'))?.id).toBe('alvo');
  });

  it('não abraça desabilitados, itens de menu, opções de lista nem o que não é interativo', () => {
    expect(alvoDoAbraco(montar('<button id="alvo" disabled>Salvar</button>'))).toBeNull();
    expect(
      alvoDoAbraco(montar('<div id="alvo" role="button" aria-disabled="true">x</div>')),
    ).toBeNull();
    expect(alvoDoAbraco(montar('<button id="alvo" data-disabled>Salvar</button>'))).toBeNull();
    expect(
      alvoDoAbraco(montar('<div role="menu"><div id="alvo" role="menuitem">Dock</div></div>')),
    ).toBeNull();
    expect(
      alvoDoAbraco(montar('<div role="listbox"><div id="alvo" role="option">Tema</div></div>')),
    ).toBeNull();
    // Com endereço, o React Aria desenha o item de menu e a opção como links.
    expect(
      alvoDoAbraco(montar('<div role="menu"><a id="alvo" href="/" role="menuitem">Dock</a></div>')),
    ).toBeNull();
    expect(
      alvoDoAbraco(
        montar('<div role="listbox"><a id="alvo" href="/" role="option">Tema</a></div>'),
      ),
    ).toBeNull();
    expect(alvoDoAbraco(montar('<p id="alvo">Texto</p>'))).toBeNull();
    expect(alvoDoAbraco(null)).toBeNull();
  });

  it('abraça até 320 × 128 px; um elemento maior, como uma linha de tabela, fica sem abraço', () => {
    const botao = montar('<button id="alvo">Novo ativo</button>');
    comTamanho(botao, 320, 128);
    expect(alvoDoAbraco(botao)).toBe(botao);
    comTamanho(botao, 321, 28);
    expect(alvoDoAbraco(botao)).toBeNull();
    comTamanho(botao, 80, 129);
    expect(alvoDoAbraco(botao)).toBeNull();
  });
});

describe('pedeCursorDoSistema', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const elemento = (html: string) => {
    document.body.innerHTML = html;
    return document.getElementById('alvo');
  };

  it('campos de texto e o que é marcado com data-cursor-nativo pedem o cursor do sistema', () => {
    expect(pedeCursorDoSistema(elemento('<input id="alvo" />'))).toBe(true);
    expect(pedeCursorDoSistema(elemento('<input id="alvo" type="search" />'))).toBe(true);
    expect(pedeCursorDoSistema(elemento('<textarea id="alvo"></textarea>'))).toBe(true);
    expect(pedeCursorDoSistema(elemento('<div id="alvo" contenteditable="true">x</div>'))).toBe(
      true,
    );
    expect(
      pedeCursorDoSistema(elemento('<div data-cursor-nativo><span id="alvo">⇔</span></div>')),
    ).toBe(true);
  });

  it('botões, caixas de seleção e texto comum ficam com o cursor suavizado', () => {
    expect(pedeCursorDoSistema(elemento('<button id="alvo">Salvar</button>'))).toBe(false);
    expect(pedeCursorDoSistema(elemento('<input id="alvo" type="checkbox" />'))).toBe(false);
    expect(pedeCursorDoSistema(elemento('<p id="alvo">Texto</p>'))).toBe(false);
    expect(pedeCursorDoSistema(null)).toBe(false);
  });
});

describe('cursorVisivel', () => {
  const visivel: SituacaoDoCursor = {
    tipo: 'suavizado',
    movimentoReduzido: false,
    postura: 'computador',
    ultimoPonteiro: 'mouse',
    dentroDaJanela: true,
    pedeCursorDoSistema: false,
  };

  it('aparece com o suavizado escolhido, o mouse dentro da janela e a postura computador', () => {
    expect(cursorVisivel(visivel)).toBe(true);
  });

  it.each<[string, Partial<SituacaoDoCursor>]>([
    ['com "Do sistema"', { tipo: 'sistema' }],
    ['com movimento reduzido', { movimentoReduzido: true }],
    ['no tablet', { postura: 'tablet' }],
    ['no celular', { postura: 'celular' }],
    ['depois de um toque', { ultimoPonteiro: 'touch' }],
    ['depois da caneta', { ultimoPonteiro: 'pen' }],
    ['antes de o mouse se mover', { ultimoPonteiro: null }],
    ['com o ponteiro fora da janela', { dentroDaJanela: false }],
    ['sobre um campo de texto', { pedeCursorDoSistema: true }],
  ])('some %s', (_caso, mudanca) => {
    expect(cursorVisivel({ ...visivel, ...mudanca })).toBe(false);
  });
});
