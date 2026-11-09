// A sanitização do SVG enviado (spec arquivos-e-imagens; design do F2c, decisão 7), que roda na
// linha dos SVG (`svg-trabalhador.ts`), e nunca na da API. O DOMPurify, com o perfil SVG sobre o
// jsdom, tira os scripts, os atributos de evento e os objetos estrangeiros; depois, toda referência
// que não seja interna (`#…`) sai, nos atributos e no CSS. O jsdom e o DOMPurify só são carregados
// quando chega o primeiro SVG.
import type { DOMPurify } from 'dompurify';
import type { JSDOM } from 'jsdom';

const SVG = 'http://www.w3.org/2000/svg';

/** O pedido à linha dos SVG. */
export interface PedidoDeSanitizacao {
  id: number;
  texto: string;
}

/** A resposta da linha dos SVG: o SVG sanitizado, `null` quando ele não serve, ou o erro. */
export type RespostaDaSanitizacao =
  | { id: number; svg: string | null }
  | { id: number; erro: string };

let ferramentas: Promise<{ window: JSDOM['window']; purify: DOMPurify }> | undefined;

function carregar() {
  ferramentas ??= (async () => {
    const [{ JSDOM }, { default: criarDOMPurify }] = await Promise.all([
      import('jsdom'),
      import('dompurify'),
    ]);
    const { window } = new JSDOM('');
    return { window, purify: criarDOMPurify(window as unknown as Window & typeof globalThis) };
  })();
  return ferramentas;
}

/**
 * O CSS sem referências externas: o `url()` que não aponta para dentro do SVG vira `none`. O CSS
 * com `@import`, `image-set()` ou um escape, que esconderia uma referência, sai inteiro (`null`).
 */
function cssSemReferenciasExternas(css: string): string | null {
  if (/\\|@import|image-set\(/i.test(css)) return null;
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (inteiro, _aspas, alvo: string) =>
    alvo.trim().startsWith('#') ? inteiro : 'none',
  );
}

/** Tira de cada elemento as referências para fora do SVG, nos endereços e no CSS. */
function tirarReferenciasExternas(raiz: Element) {
  for (const elemento of [raiz, ...raiz.querySelectorAll('*')]) {
    for (const atributo of [...elemento.attributes]) {
      if (atributo.localName === 'href') {
        if (!atributo.value.trim().startsWith('#')) elemento.removeAttributeNode(atributo);
      } else if (atributo.localName === 'style' || /url\(/i.test(atributo.value)) {
        const limpo = cssSemReferenciasExternas(atributo.value);
        if (limpo === null) elemento.removeAttributeNode(atributo);
        else atributo.value = limpo;
      }
    }
    if (elemento.localName === 'style') {
      const limpo = cssSemReferenciasExternas(elemento.textContent ?? '');
      if (limpo === null) elemento.remove();
      else elemento.textContent = limpo;
    }
  }
}

/** Os elementos que desenham; o `use` só desenha com o que ele aponta. */
const GRAFICOS = [
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'use',
];
/** Os elementos cujo conteúdo só é desenhado quando referenciado. */
const NAO_DESENHAM = new Set(['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'marker']);

function temDesenho(raiz: Element): boolean {
  return GRAFICOS.some((nome) =>
    [...raiz.getElementsByTagNameNS(SVG, nome)].some((elemento) => {
      if (nome === 'use' && ![...elemento.attributes].some((a) => a.localName === 'href')) {
        return false;
      }
      for (let pai = elemento.parentElement; pai && pai !== raiz; pai = pai.parentElement) {
        if (NAO_DESENHAM.has(pai.localName)) return false;
      }
      return true;
    }),
  );
}

/**
 * O SVG sanitizado, como texto, ou `null` se ele não se lê como SVG ou fica sem desenho. As
 * referências internas, como as de um gradiente, de um recorte ou de um `use`, continuam.
 */
export async function sanitizarNoDom(texto: string): Promise<string | null> {
  const { window, purify } = await carregar();
  const documento = new window.DOMParser().parseFromString(texto, 'image/svg+xml');
  const raiz = documento.documentElement;
  if (raiz.namespaceURI !== SVG || raiz.localName !== 'svg') return null;
  purify.sanitize(raiz, {
    IN_PLACE: true,
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    FORBID_TAGS: ['script', 'foreignobject'],
    KEEP_CONTENT: false,
  });
  tirarReferenciasExternas(raiz);
  if (!temDesenho(raiz)) return null;
  return new window.XMLSerializer().serializeToString(raiz);
}
