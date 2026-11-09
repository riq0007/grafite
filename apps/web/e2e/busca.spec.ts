import type { Page } from '@playwright/test';
import { expect, semRolagemHorizontal, test } from './fixtures.ts';

// Spec busca-global, com a web compilada.

const titulo = (pagina: Page, nome: string) =>
  pagina.getByRole('heading', { level: 1, name: nome, exact: true });
const busca = (pagina: Page) => pagina.getByRole('dialog', { name: 'Busca' });
const campo = (pagina: Page) => busca(pagina).getByRole('searchbox', { name: 'Buscar' });
const botaoDaBarra = (pagina: Page) =>
  pagina.getByRole('banner').getByRole('button', { name: 'Buscar' });

test('Ctrl+K e "aparencia", sem acento, levam à seção Aparência', async ({ page }) => {
  await page.goto('/');
  await expect(titulo(page, 'O que resolver agora')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(campo(page)).toBeFocused();
  await page.keyboard.type('aparencia');
  await expect(busca(page).getByRole('option', { name: 'Aparência', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/ajustes\/aparencia$/);
  await expect(titulo(page, 'Aparência')).toBeFocused();
  await expect(busca(page)).toHaveCount(0);
});

test('"tamanho do dock" abre a seção Dock com o foco no controle do tamanho', async ({ page }) => {
  await page.goto('/');
  await botaoDaBarra(page).click();
  await campo(page).fill('tamanho do dock');
  await expect(busca(page).getByRole('option', { name: 'Tamanho do dock' })).toContainText(
    'Ajustes › Dock',
  );
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/ajustes\/dock\?foco=tamanho-do-dock$/);
  await expect(page.getByRole('slider', { name: 'Tamanho' })).toBeFocused();
});

test('Esc fecha a busca sem escolher e devolve o foco ao botão da barra', async ({ page }) => {
  await page.goto('/');
  await botaoDaBarra(page).click();
  await expect(campo(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(busca(page)).toHaveCount(0);
  await expect(botaoDaBarra(page)).toBeFocused();
});

test('a ação "Usar o tema Névoa" fecha a busca e muda o tema na hora', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('nevoa');
  await busca(page).getByRole('option', { name: 'Usar o tema Névoa' }).click();
  await expect(busca(page)).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nevoa');
});

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('o botão de busca fica à vista, e a busca abre na largura da tela, sem rolagem horizontal', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(botaoDaBarra(page)).toBeVisible();
    await botaoDaBarra(page).tap();
    await expect(campo(page)).toBeVisible();
    // Depois da escala leve de abrir, a busca ocupa a largura inteira.
    await expect
      .poll(async () => {
        const painel = await busca(page).boundingBox();
        return painel && [painel.x, painel.width];
      })
      .toEqual([0, 390]);
    await semRolagemHorizontal(page);
  });
});
