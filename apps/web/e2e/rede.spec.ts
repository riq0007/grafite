import type { Page } from '@playwright/test';
import { expect, SAUDE, test } from './fixtures.ts';

// Spec estrutura-da-casca, "Itens de status da barra": o item de rede, com o /api/health
// interceptado (a fixture responde como um servidor no ar; os testes de falha trocam a resposta).

const itemDeRede = (pagina: Page) => pagina.getByRole('banner').getByRole('status');
const conectado = (pagina: Page) =>
  itemDeRede(pagina).getByRole('img', { name: 'Conectado ao servidor' });

test('com o servidor respondendo, o item mostra que está conectado', async ({ page }) => {
  await page.goto('/');
  await expect(conectado(page)).toBeVisible();
  await expect(page.getByText('Sem conexão com o servidor')).toHaveCount(0);
});

test('sem resposta do servidor, o item mostra "Sem conexão com o servidor"', async ({ page }) => {
  await page.route('**/api/health', (rota) => rota.abort('connectionrefused'));
  await page.goto('/');
  await expect(itemDeRede(page)).toHaveText('Sem conexão com o servidor');
});

test('com o servidor fora do ar (503), o item mostra "Sem conexão com o servidor"', async ({
  page,
}) => {
  await page.route('**/api/health', (rota) =>
    rota.fulfill({
      status: 503,
      json: { ...SAUDE, status: 'indisponivel', banco: 'indisponivel' },
    }),
  );
  await page.goto('/');
  await expect(itemDeRede(page)).toHaveText('Sem conexão com o servidor');
});

test('o navegador sem rede mostra sem conexão na hora, e volta quando a rede volta', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(conectado(page)).toBeVisible();

  await context.setOffline(true);
  await expect(itemDeRede(page)).toHaveText('Sem conexão com o servidor', { timeout: 1_000 });

  await context.setOffline(false);
  await expect(conectado(page)).toBeVisible();
});
