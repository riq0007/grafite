import '../src/fontes.css';
import '../src/tokens/gerado/tokens.css';
import '../src/base.css';
import type { Decorator, Preview } from '@storybook/react-vite';
import type { ViewportMap } from 'storybook/viewport';
import { esvaziarOAnunciador } from '../src/teste/anunciador.ts';
import { destaques } from '../src/tokens/destaques.ts';
import { densidades } from '../src/tokens/escalas.ts';
import { temas } from '../src/tokens/temas.ts';

/** Aplica tema, destaque, densidade e raio escolhidos na barra do catálogo. */
const aparencia: Decorator = (Historia, contexto) => {
  const { tema, destaque, densidade, raio } = contexto.globals;
  const raiz = document.documentElement;
  raiz.setAttribute('data-theme', String(tema));
  raiz.setAttribute('data-accent', String(destaque));
  raiz.setAttribute('data-density', String(densidade));
  raiz.style.setProperty('--raio-base', `${raio}px`);
  return <Historia />;
};

const itens = (ids: string[], nome: (id: string) => string = (id) => id) =>
  ids.map((id) => ({ value: id, title: nome(id) }));

const tamanho = (largura: number, altura: number) => ({
  width: `${largura}px`,
  height: `${altura}px`,
});

/**
 * Resoluções da matriz de teste (spec mestre, seção 7.8), na barra do catálogo e nas histórias
 * (`globals: { viewport: { value: 'tela2560' } }`; nos testes, o Vitest usa o mesmo tamanho).
 * O 4K com escala de 150% tem o layout de 2560 × 1440.
 */
const RESOLUCOES: ViewportMap = {
  celular390: { name: 'Celular · 390 × 844', styles: tamanho(390, 844), type: 'mobile' },
  tablet1024: { name: 'Tablet · 1024 × 768', styles: tamanho(1024, 768), type: 'tablet' },
  notebook1366: { name: 'Notebook · 1366 × 768', styles: tamanho(1366, 768), type: 'desktop' },
  tela1920: { name: 'Tela · 1920 × 1080', styles: tamanho(1920, 1080), type: 'desktop' },
  tela2560: { name: 'Tela · 2560 × 1440', styles: tamanho(2560, 1440), type: 'desktop' },
  ultrawide3440: { name: 'Ultrawide · 3440 × 1440', styles: tamanho(3440, 1440), type: 'desktop' },
};

const preview: Preview = {
  decorators: [aparencia],
  // O anunciador do React Aria guarda a última mensagem por 7 s, apontando para elementos da
  // história anterior. Esvaziar entre histórias evita que uma contamine a checagem da outra.
  beforeEach: esvaziarOAnunciador,
  globalTypes: {
    tema: {
      description: 'Tema',
      toolbar: {
        title: 'Tema',
        icon: 'paintbrush',
        dynamicTitle: true,
        items: itens(Object.keys(temas), (id) => temas[id as keyof typeof temas].nome),
      },
    },
    destaque: {
      description: 'Destaque',
      toolbar: {
        title: 'Destaque',
        icon: 'circle',
        dynamicTitle: true,
        items: itens(Object.keys(destaques)),
      },
    },
    densidade: {
      description: 'Densidade',
      toolbar: {
        title: 'Densidade',
        icon: 'component',
        dynamicTitle: true,
        items: itens(Object.keys(densidades)),
      },
    },
    raio: {
      description: 'Base do raio (px)',
      toolbar: {
        title: 'Raio',
        icon: 'grow',
        dynamicTitle: true,
        items: itens(['0', '5', '10', '15', '20', '24']),
      },
    },
  },
  initialGlobals: { tema: 'grafite', destaque: 'grafite', densidade: 'compacta', raio: '10' },
  parameters: {
    layout: 'padded',
    viewport: { options: RESOLUCOES },
    // Qualquer violação de acessibilidade reprova o teste da história.
    a11y: { test: 'error' },
  },
};

export default preview;
