// O que a barra de rolagem própria pede ao código (spec componentes-base, "Barra de rolagem
// própria"; change barra-de-rolagem-propria, design, decisão 4): a marca da área que rola, que a
// folha de estilo lê para mostrar o polegar na rolagem pelo teclado, pelo toque e pelo próprio app.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acompanharRolagem, TEMPO_DA_MARCA_DE_ROLAGEM } from './barraDeRolagem.ts';

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
