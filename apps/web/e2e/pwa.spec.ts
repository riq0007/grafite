import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Spec pwa, na web compilada: depois da primeira abertura, o service worker guarda a casca e a abre
// sem rede, e a API nunca vem do cache (design do F1c, decisões 6 e 10). A versão nova é testada no
// componente, porque aqui exigiria duas compilações.

// Só estas pontas a ponta liberam o service worker. Cada teste tem um contexto novo, e o service
// worker de um não serve a web velha a outro.
test.use({ serviceWorkers: 'allow' });

/** A primeira abertura: o service worker instala, guarda a web compilada e ativa. */
async function abrirPelaPrimeiraVez(pagina: Page) {
  const resposta = await pagina.goto('/');
  expect(resposta?.fromServiceWorker()).toBe(false);
  await pagina.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

const itemDeRede = (pagina: Page) => pagina.getByRole('banner').getByRole('status');

test('depois da primeira abertura, o service worker assume a página', async ({ page }) => {
  await abrirPelaPrimeiraVez(page);
  const resposta = await page.reload();
  expect(resposta?.fromServiceWorker()).toBe(true);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
});

test('sem rede, o endereço da seção Dock abre, com "Sem conexão com o servidor"', async ({
  page,
  context,
}) => {
  await abrirPelaPrimeiraVez(page);
  await context.setOffline(true);
  const resposta = await page.goto('/ajustes/dock');
  expect(resposta?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: 'Dock', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Seções dos Ajustes' })
      .getByRole('link', { name: 'Dock' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Dock' })).toBeVisible();
  await expect(itemDeRede(page)).toHaveText('Sem conexão com o servidor');
});

test('sem rede, o /api/health falha, e não vem do cache', async ({ page, context }) => {
  await abrirPelaPrimeiraVez(page);
  // Recarregada, a página é do service worker, e a conferência da saúde passa por ele, mas vai à
  // rede: a resposta que o app recebe não é dele.
  const saude = page.waitForResponse('**/api/health');
  await page.reload();
  expect((await saude).fromServiceWorker()).toBe(false);
  await expect(itemDeRede(page).getByRole('img', { name: 'Conectado ao servidor' })).toBeVisible();

  // Os endereços da API e do /health não caem na página guardada: o service worker não responde a
  // navegação para eles, com ou sem rede. Numa aba à parte, que não espera a chegada.
  const outraAba = await context.newPage();
  for (const endereco of ['/api/health', '/health']) {
    const resposta = await outraAba.goto(endereco);
    expect(resposta?.fromServiceWorker(), endereco).toBe(false);
  }
  await outraAba.close();

  await context.setOffline(true);
  await expect(itemDeRede(page)).toHaveText('Sem conexão com o servidor');
  // Daqui em diante vale a rede de verdade, sem as respostas simuladas da fixture.
  await context.unroute('**/api/health');
  await context.unroute('**/api/**');
  const conferencias = await page.evaluate(() =>
    Promise.all(
      ['/api/health', '/health'].map((endereco) =>
        fetch(endereco, { cache: 'no-store' }).then(
          (resposta) => `${endereco} respondeu ${resposta.status}`,
          () => `${endereco} falhou`,
        ),
      ),
    ),
  );
  expect(conferencias).toEqual(['/api/health falhou', '/health falhou']);
});
