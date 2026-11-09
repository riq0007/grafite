import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Specs estrutura-da-casca ("Navegação entre módulos" e "Janela de conteúdo") e dock ("Itens do
// dock"), com a web compilada.

declare global {
  interface Window {
    __semRecarregar?: boolean;
  }
}

const dock = (pagina: Page) => pagina.getByRole('navigation', { name: 'Dock' });
const titulo = (pagina: Page, nome: string) =>
  pagina.getByRole('heading', { level: 1, name: nome, exact: true });

/** Marca a página: a marca some se ela recarregar. */
const marcar = (pagina: Page) =>
  pagina.evaluate(() => {
    window.__semRecarregar = true;
  });
const naoRecarregou = (pagina: Page) => pagina.evaluate(() => window.__semRecarregar === true);

test('o dock troca de módulo sem recarregar a página, e o foco vai ao título', async ({ page }) => {
  await page.goto('/');
  await expect(titulo(page, 'O que resolver agora')).toBeVisible();
  await marcar(page);

  await dock(page).getByRole('button', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(/\/ajustes$/);
  await expect(titulo(page, 'Aparência')).toBeFocused();
  await expect(dock(page).getByRole('button', { name: 'Ajustes' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('banner').getByText('Ajustes', { exact: true })).toBeVisible();
  expect(await naoRecarregou(page)).toBe(true);
});

test('o voltar do navegador devolve o módulo anterior, com o foco no título', async ({ page }) => {
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Ajustes' }).click();
  await expect(titulo(page, 'Aparência')).toBeVisible();
  await marcar(page);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(titulo(page, 'O que resolver agora')).toBeFocused();
  await expect(dock(page).getByRole('button', { name: 'Início' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(await naoRecarregou(page)).toBe(true);
});

test('pelo teclado, as setas andam no dock, e Enter abre o módulo com o foco no título', async ({
  page,
}) => {
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Início' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dock(page).getByRole('button', { name: 'Ativos', exact: true })).toBeFocused();
  // A Gestão de ativos vem logo depois do Ativos (change gestao-de-ativos).
  await page.keyboard.press('ArrowRight');
  await expect(dock(page).getByRole('button', { name: 'Gestão de ativos' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(dock(page).getByRole('button', { name: 'Alertas' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(dock(page).getByRole('button', { name: 'Operação' })).toBeFocused();
  // O Mapa, as Salas e os Painéis (changes p7-mapa-da-planta, salas-de-reuniao e
  // painel-de-dashboards) vêm entre o Operação e o Cofre.
  for (const modulo of ['Mapa', 'Salas', 'Painéis', 'Cofre']) {
    await page.keyboard.press('ArrowRight');
    await expect(dock(page).getByRole('button', { name: modulo })).toBeFocused();
  }
  await page.keyboard.press('ArrowRight');
  await expect(dock(page).getByRole('button', { name: 'Administração' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(dock(page).getByRole('button', { name: 'Ajustes' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(titulo(page, 'Aparência')).toBeFocused();
});

test('o primeiro Tab vai a "Ir para o conteúdo", e Enter leva o foco à área que rola da janela', async ({
  page,
}) => {
  await page.goto('/');
  await expect(titulo(page, 'O que resolver agora')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Ir para o conteúdo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main').locator(':scope > [data-rolagem-da-janela]')).toBeFocused();
});

test('um endereço desconhecido mostra "Página não encontrada" dentro da casca', async ({
  page,
}) => {
  await page.goto('/endereco-que-nao-existe');
  await expect(titulo(page, 'Página não encontrada')).toBeVisible();
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(dock(page)).toBeVisible();
  await expect(dock(page).getByRole('button', { name: 'Início' })).not.toHaveAttribute(
    'aria-current',
  );

  await page.getByRole('link', { name: 'Ir para o Início' }).click();
  await expect(titulo(page, 'O que resolver agora')).toBeFocused();
});
