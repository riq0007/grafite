import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

declare global {
  interface Window {
    __temaQuandoOBodyNasceu?: string | null;
  }
}

test('a casca abre sem erros no console', async ({ page }) => {
  const erros: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  expect(erros).toEqual([]);
});

test('o dock lateral cabe abaixo da barra e abre os módulos restantes por Mais', async ({
  page,
  servidor,
}) => {
  servidor.preferenciasDaConta = { dock: { posicao: 'esquerda', tamanho: 64 } };
  await page.setViewportSize({ width: 1350, height: 520 });
  await page.goto('/');
  const barra = page.getByRole('banner');
  const dock = page.getByRole('navigation', { name: 'Dock' });
  await expect(dock).toHaveAttribute('data-posicao', 'esquerda');
  const [caixaBarra, caixaDock] = await Promise.all([barra.boundingBox(), dock.boundingBox()]);
  assert(caixaBarra && caixaDock, 'A barra e o dock devem estar visíveis.');
  expect(caixaDock.y).toBeGreaterThanOrEqual(caixaBarra.y + caixaBarra.height);
  expect(caixaDock.y + caixaDock.height).toBeLessThanOrEqual(520);
  const mais = dock.getByRole('button', { name: 'Mais', exact: true });
  await expect(mais).toBeInViewport({ ratio: 1 });
  await expect(dock.getByRole('button', { name: 'Ajustes' })).toHaveCount(0);
  await dock.getByRole('button', { name: 'Início' }).focus();
  await page.keyboard.press('End');
  await expect(mais).toBeFocused();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Mais', exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Ajustes' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('menuitem', { name: 'Dock', exact: true }).click();
  await expect(page).toHaveURL(/\/ajustes\/dock/);
  await page.setViewportSize({ width: 1350, height: 1000 });
  await expect(mais).toHaveCount(0);
  await expect(dock.getByRole('button', { name: 'Ajustes' })).toBeInViewport({ ratio: 1 });
});

/**
 * Escolhe uma opção de um grupo da seção Aparência (tema, destaque ou densidade) clicando no
 * rótulo, como o usuário: o rádio em si fica escondido.
 */
const escolher = (pagina: Page, grupo: string, nome: string) =>
  pagina
    .getByRole('radiogroup', { name: grupo })
    .locator('label')
    .filter({ has: pagina.getByRole('radio', { name: nome, exact: true }) })
    .click();

test('o menu do usuário mostra a foto da pessoa da conta', async ({ page }) => {
  await page.goto('/');
  const usuario = page.getByRole('banner').getByRole('button', { name: 'Ana Souza' });
  const foto = usuario.locator('img');
  await expect(foto).toHaveAttribute('srcset', /\/api\/conta\/foto\/.+\/64 64w/);
  await expect
    .poll(() => foto.evaluate((imagem: HTMLImageElement) => imagem.naturalWidth))
    .toBeGreaterThan(0);
});

test('trocar o tema não recarrega a página', async ({ page }) => {
  await page.goto('/ajustes/aparencia');
  const navegacoes: string[] = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navegacoes.push(f.url());
  });
  await escolher(page, 'Tema', 'Névoa');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nevoa');
  // Névoa: o fundo gerado, #e3e5e9 (packages/ui/src/tokens/gerado/tokens.css)
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(227, 229, 233)');
  expect(navegacoes).toEqual([]);
});

test('ao reabrir, o tema salvo já vale quando o <body> nasce (sem piscar outro tema)', async ({
  page,
}) => {
  await page.goto('/ajustes/aparencia');
  await escolher(page, 'Tema', 'OLED');
  await page.addInitScript(() => {
    new MutationObserver((_, observador) => {
      if (document.body) {
        window.__temaQuandoOBodyNasceu = document.documentElement.getAttribute('data-theme');
        observador.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  expect(await page.evaluate(() => window.__temaQuandoOBodyNasceu)).toBe('oled');
});

test('destaque, densidade e raio escolhidos são aplicados e salvos', async ({ page, servidor }) => {
  await page.goto('/ajustes/aparencia');
  await escolher(page, 'Destaque', 'Verde');
  await escolher(page, 'Densidade', 'Confortável');
  // Cantos em 4 px: Home leva ao mínimo, e cada seta anda 1 px.
  await page.getByRole('slider', { name: 'Cantos' }).focus();
  await page.keyboard.press('Home');
  for (let passo = 0; passo < 4; passo++) await page.keyboard.press('ArrowRight');
  await expect(page.getByText('4 px', { exact: true })).toBeVisible();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-accent', 'verde');
  await expect(html).toHaveAttribute('data-density', 'confortavel');
  await expect
    .poll(() => servidor.preferenciasDaConta.aparencia)
    .toEqual({ destaque: 'verde', densidade: 'confortavel', raio: 4 });
  await page.reload();
  await expect(html).toHaveAttribute('data-accent', 'verde');
  await expect(html).toHaveAttribute('data-density', 'confortavel');
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--raio-base')),
  ).toBe('4px');
});

test('o destaque verde muda a interface inteira na hora, inclusive os Ajustes', async ({
  page,
}) => {
  await page.goto('/ajustes/aparencia');
  await escolher(page, 'Destaque', 'Verde');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'verde');
  // Grafite com destaque verde: o verde gerado para o Grafite, #55c483, no token e no rádio escolhido.
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--cor-destaque').trim(),
    ),
  ).toBe('#55c483');
  const bolinha = page
    .getByRole('radiogroup', { name: 'Destaque' })
    .locator('label', { has: page.getByRole('radio', { name: 'Verde', exact: true }) })
    .locator('[data-parte="bolinha"]');
  await expect(bolinha).toHaveCSS('border-top-color', 'rgb(85, 196, 131)');
});

// A barra de rolagem (spec componentes-base, "Barra de rolagem própria"; change
// barra-de-rolagem-propria, design, decisões 4, 6 e 7): o navegador destes testes esconde as
// barras, como o celular sobrepõe a dele, e a partida mede isso antes de a casca aparecer.
test('num aparelho de barra sobreposta, a partida marca a raiz e acompanha a rolagem', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-barra-do-sistema');

  // A área que rola ganha a marca, e a marca sai 1 s depois da última rolagem.
  const principal = page.getByRole('main');
  await principal.evaluate((area) => area.dispatchEvent(new Event('scroll')));
  await expect(principal).toHaveAttribute('data-rolando');
  await expect(principal).not.toHaveAttribute('data-rolando', { timeout: 4_000 });
});
