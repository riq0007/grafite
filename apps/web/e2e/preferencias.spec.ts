import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Spec preferencias-da-interface: preferências gravadas na conta, com a cópia do navegador, e o
// dock certo desde a primeira pintura, com a web compilada.

interface HistoricoDaCasca {
  /** O data-dock do <html> quando o <body> nasceu (script anti-flash). */
  dockNoHtml: string | null;
  /** Cada posição do dock, desde que ele entrou na página. */
  posicoes: (string | null)[];
  /** Cada lugar da janela de conteúdo, desde que ela entrou na página. */
  lugaresDaJanela: string[];
}

declare global {
  interface Window {
    __historico?: HistoricoDaCasca;
  }
}

const dock = (pagina: Page) => pagina.getByRole('navigation', { name: 'Dock' });

/**
 * Escolhe a posição do dock na seção Dock dos Ajustes, clicando no rótulo, como o usuário, e espera
 * a mudança ser gravada na conta.
 */
async function porODock(pagina: Page, posicao: string) {
  await pagina.goto('/ajustes/dock');
  const gravada = pagina.waitForResponse('**/api/conta/preferencias');
  await pagina
    .getByRole('radiogroup', { name: 'Posição' })
    .locator('label')
    .filter({ hasText: posicao })
    .click();
  await gravada;
}

/** Registra, desde o primeiro nó da próxima página, onde o dock e a janela estiveram. */
function registrarACasca(pagina: Page) {
  return pagina.addInitScript(() => {
    const historico: HistoricoDaCasca = { dockNoHtml: null, posicoes: [], lugaresDaJanela: [] };
    window.__historico = historico;
    let bodyNasceu = false;
    new MutationObserver(() => {
      if (!bodyNasceu && document.body) {
        bodyNasceu = true;
        historico.dockNoHtml = document.documentElement.getAttribute('data-dock');
      }
      const posicao = document
        .querySelector('nav[aria-label="Dock"]')
        ?.getAttribute('data-posicao');
      if (posicao !== undefined && historico.posicoes.at(-1) !== posicao) {
        historico.posicoes.push(posicao);
      }
      const janela = document.querySelector('main')?.getBoundingClientRect();
      const lugar = janela && `${janela.left},${janela.top}`;
      if (lugar && historico.lugaresDaJanela.at(-1) !== lugar)
        historico.lugaresDaJanela.push(lugar);
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

test('o dock salvo à esquerda já nasce à esquerda, e a janela não muda de lugar', async ({
  page,
}) => {
  await porODock(page, 'À esquerda');
  await expect(dock(page)).toHaveAttribute('data-posicao', 'esquerda');

  await registrarACasca(page);
  await page.goto('/');
  await expect(dock(page)).toHaveAttribute('data-posicao', 'esquerda');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);

  const historico = await page.evaluate(() => window.__historico);
  expect(historico?.dockNoHtml).toBe('esquerda');
  expect(historico?.posicoes).toEqual(['esquerda']);
  expect(historico?.lugaresDaJanela).toHaveLength(1);
});

test('ao reabrir com o dock à direita, ele aparece à direita, sem a janela por baixo', async ({
  page,
}) => {
  await porODock(page, 'À direita');
  await page.goto('/');
  await expect(dock(page)).toHaveAttribute('data-posicao', 'direita');

  const caixaDoDock = await dock(page).boundingBox();
  const caixaDaJanela = await page.getByRole('main').boundingBox();
  const largura = page.viewportSize()?.width ?? 0;
  expect(caixaDoDock && caixaDaJanela).toBeTruthy();
  if (!caixaDoDock || !caixaDaJanela) return;
  expect(caixaDoDock.x + caixaDoDock.width).toBeGreaterThan(largura - 40);
  expect(caixaDaJanela.x + caixaDaJanela.width).toBeLessThanOrEqual(caixaDoDock.x);
});

test('a preferência mudada vai para a conta e volta ao reabrir, sem a cópia do navegador', async ({
  page,
  servidor,
}) => {
  await page.goto('/ajustes/aparencia');
  const gravacao = page.waitForRequest(
    (pedido) => pedido.method() === 'PATCH' && pedido.url().endsWith('/api/conta/preferencias'),
  );
  await page
    .getByRole('radiogroup', { name: 'Tema' })
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: 'Névoa', exact: true }) })
    .click();
  expect((await gravacao).postDataJSON()).toEqual({ mudancas: { aparencia: { tema: 'nevoa' } } });
  await expect.poll(() => servidor.preferenciasDaConta).toEqual({ aparencia: { tema: 'nevoa' } });

  // A reabertura sem a cópia do navegador: o tema vem da conta, com o estado da sessão.
  await page.addInitScript(() => {
    for (const chave of Object.keys(localStorage)) {
      if (chave.startsWith('grafite.preferencias')) localStorage.removeItem(chave);
    }
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nevoa');
  await expect(
    page
      .getByRole('radiogroup', { name: 'Tema' })
      .getByRole('radio', { name: 'Névoa', exact: true }),
  ).toBeChecked();
});

test('com o armazenamento bloqueado, a mudança vale e vai para a conta, sem mensagem de erro', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error') erros.push(mensagem.text());
  });
  // Navegação privada ou cookies bloqueados: qualquer acesso ao armazenamento falha.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Armazenamento bloqueado', 'SecurityError');
      },
    });
  });

  await porODock(page, 'À esquerda');
  await expect(dock(page)).toHaveAttribute('data-posicao', 'esquerda');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(erros).toEqual([]);

  // Sem a cópia, a reabertura traz a escolha da conta, com o estado da sessão.
  await page.reload();
  await expect(dock(page)).toHaveAttribute('data-posicao', 'esquerda');
  expect(erros).toEqual([]);
});
