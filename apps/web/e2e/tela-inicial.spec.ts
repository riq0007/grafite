import type { Page } from '@playwright/test';
import { expect, semRolagemHorizontal, test } from './fixtures.ts';

// Spec tela-inicial, com a web compilada: o Alertas registra a fonte de ocorrências (change
// p3a-regras-e-alertas), e sem alertas para resolver o Início diz que nada está aberto; a conta que
// não vê os alertas não tem fonte nenhuma, e o Início diz isso, sem ocorrências inventadas.

const titulo = (pagina: Page) =>
  pagina.getByRole('heading', { level: 1, name: 'O que resolver agora', exact: true });

async function abrirOInicioSemAbertas(pagina: Page) {
  await pagina.goto('/');
  // O nome exato do título já diz que não há contagem de abertas.
  await expect(titulo(pagina)).toBeVisible();
  await expect(pagina.getByText('Nenhuma ocorrência aberta.')).toBeVisible();
  await expect(pagina.getByRole('row')).toHaveCount(0);
}

test('sem alertas para resolver, o Início diz que nada está aberto', async ({ page }) => {
  await abrirOInicioSemAbertas(page);
});

test.describe('sem ver os alertas', () => {
  test.use({ semPermissoes: true });

  test('o Início diz que nenhum módulo registra ocorrências ainda', async ({ page }) => {
    await page.goto('/');
    await expect(titulo(page)).toBeVisible();
    await expect(page.getByText('Nenhum módulo registra ocorrências ainda')).toBeVisible();
  });
});

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a tela inicial cabe na largura, sem rolagem horizontal', async ({ page }) => {
    await abrirOInicioSemAbertas(page);
    await semRolagemHorizontal(page);
  });
});
