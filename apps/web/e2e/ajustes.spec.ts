import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Spec ajustes-do-sistema, "App Ajustes com seções", com a web compilada.

const titulo = (pagina: Page, nome: string) =>
  pagina.getByRole('heading', { level: 1, name: nome, exact: true });
const secoes = (pagina: Page) => pagina.getByRole('navigation', { name: 'Seções dos Ajustes' });

test('o endereço da seção Dock abre Ajustes com a seção Dock escolhida na lista', async ({
  page,
}) => {
  await page.goto('/ajustes/dock');
  await expect(titulo(page, 'Dock')).toBeVisible();
  await expect(secoes(page).getByRole('link', { name: 'Dock' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('escolher "Dock" no menu de Ajustes do dock abre a seção Dock', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Dock' })
    .getByRole('button', { name: 'Ajustes' })
    .hover();
  const menu = page.getByRole('menu', { name: 'Ajustes' });
  await menu.getByRole('menuitem', { name: 'Dock' }).click();
  await expect(page).toHaveURL(/\/ajustes\/dock$/);
  await expect(titulo(page, 'Dock')).toBeFocused();
});

test('o tamanho em 36 px muda o dock na hora e mostra "36 px"', async ({ page }) => {
  await page.goto('/ajustes/dock');
  await page.getByRole('slider', { name: 'Tamanho' }).focus();
  await page.keyboard.press('Home');
  for (let passo = 0; passo < 8; passo++) await page.keyboard.press('ArrowRight');
  await expect(page.getByText('36 px', { exact: true })).toBeVisible();
  const item = page
    .getByRole('navigation', { name: 'Dock' })
    .getByRole('button', { name: 'Início' });
  await expect.poll(async () => (await item.boundingBox())?.width).toBe(36);
});

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Ajustes mostra primeiro a lista, e a seção aparece sozinha, com Voltar', async ({
    page,
  }) => {
    await page.goto('/ajustes');
    await expect(titulo(page, 'Ajustes do Sistema')).toBeVisible();
    await expect(secoes(page).getByRole('link')).toHaveText([
      'Conta',
      'Aparência',
      'Dock',
      'Cursor',
      'Notificações',
      'Tabelas',
      'Idioma e região',
      'Acessibilidade',
    ]);

    await secoes(page).getByRole('link', { name: 'Dock' }).tap();
    await expect(titulo(page, 'Dock')).toBeVisible();
    await expect(secoes(page)).toHaveCount(0);

    await page.getByRole('link', { name: 'Voltar' }).tap();
    await expect(titulo(page, 'Ajustes do Sistema')).toBeVisible();
  });
});
