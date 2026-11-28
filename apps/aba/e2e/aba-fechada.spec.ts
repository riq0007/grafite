import { expect, type Page, test } from '@playwright/test';
import { chamadasDe, emitir, simularOTauri } from './tauri.ts';

// A aba fechada (change aba-dos-colaboradores, tarefa 5.3; spec "Aba fechada" e "Temas do Windows"):
// a pílula e o entalhe, os quatro estados, a tela pequena, os três temas do Windows e a forma
// informada ao lado nativo, que deixa o clique passar fora dela.

const JANELA = { width: 440, height: 480 };
test.use({ viewport: JANELA });

interface Aparencia {
  forma: 'pilula' | 'entalhe';
  tema: 'escuro' | 'claro' | 'alto-contraste';
  movimentoReduzido: boolean;
  tela: { largura: number; altura: number };
}

const aparencia = (mudanca: Partial<Aparencia> = {}): Aparencia => ({
  forma: 'pilula',
  tema: 'escuro',
  movimentoReduzido: false,
  tela: { largura: 1440, altura: 900 },
  ...mudanca,
});

async function abrir(page: Page, mudanca: Partial<Aparencia> = {}) {
  await simularOTauri(page, { aparencia: aparencia(mudanca), informar_forma: null });
  await page.goto('/');
  const aba = page.getByRole('button', { name: 'Suporte da TI' });
  await expect(aba).toBeVisible();
  return aba;
}

interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
  raioDeCima: number;
  raioDeBaixo: number;
}

async function ultimaForma(page: Page): Promise<Retangulo | undefined> {
  const chamadas = (await chamadasDe(page, 'informar_forma')) as Array<{ retangulos: Retangulo[] }>;
  return chamadas.at(-1)?.retangulos[0];
}

test('a pílula de fábrica: 162×34, a 8 px do alto e no meio, sem o logo, e a forma informada', async ({
  page,
}) => {
  const aba = await abrir(page);
  await expect(aba).toHaveAttribute('data-forma', 'pilula');
  const caixa = await aba.boundingBox();
  expect(caixa?.width).toBe(162);
  expect(caixa?.height).toBe(34);
  expect(caixa?.y).toBe(8);
  expect((caixa?.x ?? 0) + (caixa?.width ?? 0) / 2).toBeCloseTo(JANELA.width / 2, 0);
  await expect(page.getByText('grafite', { exact: true })).toHaveCount(0);

  await expect
    .poll(() => ultimaForma(page))
    .toMatchObject({
      y: 8,
      altura: 34,
      raioDeCima: 17,
      raioDeBaixo: 17,
    });
  expect(await ultimaForma(page)).toMatchObject({ x: 139, largura: 162 });
});

test('na tela de 1366×768, a pílula tem 160×32 e desce para 36 px do alto', async ({ page }) => {
  const aba = await abrir(page, { tela: { largura: 1366, altura: 768 } });
  const caixa = await aba.boundingBox();
  expect(caixa?.width).toBe(160);
  expect(caixa?.height).toBe(32);
  expect(caixa?.y).toBe(36);
  await expect.poll(() => ultimaForma(page)).toMatchObject({ y: 36, altura: 32, raioDeBaixo: 16 });
});

test('o entalhe preso à borda de cima: 184×32, que cresce para 36 com o mouse em cima', async ({
  page,
}) => {
  const aba = await abrir(page, { forma: 'entalhe' });
  await expect(aba).toHaveAttribute('data-forma', 'entalhe');
  const caixa = await aba.boundingBox();
  expect(caixa?.width).toBe(184);
  expect(caixa?.height).toBe(32);
  expect(caixa?.y).toBe(0);
  await expect
    .poll(() => ultimaForma(page))
    .toMatchObject({
      y: 0,
      largura: 184,
      altura: 32,
      raioDeCima: 0,
      raioDeBaixo: 16,
    });

  await aba.hover();
  await expect(aba).toHaveCSS('height', '36px');
  await expect(aba).toHaveCSS('background-color', 'rgb(0, 100, 182)');
  await expect.poll(() => ultimaForma(page)).toMatchObject({ y: 0, altura: 36 });
});

test('a configuração que passa para o entalhe troca a forma sem reiniciar', async ({ page }) => {
  const aba = await abrir(page);
  await emitir(page, 'aparencia-mudou', aparencia({ forma: 'entalhe' }));
  await expect(aba).toHaveAttribute('data-forma', 'entalhe');
  await expect.poll(() => ultimaForma(page)).toMatchObject({ y: 0, largura: 184 });
});

test('os quatro estados da pílula: repouso, mouse em cima, pressionada e foco', async ({
  page,
}) => {
  const aba = await abrir(page);
  await expect(aba).toHaveCSS('transform', 'none');
  await expect(aba).toHaveCSS('background-color', 'rgb(0, 79, 157)');

  await aba.hover();
  await expect(aba).toHaveCSS('transform', 'matrix(1.07, 0, 0, 1.07, 0, -1)');
  await expect(aba).toHaveCSS('background-color', 'rgb(0, 100, 182)');

  await page.mouse.down();
  await expect(aba).toHaveCSS('transform', 'matrix(0.96, 0, 0, 0.96, 0, 0)');
  await expect(aba).toHaveCSS('background-color', 'rgb(0, 57, 117)');
  await page.mouse.up();

  await page.mouse.move(0, JANELA.height - 1);
  await aba.blur();
  await page.keyboard.press('Tab');
  await expect(aba).toBeFocused();
  // O anel de 3 px na cor do texto, com a folga no fundo 2 e o fio escuro por fora.
  await expect(aba).toHaveCSS(
    'box-shadow',
    /rgb\(0, 57, 117\) 0px 0px 0px 2px, rgb\(244, 251, 255\) 0px 0px 0px 5px/,
  );
});

test('sem as animações do Windows, a pílula não cresce nem se desloca', async ({ page }) => {
  const aba = await abrir(page, { movimentoReduzido: true });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduzido');
  await aba.hover();
  await expect(aba).toHaveCSS('background-color', 'rgb(0, 100, 182)');
  await expect(aba).toHaveCSS('transform', 'none');
});

test.describe('os três temas do Windows', () => {
  test('no escuro e no claro, o mesmo azul; no claro, o fio escuro por fora é uma tinta do texto', async ({
    page,
  }) => {
    const aba = await abrir(page);
    await expect(page.locator('html')).toHaveAttribute('data-windows-theme', 'escuro');
    await expect(aba).toHaveCSS('box-shadow', /^rgba\(4, 17, 28, 0\.85\) 0px 0px 0px 1px/);

    await emitir(page, 'aparencia-mudou', aparencia({ tema: 'claro' }));
    await expect(page.locator('html')).toHaveAttribute('data-windows-theme', 'claro');
    await expect(aba).toHaveCSS('background-color', 'rgb(0, 79, 157)');
    await expect(aba).toHaveCSS('border-top-color', 'rgb(134, 197, 250)');
    await expect(aba).toHaveCSS('box-shadow', /^rgba\(19, 17, 13, 0\.62\) 0px 0px 0px 1px/);
  });

  test('no alto contraste, só as cores do sistema, com o fio de 2 px', async ({ page }) => {
    const aba = await abrir(page, { tema: 'alto-contraste' });
    const doSistema = await page.evaluate(() => {
      const amostra = document.createElement('div');
      amostra.style.backgroundColor = 'Canvas';
      amostra.style.color = 'CanvasText';
      document.body.append(amostra);
      const estilo = getComputedStyle(amostra);
      const cores = { canvas: estilo.backgroundColor, texto: estilo.color };
      amostra.remove();
      return cores;
    });
    await expect(aba).toHaveCSS('background-color', doSistema.canvas);
    await expect(aba).toHaveCSS('color', doSistema.texto);
    await expect(aba).toHaveCSS('border-top-color', doSistema.texto);
    await expect(aba).toHaveCSS('border-top-width', '2px');
  });
});

test.describe('as referências visuais', () => {
  test.skip(
    process.platform !== 'win32',
    'A aba é do Windows, e as referências são gravadas nele.',
  );

  for (const forma of ['pilula', 'entalhe'] as const) {
    for (const tema of ['escuro', 'claro', 'alto-contraste'] as const) {
      test(`${forma} fechada no tema ${tema}`, async ({ page }) => {
        await abrir(page, { forma, tema });
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${forma}-${tema}.png`, {
          clip: { x: JANELA.width / 2 - 120, y: 0, width: 240, height: 72 },
          omitBackground: true,
        });
      });
    }
  }
});
