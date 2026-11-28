import { describe, expect, it } from 'vitest';
import { APARENCIA_DE_FABRICA, aplicarNaRaiz, medidasDaAbaFechada } from './aparencia.ts';

describe('medidasDaAbaFechada', () => {
  it('na tela grande, a pílula de 162×34 fica a 8 px do alto', () => {
    expect(medidasDaAbaFechada(APARENCIA_DE_FABRICA)).toEqual({ compacta: false, topo: 8 });
  });

  it('até 1366 px de largura, a pílula é a compacta; até 800 px de altura, desce para 36 px', () => {
    const tela = { largura: 1366, altura: 768 };
    expect(medidasDaAbaFechada({ ...APARENCIA_DE_FABRICA, tela })).toEqual({
      compacta: true,
      topo: 36,
    });
    expect(
      medidasDaAbaFechada({ ...APARENCIA_DE_FABRICA, tela: { largura: 1367, altura: 801 } }),
    ).toEqual({ compacta: false, topo: 8 });
  });

  it('o entalhe fica preso à borda de cima em qualquer tela', () => {
    const tela = { largura: 1366, altura: 768 };
    expect(medidasDaAbaFechada({ ...APARENCIA_DE_FABRICA, forma: 'entalhe', tela }).topo).toBe(0);
  });
});

describe('aplicarNaRaiz', () => {
  it('põe o tema do Windows e tira o movimento reduzido quando as animações voltam', () => {
    const raiz = document.createElement('html');
    aplicarNaRaiz('alto-contraste', true, raiz);
    expect(raiz.dataset.windowsTheme).toBe('alto-contraste');
    expect(raiz.dataset.motion).toBe('reduzido');
    aplicarNaRaiz('claro', false, raiz);
    expect(raiz.dataset.windowsTheme).toBe('claro');
    expect(raiz.hasAttribute('data-motion')).toBe(false);
  });
});
