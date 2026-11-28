import { expect, test } from '@playwright/test';
import { simularOTauri } from './tauri.ts';

// O esqueleto da tela da aba (change aba-dos-colaboradores, tarefa 5.1): a página compilada abre,
// com os tokens do Grafite, sem erro no console.
test('a tela da aba abre sem erro', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error') erros.push(mensagem.text());
  });
  await simularOTauri(page);
  await page.goto('/');
  await expect(page.locator('[data-aba]')).toBeAttached();
  expect(erros).toEqual([]);
});
