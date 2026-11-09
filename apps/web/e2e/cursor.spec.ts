import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Spec cursor-suavizado, com a web compilada e o mouse do Playwright.

const ponto = (pagina: Page) => pagina.locator('[data-cursor="ponto"]');
const anel = (pagina: Page) => pagina.locator('[data-cursor="anel"]');
const html = (pagina: Page) => pagina.locator('html');

/** Abre o endereço e espera a casca montar: antes dela, não há cursor para seguir o mouse. */
async function abrir(pagina: Page, endereco: string) {
  await pagina.goto(endereco);
  await expect(pagina.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('sem movimento reduzido', () => {
  // O pedido do sistema fica fixo: o desta máquina não decide o teste.
  test.use({ reducedMotion: 'no-preference' });

  test('o ponto e o anel aparecem ao mover o mouse, no lugar do cursor do sistema', async ({
    page,
  }) => {
    await abrir(page, '/');
    await page.mouse.move(400, 300);
    await expect(ponto(page)).toHaveAttribute('data-visivel', '');
    await expect(anel(page)).toHaveAttribute('data-visivel', '');
    await expect(html(page)).toHaveAttribute('data-cursor-suavizado', '');
    await expect
      .poll(() => ponto(page).evaluate((elemento) => elemento.getBoundingClientRect().x))
      .toBeCloseTo(400 - 3, 0);
  });

  test('o anel abraça um botão, com 4 px de folga de cada lado, e o ponto some', async ({
    page,
  }) => {
    await page.goto('/');
    const botao = page.getByRole('banner').getByRole('button', { name: 'Buscar' });
    await botao.hover();
    await expect(anel(page)).toHaveAttribute('data-abracando', '');
    await expect(ponto(page)).not.toHaveAttribute('data-visivel', '');
    const caixa = await botao.boundingBox();
    await expect
      .poll(async () => {
        const forma = await anel(page).boundingBox();
        return forma && [Math.round(forma.width), Math.round(forma.height)];
      })
      .toEqual([Math.round((caixa?.width ?? 0) + 8), Math.round((caixa?.height ?? 0) + 8)]);
  });

  test('num campo de texto, o ponto e o anel somem, e volta o cursor do sistema', async ({
    page,
  }) => {
    await abrir(page, '/');
    await page.mouse.move(400, 300);
    await expect(html(page)).toHaveAttribute('data-cursor-suavizado', '');
    await page.keyboard.press('Control+k');
    const campo = page.getByRole('dialog', { name: 'Busca' }).getByRole('searchbox');
    await campo.hover();
    await expect(html(page)).not.toHaveAttribute('data-cursor-suavizado', '');
    await expect(ponto(page)).not.toHaveAttribute('data-visivel', '');
    await expect(anel(page)).not.toHaveAttribute('data-visivel', '');
  });

  test('com "Do sistema" nos Ajustes, o cursor suavizado sai na hora', async ({ page }) => {
    await abrir(page, '/ajustes/cursor');
    await page.mouse.move(400, 300);
    await expect(ponto(page)).toHaveCount(1);
    await page
      .getByRole('radiogroup', { name: 'Tipo de cursor' })
      .locator('label')
      .filter({ hasText: 'Do sistema' })
      .click();
    await page.mouse.move(420, 320);
    await expect(ponto(page)).toHaveCount(0);
    await expect(html(page)).not.toHaveAttribute('data-cursor-suavizado', '');
  });
});

test.describe('com movimento reduzido pedido pelo sistema', () => {
  test.use({ reducedMotion: 'reduce' });

  test('o cursor suavizado não aparece, mesmo escolhido', async ({ page }) => {
    await abrir(page, '/');
    await page.mouse.move(400, 300);
    await page.mouse.move(420, 320);
    await expect(ponto(page)).toHaveCount(0);
    await expect(html(page)).not.toHaveAttribute('data-cursor-suavizado', '');
  });
});
