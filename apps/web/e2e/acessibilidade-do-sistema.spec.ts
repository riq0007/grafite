import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/** O material translúcido do dock, no fundo à parte que cobre os itens ampliados. */
const materialDoDock = (pagina: Page) =>
  pagina.getByRole('navigation', { name: 'Dock' }).locator('[data-parte="fundo"]');

/**
 * Fixa o que o sistema pede de transparência. Sem isso, vale o aparelho que roda o teste: o
 * Chromium no Windows segue o ajuste de efeitos de transparência do sistema.
 */
async function sistemaPedeTransparenciaReduzida(pagina: Page, pede: boolean) {
  const cdp = await pagina.context().newCDPSession(pagina);
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: pede ? 'reduce' : 'no-preference' }],
  });
}

// Grafite: o material gerado, translúcido rgba(38, 40, 43, 0.78) e sólido #26282b.
const TRANSLUCIDO = 'rgba(38, 40, 43, 0.78)';
const SOLIDO = 'rgb(38, 40, 43)';

test.describe('com movimento reduzido no sistema', () => {
  test.use({ reducedMotion: 'reduce' });

  test('deslocamentos e molas duram zero', async ({ page }) => {
    await page.goto('/');
    const [deslocamento, mola] = await page.evaluate(() => {
      const estilo = getComputedStyle(document.documentElement);
      return [
        estilo.getPropertyValue('--dur-deslocamento').trim(),
        estilo.getPropertyValue('--dur-mola-aviso').trim(),
      ];
    });
    // A build de produção pode escrever 0ms como 0s: compara a duração, não o texto.
    const emMs = (v: string) =>
      v.endsWith('ms') ? Number.parseFloat(v) : Number.parseFloat(v) * 1000;
    expect([emMs(deslocamento), emMs(mola)]).toEqual([0, 0]);
  });
});

test('reduzir a transparência nos Ajustes deixa o dock e os menus sólidos na hora', async ({
  page,
}) => {
  await sistemaPedeTransparenciaReduzida(page, false);
  await page.goto('/ajustes/acessibilidade');
  const material = materialDoDock(page);
  await expect(material).toHaveCSS('background-color', TRANSLUCIDO);

  await page
    .getByRole('radiogroup', { name: 'Transparência' })
    .locator('label')
    .filter({ hasText: 'Reduzir' })
    .click();
  await expect(material).toHaveCSS('background-color', SOLIDO);
  await expect(material).toHaveCSS('backdrop-filter', 'none');

  await page.getByRole('banner').getByRole('button', { name: 'Ana Souza' }).click();
  const menu = page.locator('[data-trigger="MenuTrigger"]');
  await expect(menu).toHaveCSS('background-color', SOLIDO);
  await expect(menu).toHaveCSS('backdrop-filter', 'none');
});

test('com transparência reduzida no sistema, o material fica sólido', async ({ page }) => {
  await sistemaPedeTransparenciaReduzida(page, true);
  await page.goto('/');
  await expect(materialDoDock(page)).toHaveCSS('background-color', SOLIDO);
});

test('sem pedido do sistema, o material fica translúcido', async ({ page }) => {
  await sistemaPedeTransparenciaReduzida(page, false);
  await page.goto('/');
  await expect(materialDoDock(page)).toHaveCSS('background-color', TRANSLUCIDO);
});
