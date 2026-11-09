import { expect, test } from './fixtures.ts';

// Spec identidade-visual, "Marca aplicada na aplicação": favicon e nome na aba, marca na casca
// e os ícones da PWA declarados no manifesto.

test('a aba mostra o nome do produto e o favicon da marca', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Grafite');
  const icones = await page
    .locator('link[rel="icon"]')
    .evaluateAll((links) => links.map((link) => new URL((link as HTMLLinkElement).href).pathname));
  expect(icones).toEqual(['/favicon.ico', '/favicon.svg']);
  for (const icone of icones) {
    const resposta = await request.get(icone);
    expect(resposta.ok(), icone).toBe(true);
    expect(resposta.headers()['content-type'], icone).toMatch(/^image\//);
  }
  const svg = await (await request.get('/favicon.svg')).text();
  expect(svg).toContain('<title>Grafite</title>');
});

test('o manifesto da PWA declara os ícones da marca, inclusive o maskable', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const endereco = (await page.locator('link[rel="manifest"]').getAttribute('href')) ?? '';
  expect(endereco).not.toBe('');
  const manifesto = (await (await request.get(endereco)).json()) as {
    name: string;
    icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
  };
  expect(manifesto.name).toBe('Grafite');
  expect(manifesto.icons.map((icone) => `${icone.sizes} ${icone.purpose ?? 'any'}`)).toEqual([
    '192x192 any',
    '512x512 any',
    '512x512 maskable',
  ]);
  for (const icone of manifesto.icons) {
    const resposta = await request.get(icone.src);
    expect(resposta.ok(), icone.src).toBe(true);
    expect(resposta.headers()['content-type'], icone.src).toBe('image/png');
  }
});

test('a casca mostra a marca na barra superior', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('banner').getByRole('img', { name: 'Grafite' })).toBeVisible();
});
