// O que a barra de rolagem própria pede ao código (spec componentes-base, "Barra de rolagem
// própria"; change barra-de-rolagem-propria, design, decisão 4): a marca da área que rola, que a
// folha de estilo lê para mostrar o polegar na rolagem pelo teclado, pelo toque e pelo próprio app.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acompanharRolagem,
  aplicarBarraDoSistema,
  barraDoSistemaSobreposta,
  ligarBarraDeRolagem,
  TEMPO_DA_MARCA_DE_ROLAGEM,
} from './barraDeRolagem.ts';

describe('acompanharRolagem', () => {
  let desfazer: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    desfazer = acompanharRolagem(document);
  });

  afterEach(() => {
    desfazer();
    vi.useRealTimers();
    document.body.replaceChildren();
    document.documentElement.removeAttribute('data-rolando');
  });

  const area = () => {
    const elemento = document.createElement('div');
    document.body.append(elemento);
    return elemento;
  };
  /** O evento de rolagem não sobe: o ouvinte o pega na descida, no documento. */
  const rolar = (alvo: EventTarget) => alvo.dispatchEvent(new Event('scroll'));
  const marcada = (elemento: Element) => elemento.hasAttribute('data-rolando');

  it('o tempo da marca é de 1 s', () => {
    expect(TEMPO_DA_MARCA_DE_ROLAGEM).toBe(1000);
  });

  it('marca a área que rola', () => {
    const lista = area();
    const outra = area();
    rolar(lista);
    expect(marcada(lista)).toBe(true);
    expect(marcada(outra)).toBe(false);
    expect(marcada(document.documentElement)).toBe(false);
  });

  it('tira a marca 1 s depois da última rolagem', () => {
    const lista = area();
    rolar(lista);
    vi.advanceTimersByTime(900);
    // Rolou de novo antes do fim: o prazo recomeça.
    rolar(lista);
    vi.advanceTimersByTime(900);
    expect(marcada(lista)).toBe(true);
    vi.advanceTimersByTime(100);
    expect(marcada(lista)).toBe(false);
  });

  it('cada área tem o prazo dela', () => {
    const primeira = area();
    const segunda = area();
    rolar(primeira);
    vi.advanceTimersByTime(600);
    rolar(segunda);
    vi.advanceTimersByTime(400);
    expect(marcada(primeira)).toBe(false);
    expect(marcada(segunda)).toBe(true);
    vi.advanceTimersByTime(600);
    expect(marcada(segunda)).toBe(false);
  });

  it('o documento marca a raiz', () => {
    rolar(document);
    expect(marcada(document.documentElement)).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(marcada(document.documentElement)).toBe(false);
  });

  it('desfeito, não marca mais', () => {
    desfazer();
    const lista = area();
    rolar(lista);
    expect(marcada(lista)).toBe(false);
  });
});

// A barra do sistema (design, decisão 6): onde ela já é sobreposta ao conteúdo, como no celular, no
// tablet e no macOS com a barra automática, a barra própria não vale.
describe('barraDoSistemaSobreposta', () => {
  /** A largura de fora e a de dentro da área de teste, como o navegador as mede. */
  function comAsLarguras(deFora: number, deDentro: number) {
    const marcadaNaMedida: boolean[] = [];
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => {
      marcadaNaMedida.push(document.documentElement.hasAttribute('data-barra-do-sistema'));
      return deFora;
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(deDentro);
    return marcadaNaMedida;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-barra-do-sistema');
    document.body.replaceChildren();
  });

  it('barra de largura zero: o sistema sobrepõe a barra', () => {
    comAsLarguras(100, 100);
    expect(barraDoSistemaSobreposta(document)).toBe(true);
  });

  it('barra que ocupa espaço: vale a barra própria', () => {
    comAsLarguras(100, 83);
    expect(barraDoSistemaSobreposta(document)).toBe(false);
  });

  it('mede com a barra do sistema: a raiz fica marcada só durante a medida', () => {
    const marcadaNaMedida = comAsLarguras(100, 83);
    barraDoSistemaSobreposta(document);
    expect(marcadaNaMedida).toEqual([true]);
    expect(document.documentElement.hasAttribute('data-barra-do-sistema')).toBe(false);
  });

  it('a área de teste sai do documento depois da medida', () => {
    comAsLarguras(100, 100);
    barraDoSistemaSobreposta(document);
    expect(document.body.children).toHaveLength(0);
  });
});

describe('aplicarBarraDoSistema', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-barra-do-sistema');
  });

  const comABarraDe = (largura: number) => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100 - largura);
  };

  it('com a barra sobreposta, marca a raiz e diz que vale a do sistema', () => {
    comABarraDe(0);
    expect(aplicarBarraDoSistema(document)).toBe(true);
    expect(document.documentElement.hasAttribute('data-barra-do-sistema')).toBe(true);
  });

  it('com a barra que ocupa espaço, a raiz fica sem a marca', () => {
    document.documentElement.setAttribute('data-barra-do-sistema', '');
    comABarraDe(17);
    expect(aplicarBarraDoSistema(document)).toBe(false);
    expect(document.documentElement.hasAttribute('data-barra-do-sistema')).toBe(false);
  });
});

// A partida (design, decisões 4 e 6): a web, o painel da operação e o catálogo chamam uma função só.
describe('ligarBarraDeRolagem', () => {
  let desligar: () => void = () => {};

  afterEach(() => {
    desligar();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.documentElement.removeAttribute('data-barra-do-sistema');
    document.body.replaceChildren();
  });

  const comABarraDe = (largura: number) => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100 - largura);
  };

  it('num aparelho de barra sobreposta, marca a raiz: vale a barra do sistema', () => {
    comABarraDe(0);
    desligar = ligarBarraDeRolagem(document);
    expect(document.documentElement.hasAttribute('data-barra-do-sistema')).toBe(true);
  });

  it('num aparelho de barra que ocupa espaço, a raiz fica sem a marca, e a rolagem é acompanhada', () => {
    comABarraDe(17);
    vi.useFakeTimers();
    desligar = ligarBarraDeRolagem(document);
    expect(document.documentElement.hasAttribute('data-barra-do-sistema')).toBe(false);
    const lista = document.createElement('div');
    document.body.append(lista);
    lista.dispatchEvent(new Event('scroll'));
    expect(lista.hasAttribute('data-rolando')).toBe(true);
    vi.advanceTimersByTime(TEMPO_DA_MARCA_DE_ROLAGEM);
    expect(lista.hasAttribute('data-rolando')).toBe(false);
  });

  it('desligada, para de acompanhar a rolagem', () => {
    comABarraDe(17);
    desligar = ligarBarraDeRolagem(document);
    desligar();
    const lista = document.createElement('div');
    document.body.append(lista);
    lista.dispatchEvent(new Event('scroll'));
    expect(lista.hasAttribute('data-rolando')).toBe(false);
  });
});
