// O navegador precisa de uma origem opaca e recursos HTTPS, além do teste HTTP da API.
import { expect, test } from '@playwright/test';
import { cssPelaPonte, htmlPelaPonte } from '../../api/src/paineis/conteudo.ts';

// O bloqueio do service worker do Playwright lê navigator.serviceWorker em todo quadro, e o quadro
// isolado, sem allow-same-origin, recusa a leitura com um erro: aqui não há o Grafite para bloquear.
test.use({ serviceWorkers: 'allow' });

test('página interna HTTP em HTTPS: CSS, dados e isolamento do Grafite', async ({ page }) => {
  const origem = 'https://grafite-paineis.test';
  const prefixo = '/api/paineis-conteudo/acesso-de-teste';
  const fonte = new URL('http://pagina.interna/pagina');
  const pedidos: string[] = [];
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  await page.route(`${origem}/**`, async (rota) => {
    const caminho = new URL(rota.request().url()).pathname;
    pedidos.push(caminho);
    if (caminho === '/') {
      await rota.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<html><body><h1>Grafite</h1><iframe title="Painel" sandbox="allow-scripts allow-forms allow-popups" src="${prefixo}/pagina"></iframe></body></html>`,
      });
      return;
    }
    const headers = {
      'access-control-allow-origin': '*',
      'content-security-policy':
        "sandbox allow-scripts allow-forms allow-popups; frame-ancestors 'self'; object-src 'none'; base-uri 'none'",
    };
    if (caminho === `${prefixo}/dados`) {
      await rota.fulfill({ headers, contentType: 'application/json', body: '{"total":42}' });
    } else if (caminho === `${prefixo}/estilo.css`) {
      await rota.fulfill({
        headers,
        contentType: 'text/css',
        body: cssPelaPonte('h2 { font-weight: 600 }', fonte, prefixo),
      });
    } else {
      await rota.fulfill({
        headers,
        contentType: 'text/html; charset=utf-8',
        body: htmlPelaPonte(
          `<html><head><link rel="stylesheet" href="/estilo.css"></head><body><h2>Página interna</h2><p id="dados"></p><p id="isolamento"></p><script>fetch('/dados').then(r=>r.json()).then(d=>document.getElementById('dados').textContent='Total: '+d.total);try{parent.document.body.dataset.invadido='sim'}catch{document.getElementById('isolamento').textContent='Isolado'}</script></body></html>`,
          fonte,
          prefixo,
        ),
      });
    }
  });
  await page.goto(origem);
  const quadro = page.frameLocator('iframe');
  await expect(quadro.getByRole('heading', { name: 'Página interna' })).toBeVisible();
  await expect(quadro.getByText('Total: 42', { exact: true })).toBeVisible();
  await expect(quadro.getByText('Isolado', { exact: true })).toBeVisible();
  await expect(quadro.locator('h2')).toHaveCSS('font-weight', '600');
  expect(pedidos).toContain(`${prefixo}/estilo.css`);
  expect(erros).toEqual([]);
  await expect(page.locator('body')).not.toHaveAttribute('data-invadido');
});
