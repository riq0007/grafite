import type { Locator, Page } from '@playwright/test';
import { expect, semRolagemHorizontal, test } from './fixtures.ts';

// Spec posturas-da-casca: tablet e celular, com a web compilada e o toque emulado.

const dock = (pagina: Page) => pagina.getByRole('navigation', { name: 'Dock' });
const titulo = (pagina: Page, nome: string) =>
  pagina.getByRole('heading', { level: 1, name: nome, exact: true });

/**
 * Confere que cada alvo tem pelo menos 44 × 44 px de área de toque: o tamanho de layout, sem a
 * escala da animação de abrir dos menus.
 */
async function alvosDeToque(alvos: Locator) {
  const lista = await alvos.all();
  expect(lista.length).toBeGreaterThan(0);
  for (const alvo of lista) {
    const [largura, altura] = await alvo.evaluate((elemento: HTMLElement) => [
      elemento.offsetWidth,
      elemento.offsetHeight,
    ]);
    const nome = (await alvo.getAttribute('aria-label')) ?? (await alvo.textContent());
    expect(largura, `largura de ${nome}`).toBeGreaterThanOrEqual(44);
    expect(altura, `altura de ${nome}`).toBeGreaterThanOrEqual(44);
  }
}

test.describe('tablet em 1024×768, com toque', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  test('o dock fica embaixo mesmo salvo à esquerda, com alvos de 44 px', async ({
    page,
    servidor,
  }) => {
    await page.goto('/ajustes/dock');
    await page
      .getByRole('radiogroup', { name: 'Posição' })
      .locator('label')
      .filter({ hasText: 'À esquerda' })
      .tap();
    await expect(dock(page)).toHaveAttribute('data-posicao', 'embaixo');
    await expect.poll(() => servidor.preferenciasDaConta.dock?.posicao).toBe('esquerda');

    await alvosDeToque(dock(page).getByRole('button'));
    await alvosDeToque(page.getByRole('banner').getByRole('button'));
    await semRolagemHorizontal(page);
  });

  test('o primeiro toque no item abre o menu, com itens de 44 px, e o item navega', async ({
    page,
  }) => {
    await page.goto('/');
    await dock(page).getByRole('button', { name: 'Ajustes' }).tap();
    const menu = page.getByRole('menu', { name: 'Ajustes' });
    await expect(menu).toBeVisible();
    await alvosDeToque(menu.getByRole('menuitem'));
    await menu.getByRole('menuitem', { name: 'Acessibilidade' }).tap();
    await expect(titulo(page, 'Acessibilidade')).toBeVisible();
    await expect(menu).toHaveCount(0);
  });
});

test.describe('celular em 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a barra de abas fica no lugar do dock, com alvos de 44 px', async ({ page }) => {
    await page.goto('/');
    await expect(dock(page)).toHaveCount(0);
    const abas = page.getByRole('navigation', { name: 'Módulos' });
    await alvosDeToque(abas.getByRole('button'));
    await alvosDeToque(page.getByRole('banner').getByRole('button'));

    await abas.getByRole('button', { name: 'Ajustes' }).tap();
    await expect(titulo(page, 'Ajustes do Sistema')).toBeVisible();
    await expect(abas.getByRole('button', { name: 'Ajustes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('o nome do módulo abre a árvore num painel que sobe de baixo', async ({ page }) => {
    await page.goto('/ajustes');
    await page.getByRole('banner').getByRole('button', { name: 'Ajustes' }).tap();
    const painel = page.getByRole('dialog', { name: 'Ajustes' });
    await expect(painel).toBeVisible();
    // Preso à borda de baixo da tela, quando termina de subir.
    await expect
      .poll(async () => {
        const caixa = await painel.boundingBox();
        return Math.round((caixa?.y ?? 0) + (caixa?.height ?? 0));
      })
      .toBe(844);
    await alvosDeToque(painel.getByRole('button'));

    await painel.getByRole('button', { name: 'Dock' }).tap();
    await expect(titulo(page, 'Dock')).toBeVisible();
    await expect(painel).toHaveCount(0);
  });

  test('nenhuma tela rola na horizontal', async ({ page }) => {
    for (const endereco of [
      '/',
      '/ajustes',
      '/ajustes/aparencia',
      '/ajustes/dock',
      '/ajustes/acessibilidade',
      '/endereco-que-nao-existe',
    ]) {
      await page.goto(endereco);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await semRolagemHorizontal(page);
    }
  });
});
