import { temaPersonalizado } from '@grafite/ui';
import { afterEach, describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { atributosDaInterface, PADRAO_DE_FABRICA } from './preferencias.ts';

/** O script inline do index.html que aplica as preferências antes da primeira pintura. */
const scriptAntiFlash = (() => {
  const script = indexHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('script anti-flash não encontrado no index.html');
  return script;
})();

const raiz = () => document.documentElement;

afterEach(() => {
  localStorage.clear();
  for (const nome of [...raiz().getAttributeNames()]) raiz().removeAttribute(nome);
});

describe('script anti-flash', () => {
  it('aplica, antes do app, cada atributo que o app calcula', () => {
    const atributos = atributosDaInterface({
      ...PADRAO_DE_FABRICA,
      aparencia: {
        ...PADRAO_DE_FABRICA.aparencia,
        tema: 'papel',
        destaque: 'verde',
        densidade: 'normal',
        raio: 6,
      },
      dock: { posicao: 'esquerda', tamanho: 36, ampliar: false, ocultar: true },
      acessibilidade: { movimento: 'reduzido', transparencia: 'reduzida' },
    });
    localStorage.setItem('grafite.preferencias.atributos', JSON.stringify(atributos));
    new Function(scriptAntiFlash)();
    for (const [nome, valor] of Object.entries(atributos)) {
      const aplicado = nome.startsWith('--')
        ? raiz().style.getPropertyValue(nome)
        : raiz().getAttribute(nome);
      expect(aplicado, nome).toBe(valor);
    }
  });

  it('ignora nomes fora da lista e valores com caracteres inesperados', () => {
    localStorage.setItem(
      'grafite.preferencias.atributos',
      JSON.stringify({
        ...atributosDaInterface(PADRAO_DE_FABRICA),
        onclick: 'alert(1)',
        'data-dock': 'esquerda;x',
      }),
    );
    new Function(scriptAntiFlash)();
    expect(raiz().hasAttribute('onclick')).toBe(false);
    expect(raiz().hasAttribute('data-dock')).toBe(false);
    expect(raiz().getAttribute('data-theme')).toBe('grafite');
  });

  // Spec design-tokens, "Tema e destaque personalizados em tempo de execução".
  it('reabertura com o tema personalizado: a primeira pintura já usa as cores dele', () => {
    const personalizado = { tom: 'claro', matiz: 80, tingimento: 40, contraste: 45 } as const;
    const atributos = atributosDaInterface({
      ...PADRAO_DE_FABRICA,
      aparencia: { ...PADRAO_DE_FABRICA.aparencia, tema: 'personalizado', personalizado },
    });
    localStorage.setItem('grafite.preferencias.atributos', JSON.stringify(atributos));
    new Function(scriptAntiFlash)();
    expect(raiz().getAttribute('data-theme')).toBe('nevoa');
    expect(raiz().style.getPropertyValue('--cor-fundo')).toBe(
      temaPersonalizado(personalizado).cores.fundo,
    );
    for (const [nome, valor] of Object.entries(atributos)) {
      if (nome.startsWith('--')) expect(raiz().style.getPropertyValue(nome), nome).toBe(valor);
    }
  });

  it('valor estranho na cópia: ignora a variável e aplica as demais', () => {
    localStorage.setItem(
      'grafite.preferencias.atributos',
      JSON.stringify({
        '--cor-fundo': 'url(https://exemplo.com/x.png)',
        '--cor-superficie': 'var(--cor-texto)',
        '--cor-texto': '#123456',
        '--sombra-elevada': '0 1px 2px rgba(0, 0, 0, 0.5)',
        '--outra-coisa': '#123456',
      }),
    );
    new Function(scriptAntiFlash)();
    expect(raiz().style.getPropertyValue('--cor-fundo')).toBe('');
    expect(raiz().style.getPropertyValue('--cor-superficie')).toBe('');
    expect(raiz().style.getPropertyValue('--cor-texto')).toBe('#123456');
    expect(raiz().style.getPropertyValue('--sombra-elevada')).toBe('0 1px 2px rgba(0, 0, 0, 0.5)');
    expect(raiz().style.getPropertyValue('--outra-coisa')).toBe('');
  });
});
