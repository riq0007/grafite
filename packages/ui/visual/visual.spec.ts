// Capturas de referência do catálogo (design, decisão 8):
// - cada história nos temas Grafite e Névoa, nas larguras 1366, 1920 e 2560;
// - a casca inteira nos temas Grafite e Névoa, na matriz de resoluções da seção 7.8 da spec mestre;
// - a página-matriz em cada combinação de tema × densidade, em 1920.
// Histórias com função de interação ficam de fora: terminam em estado transitório (aviso com
// tempo, menu aberto) e o comportamento delas já é coberto pelos testes de interação. A exceção é
// a história com a tag "captura", cuja função só confere e a deixa como abriu.
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

interface Entrada {
  id: string;
  type: string;
  title: string;
  name: string;
  tags?: string[];
}

const raiz = process.env.RAIZ_DO_PACOTE ?? '..';
const { entries } = JSON.parse(readFileSync(`${raiz}/storybook-static/index.json`, 'utf8')) as {
  entries: Record<string, Entrada>;
};

const todas = Object.values(entries).filter((entrada) => entrada.type === 'story');
const matriz = todas.find((entrada) => entrada.tags?.includes('matriz'));
const semInteracao = todas.filter(
  (entrada) =>
    (!entrada.tags?.includes('play-fn') || entrada.tags.includes('captura')) &&
    !entrada.tags?.includes('matriz'),
);
const ehDaCasca = (entrada: Entrada) => entrada.title === 'Casca/Casca';
const historias = semInteracao.filter((entrada) => !ehDaCasca(entrada));
const historiasDaCasca = semInteracao.filter(ehDaCasca);

/**
 * Matriz de resoluções da seção 7.8 (spec posturas-da-casca). O 4K a 150% é a janela de 2560 ×
 * 1440 com escala 1,5; tablet e celular têm toque, para a casca escolher a postura do aparelho.
 */
const MATRIZ_DA_CASCA = [
  { nome: '1366x768', largura: 1366, altura: 768 },
  { nome: '1920x1080', largura: 1920, altura: 1080 },
  { nome: '2560x1440', largura: 2560, altura: 1440 },
  { nome: '3840x2160-150', largura: 2560, altura: 1440, escala: 1.5 },
  { nome: '3440x1440', largura: 3440, altura: 1440 },
  { nome: 'tablet-1024x768', largura: 1024, altura: 768, toque: true },
  { nome: 'celular-390x844', largura: 390, altura: 844, toque: true },
];

const TEMAS_POR_HISTORIA = ['grafite', 'nevoa'];
const LARGURAS = [1366, 1920, 2560];
const TEMAS = ['grafite', 'meia-noite', 'oled', 'nevoa', 'papel', 'alto-contraste'];
const DENSIDADES = ['compacta', 'normal', 'confortavel'];

/** Nome de arquivo sem acentos: os ids do Storybook guardam os do título. */
const semAcentos = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '');

async function abrir(page: Page, id: string, globais: string) {
  await page.goto(`/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=${globais}`);
  const raizDaHistoria = page.locator('#storybook-root');
  // Pronto quando há conteúdo visível: "não vazio" do Playwright olha o texto, e uma história
  // só de ícones (com nomes em aria-label) não tem texto. A espera vai a 30 s: com o executor do CI
  // carregado, a história passa dos 5 s do padrão para aparecer (change visual-sob-carga). A
  // comparação da captura segue com os 5 s, para a que diverge reprovar sem esperar mais.
  await expect(raizDaHistoria.locator(':scope > *').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // A captura espera a história ficar estável, com os 5 s da comparação, e o executor carregado já
  // fez essa espera passar deles. O scrollIntoViewIfNeeded faz a mesma espera, aqui com 30 s, e a
  // captura acha a história estável na hora (change captura-e-catalogo-sob-carga).
  await raizDaHistoria.scrollIntoViewIfNeeded({ timeout: 30_000 });
  return raizDaHistoria;
}

test('o catálogo tem histórias para capturar, a casca e a página-matriz', () => {
  expect(historias.length).toBeGreaterThan(0);
  expect(historiasDaCasca.map((historia) => historia.name)).toContain('Padrao');
  expect(matriz).toBeDefined();
});

for (const historia of historias) {
  for (const tema of TEMAS_POR_HISTORIA) {
    for (const largura of LARGURAS) {
      test(`${historia.title} › ${historia.name} · ${tema} · ${largura}`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 900 });
        const alvo = await abrir(page, historia.id, `tema:${tema}`);
        await expect(alvo).toHaveScreenshot(`${semAcentos(historia.id)}--${tema}--${largura}.png`);
      });
    }
  }
}

for (const resolucao of MATRIZ_DA_CASCA) {
  test.describe(`casca em ${resolucao.nome}`, () => {
    test.use({
      viewport: { width: resolucao.largura, height: resolucao.altura },
      deviceScaleFactor: resolucao.escala ?? 1,
      hasTouch: resolucao.toque ?? false,
      isMobile: resolucao.toque ?? false,
    });

    for (const historia of historiasDaCasca) {
      for (const tema of TEMAS_POR_HISTORIA) {
        test(`${historia.title} › ${historia.name} · ${tema} · ${resolucao.nome}`, async ({
          page,
        }) => {
          const alvo = await abrir(page, historia.id, `tema:${tema}`);
          // Com escala, a captura fica nos pixels do aparelho: o 4K a 150% sai em 3840 × 2160.
          await expect(alvo).toHaveScreenshot(
            `${semAcentos(historia.id)}--${tema}--${resolucao.nome}.png`,
            { scale: resolucao.escala ? 'device' : 'css' },
          );
        });
      }
    }
  });
}

for (const tema of TEMAS) {
  for (const densidade of DENSIDADES) {
    test(`Matriz · ${tema} · ${densidade}`, async ({ page }) => {
      if (!matriz) throw new Error('página-matriz ausente do catálogo');
      await page.setViewportSize({ width: 1920, height: 1080 });
      const alvo = await abrir(page, matriz.id, `tema:${tema};densidade:${densidade}`);
      await expect(alvo).toHaveScreenshot(`matriz--${tema}--${densidade}.png`);
    });
  }
}
