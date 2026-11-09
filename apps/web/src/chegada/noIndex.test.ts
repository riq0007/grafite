import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import INDEX from '../../index.html?raw';
import { comAChegada, ROTEIRO_DA_CHEGADA } from './noIndex.ts';

const analisar = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('comAChegada', () => {
  it('põe a camada do carregamento antes da raiz do app, fora de vista, com a primeira etapa', () => {
    const documento = analisar(comAChegada(INDEX, { desenvolvimento: false }));
    const camada = documento.querySelector('body > #chegada + #raiz')?.previousElementSibling;
    expect(camada?.id).toBe('chegada');
    expect(camada?.hasAttribute('data-visivel')).toBe(false);
    expect(camada?.querySelector('[role="status"]')?.textContent).toBe('Carregando o Grafite');
    expect(camada?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');
  });

  it('traz o estilo do carregamento e o roteiro dos 500 ms no head', () => {
    const documento = analisar(comAChegada(INDEX, { desenvolvimento: false }));
    const estilos = [...documento.head.querySelectorAll('style')].map(
      (estilo) => estilo.textContent,
    );
    expect(estilos.some((estilo) => estilo?.includes('#chegada[data-visivel]'))).toBe(true);
    const roteiros = [...documento.head.querySelectorAll('script:not([src])')].map((roteiro) =>
      roteiro.textContent?.trim(),
    );
    expect(roteiros).toContain(ROTEIRO_DA_CHEGADA);
  });

  it('só no desenvolvimento liga o CSS dos tokens, que na compilação já vem antes da pintura', () => {
    const tokens = (html: string) =>
      [...analisar(html).head.querySelectorAll('link[rel="stylesheet"]')].map((link) =>
        link.getAttribute('href'),
      );
    expect(tokens(comAChegada(INDEX, { desenvolvimento: true }))).toEqual([
      expect.stringMatching(/^\/@fs\/.*\/packages\/ui\/src\/tokens\/gerado\/tokens\.css$/),
    ]);
    expect(tokens(comAChegada(INDEX, { desenvolvimento: false }))).toEqual([]);
  });

  it('recusa um index.html sem a raiz do app', () => {
    expect(() =>
      comAChegada('<html><head></head><body></body></html>', { desenvolvimento: false }),
    ).toThrow(/raiz/);
  });
});

describe('roteiro da chegada', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="chegada"></div><div id="raiz"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-chegada');
  });

  /** Roda o roteiro com a página em `agora`; o relógio dela anda com o relógio falso. */
  const rodar = (agora: number) => {
    const base = Date.now();
    vi.spyOn(performance, 'now').mockImplementation(() => agora + (Date.now() - base));
    new Function(ROTEIRO_DA_CHEGADA)();
  };
  const camada = () => document.getElementById('chegada') as HTMLElement;

  it('marca a chegada como carregando e mostra a camada aos 500 ms dela', () => {
    rodar(120);
    expect(document.documentElement.getAttribute('data-chegada')).toBe('carregando');
    vi.advanceTimersByTime(379);
    expect(camada().hasAttribute('data-visivel')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(camada().hasAttribute('data-visivel')).toBe(true);
  });

  it('com o relógio da página em fração de ms, não mostra a camada antes dos 500 ms', () => {
    // O navegador trunca o atraso do setTimeout para ms inteiros, como o relógio falso.
    rodar(10.4);
    vi.advanceTimersByTime(489);
    expect(camada().hasAttribute('data-visivel')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(camada().hasAttribute('data-visivel')).toBe(true);
  });

  it('não mostra a camada se o app já terminou a chegada', () => {
    rodar(120);
    document.documentElement.setAttribute('data-chegada', 'pronta');
    vi.advanceTimersByTime(1000);
    expect(camada().hasAttribute('data-visivel')).toBe(false);
  });

  it('com a página chegando depois dos 500 ms, mostra a camada logo', () => {
    rodar(900);
    vi.advanceTimersByTime(0);
    expect(camada().hasAttribute('data-visivel')).toBe(true);
  });
});
