import type { Page } from '@playwright/test';
import { simularChamados } from './api-dos-chamados.ts';
import { expect, test } from './fixtures.ts';

// Spec modulo-chamados, "Primeira tela ao entrar" (change chamados-da-ti, design, decisão 14), com a
// web compilada e a aba sem a marca da conta: a raiz pura leva quem vê os chamados ao Início deles,
// uma vez por aba, e as outras contas e as cargas seguintes ficam onde estão.
test.use({ primeiraTelaVista: false });

const dock = (pagina: Page) => pagina.getByRole('navigation', { name: 'Dock' });
const inicioDosChamados = (pagina: Page) =>
  pagina.getByRole('heading', { level: 1, name: /^(Bom dia|Boa tarde|Boa noite), Ana$/ });
const inicio = (pagina: Page) =>
  pagina.getByRole('heading', { level: 1, name: /O que resolver agora/ });

test('Ana entra pela raiz no Início dos chamados, e o Início do dock fica, também ao recarregar', async ({
  page,
}) => {
  await simularChamados(page);
  await page.goto('/');
  await expect(inicioDosChamados(page)).toBeVisible();
  await expect(page).toHaveURL(/\/chamados$/);

  await dock(page).getByRole('button', { name: 'Início', exact: true }).click();
  await expect(inicio(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(inicio(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('a aba nova abre no Início dos chamados, com a primeira aba no Início', async ({
  page,
  context,
}) => {
  await simularChamados(page);
  await page.goto('/');
  await expect(inicioDosChamados(page)).toBeVisible();
  await dock(page).getByRole('button', { name: 'Início', exact: true }).click();
  await expect(inicio(page)).toBeVisible();

  const abaNova = await context.newPage();
  await simularChamados(abaNova);
  await abaNova.goto('/');
  await expect(inicioDosChamados(abaNova)).toBeVisible();
  await expect(abaNova).toHaveURL(/\/chamados$/);
});

test('o endereço com caminho abre o que pede, sem a primeira tela', async ({ page }) => {
  await page.goto('/ajustes/dock');
  await expect(page.getByRole('heading', { level: 1, name: 'Dock', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/ajustes\/dock$/);
});

test.describe('conta sem os chamados', () => {
  test.use({ semPermissoes: true });

  test('a primeira tela é o Início', async ({ page }) => {
    await page.goto('/');
    await expect(dock(page).getByRole('button', { name: 'Ajustes' })).toBeVisible();
    await expect(dock(page).getByRole('button', { name: 'Chamados' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });
});
