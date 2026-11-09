import { expect, test } from './fixtures.ts';

test('as fontes carregam do próprio sistema, com toda a rede externa bloqueada', async ({
  page,
}) => {
  const externas: string[] = [];
  await page.route('**/*', (rota) => {
    const { hostname, href } = new URL(rota.request().url());
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      externas.push(href);
      return rota.abort();
    }
    // As locais seguem as outras rotas (o /api/health da fixture) antes da rede.
    return rota.fallback();
  });

  await page.goto('/');
  // Pede as duas famílias, use a página texto mono ou não: o navegador só baixa a fonte usada.
  await page.evaluate(() =>
    Promise.all([
      document.fonts.load('400 13px "Instrument Sans"'),
      document.fonts.load('400 13px "JetBrains Mono"'),
    ]),
  );
  const carregadas = await page.evaluate(() =>
    [...document.fonts]
      .filter((f) => f.status === 'loaded')
      .map((f) => f.family.replaceAll('"', '')),
  );

  expect(carregadas).toContain('Instrument Sans');
  expect(carregadas).toContain('JetBrains Mono');
  expect(externas).toEqual([]);
});
