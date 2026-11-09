import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Spec chegada, na web compilada: o carregamento só quando a chegada passa de 500 ms, as
// boas-vindas do primeiro acesso, a montagem da casca depois delas e a chegada com movimento
// reduzido.

/** O que a página viu da chegada, no relógio dela (ms desde o início da navegação). */
interface RegistroDaChegada {
  /** Os estados de `data-chegada`, na ordem, sem repetição. */
  estados: string[];
  /** As etapas escritas no carregamento, e o avanço da barra, em %, na ordem. */
  etapas: string[];
  avancos: string[];
  /** Quando o carregamento apareceu, se apareceu. */
  carregamentoApareceuEm?: number;
  /** Quando a chegada deixou de carregar: as boas-vindas ou a casca. */
  terminouEm?: number;
  /** Um quadro depois de a casca começar a se montar. */
  naMontagem?: { barra: string; dock: string; janela: { opacidade: number; escala: string } };
}

declare global {
  interface Window {
    __chegada?: RegistroDaChegada;
  }
}

/** Registra a chegada desde antes do index.html, em cada abertura da página. */
async function registrarAChegada(pagina: Page) {
  await pagina.addInitScript(() => {
    const registro: RegistroDaChegada = { estados: [], etapas: [], avancos: [] };
    window.__chegada = registro;
    const acrescentar = (lista: string[], valor: string | null | undefined) => {
      if (valor && lista.at(-1) !== valor) lista.push(valor);
    };
    const estilo = (parte: string) => {
      const elemento = document.querySelector(`[data-montagem="${parte}"]`);
      return elemento ? getComputedStyle(elemento) : undefined;
    };
    new MutationObserver(() => {
      const estado = document.documentElement.getAttribute('data-chegada');
      if (estado === 'montando' && registro.estados.at(-1) !== 'montando') {
        requestAnimationFrame(() => {
          registro.naMontagem = {
            barra: estilo('barra')?.transform ?? '',
            dock: estilo('dock')?.transform ?? '',
            janela: {
              opacidade: Number(estilo('janela')?.opacity),
              escala: estilo('janela')?.scale ?? '',
            },
          };
        });
      }
      acrescentar(registro.estados, estado);
      if (estado && estado !== 'carregando') registro.terminouEm ??= performance.now();
      const camada = document.getElementById('chegada');
      if (!camada) return;
      if (camada.hasAttribute('data-visivel')) {
        registro.carregamentoApareceuEm ??= performance.now();
      }
      acrescentar(registro.etapas, camada.querySelector('[role="status"]')?.textContent);
      acrescentar(
        registro.avancos,
        camada.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
      );
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

const registro = async (pagina: Page) =>
  (await pagina.evaluate(() => window.__chegada)) as RegistroDaChegada;

const boasVindas = (pagina: Page) => pagina.getByRole('dialog', { name: 'Bem-vindo ao Grafite' });

const chegadaPronta = (pagina: Page) =>
  expect(pagina.locator('html')).toHaveAttribute('data-chegada', 'pronta');

// Estas pontas a ponta acompanham a chegada desde o começo, sem a espera da fixture.
test.use({ esperarAChegada: false });

test.describe('primeiro acesso', () => {
  // Um navegador que nunca abriu o Grafite (design do F1c, decisão 10).
  test.use({ boasVindasVistas: false, reducedMotion: 'no-preference' });

  test('o "olá" é escrito à mão, e Esc leva à casca, que se monta', async ({ page }) => {
    await registrarAChegada(page);
    await page.goto('/');
    await expect(boasVindas(page)).toBeVisible();
    const ola = boasVindas(page).getByRole('img', { name: 'olá' });
    await expect(ola).toBeVisible();
    // O traço ainda está sendo escrito.
    const deslocamento = await ola
      .locator('path')
      .first()
      .evaluate((caminho) => getComputedStyle(caminho).strokeDashoffset);
    expect(deslocamento).not.toBe('0px');
    await expect(page.getByRole('button', { name: 'Pular' })).toBeFocused();
    // A casca espera por baixo, invisível e fora do alcance do teclado.
    await expect(page.getByRole('banner')).toBeHidden();

    // Esc no meio da escrita: a casca aparece na hora, sem esperar o fim do "olá".
    await page.keyboard.press('Escape');
    await expect(boasVindas(page)).toHaveCount(0, { timeout: 1_000 });
    await expect(page.getByRole('banner')).toBeVisible();
    await chegadaPronta(page);

    const { estados, naMontagem } = await registro(page);
    expect(estados).toEqual(['carregando', 'boas-vindas', 'montando', 'pronta']);
    // A barra desce, a janela aparece com uma escala leve, e o dock sobe.
    expect(naMontagem?.barra).not.toBe('none');
    expect(naMontagem?.dock).not.toBe('none');
    expect(naMontagem?.janela.opacidade).toBeLessThan(1);
  });

  test('no acesso seguinte, a casca abre direto, sem as boas-vindas nem a montagem', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(boasVindas(page)).toBeVisible();
    // Vistas quando aparecem: fechar a página no meio não as repete.
    await registrarAChegada(page);
    await page.reload();
    await chegadaPronta(page);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(boasVindas(page)).toHaveCount(0);
    expect((await registro(page)).estados).toEqual(['carregando', 'pronta']);
  });

  test('com movimento reduzido, o "olá" já nasce escrito, e a casca aparece sem deslocamentos', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await registrarAChegada(page);
    await page.goto('/');
    const letras = boasVindas(page).getByRole('img', { name: 'olá' }).locator('path').first();
    await expect(letras).toBeVisible();
    // O traço já está inteiro e preenchido desde o primeiro quadro, sem a escrita.
    const traco = await letras.evaluate((caminho) => {
      const estilo = getComputedStyle(caminho);
      return { deslocamento: estilo.strokeDashoffset, preenchimento: estilo.fill };
    });
    expect(traco.deslocamento).toBe('0px');
    expect(traco.preenchimento).not.toBe('rgba(0, 0, 0, 0)');

    await page.keyboard.press('Escape');
    await chegadaPronta(page);
    const { estados, naMontagem } = await registro(page);
    expect(estados).toEqual(['carregando', 'boas-vindas', 'montando', 'pronta']);
    // Nada desce nem sobe: a janela só aparece, por troca de opacidade.
    expect(naMontagem).toEqual({
      barra: 'none',
      dock: 'none',
      janela: { opacidade: expect.any(Number), escala: 'none' },
    });
    expect(naMontagem?.janela.opacidade).toBeLessThan(1);
  });
});

test.describe('carregamento', () => {
  test('aparece depois de 500 ms, com "Carregando o Grafite", quando o app demora a baixar', async ({
    page,
  }) => {
    await registrarAChegada(page);
    // O JavaScript principal só chega quando o teste libera.
    let liberar = () => {};
    const liberado = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    await page.route('**/assets/index-*.js', async (rota) => {
      await liberado;
      await rota.fallback();
    });
    await page.goto('/', { waitUntil: 'commit' });

    const carregamento = page.getByRole('progressbar', { name: 'Carregamento do Grafite' });
    await expect(carregamento).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Carregando o Grafite');
    await expect(carregamento).toHaveAttribute('aria-valuenow', '0');
    const { carregamentoApareceuEm } = await registro(page);
    expect(carregamentoApareceuEm).toBeGreaterThanOrEqual(500);

    liberar();
    await chegadaPronta(page);
    await expect(page.getByRole('banner')).toBeVisible();
    // A camada sai por troca de opacidade e deixa a página.
    await expect(page.locator('#chegada')).toHaveCount(0);
    const { etapas, avancos, estados } = await registro(page);
    expect(etapas).toEqual([
      'Carregando o Grafite',
      'Carregando suas preferências',
      'Validando sessão',
      'Conectando alertas',
      'Pronto',
    ]);
    expect(avancos).toEqual(['0', '20', '40', '60', '80', '100']);
    expect(estados).toEqual(['carregando', 'pronta']);
  });

  test('não aparece quando a chegada termina antes de 500 ms', async ({ page }) => {
    await registrarAChegada(page);
    await page.goto('/');
    await chegadaPronta(page);
    const { terminouEm = Number.POSITIVE_INFINITY, carregamentoApareceuEm } = await registro(page);
    test.skip(
      terminouEm >= 500,
      `A chegada levou ${Math.round(terminouEm)} ms: esta máquina não abre o app a tempo de provar.`,
    );
    expect(carregamentoApareceuEm).toBeUndefined();
  });
});
