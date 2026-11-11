import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Spec tela-inicial, "Largura dos blocos" (change opcoes-dos-blocos-do-inicio, design, decisão 4),
// com a web compilada: a grade só se confere aqui, pela posição de cada bloco na tela.

const SUPRIMENTOS = 'Suprimentos que acabam primeiro';
const BACKUPS = 'Backups do Control iD';

const item = (id: string, largura?: 'metade') => ({
  id,
  visivel: true,
  ...(largura && { largura }),
});

/** Os dois blocos dos módulos na metade, um depois do outro, e "O que resolver agora" no fim. */
const DOIS_DE_METADE = {
  inicio: {
    blocos: [
      item('ativos.suprimentos', 'metade'),
      item('gestao.backups', 'metade'),
      item('inicio.resolver'),
    ],
  },
};

/** O bloco de um módulo, pelo título dele. */
const bloco = (pagina: Page, titulo: string) =>
  pagina
    .locator('section')
    .filter({ has: pagina.getByRole('heading', { level: 2, name: titulo }) });
const resolver = (pagina: Page) =>
  pagina
    .locator('[data-largura]')
    .filter({ has: pagina.getByRole('heading', { level: 1, name: /O que resolver agora/ }) });

async function caixaDe(pagina: Page, titulo: string) {
  const caixa = await bloco(pagina, titulo).boundingBox();
  if (!caixa) throw new Error(`O bloco "${titulo}" não está na tela.`);
  return caixa;
}

test.describe('numa janela de 1.920 px', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('Dois blocos lado a lado: cada um com a metade da largura, e o bloco inteiro embaixo', async ({
    page,
    servidor,
  }) => {
    servidor.preferenciasDaConta = DOIS_DE_METADE;
    await page.goto('/');
    const suprimentos = await caixaDe(page, SUPRIMENTOS);
    const backups = await caixaDe(page, BACKUPS);
    expect(Math.abs(suprimentos.y - backups.y)).toBeLessThan(2);
    expect(backups.x).toBeGreaterThan(suprimentos.x + suprimentos.width);
    expect(Math.abs(suprimentos.width - backups.width)).toBeLessThan(2);
    const inteiro = await resolver(page).boundingBox();
    expect(inteiro?.y).toBeGreaterThan(suprimentos.y);
    expect(inteiro?.width).toBeGreaterThan(suprimentos.width * 2);
    expect(inteiro?.x).toBe(suprimentos.x);
  });

  test('o bloco de metade sem um par ocupa a metade esquerda', async ({ page, servidor }) => {
    servidor.preferenciasDaConta = {
      inicio: {
        blocos: [
          item('ativos.suprimentos', 'metade'),
          item('inicio.resolver'),
          item('gestao.backups', 'metade'),
        ],
      },
    };
    await page.goto('/');
    const suprimentos = await caixaDe(page, SUPRIMENTOS);
    const backups = await caixaDe(page, BACKUPS);
    const inteiro = await resolver(page).boundingBox();
    // Cada bloco de metade fica na coluna da esquerda, com o inteiro entre eles.
    expect(suprimentos.x).toBe(inteiro?.x);
    expect(backups.x).toBe(inteiro?.x);
    expect(suprimentos.width).toBeLessThan((inteiro?.width ?? 0) / 2);
    expect(inteiro?.y).toBeGreaterThan(suprimentos.y);
    expect(backups.y).toBeGreaterThan(inteiro?.y ?? 0);
  });

  test('a ordem do teclado segue a lista, da esquerda para a direita', async ({
    page,
    servidor,
  }) => {
    servidor.preferenciasDaConta = DOIS_DE_METADE;
    await page.goto('/');
    await page.getByRole('button', { name: 'Personalizar o Início' }).click();
    const subirOPrimeiro = page.getByRole('button', { name: `Subir ${SUPRIMENTOS}` });
    const subirOSegundo = page.getByRole('button', { name: `Subir ${BACKUPS}` });
    const ordem = await subirOPrimeiro.evaluate(
      (primeiro, segundo) =>
        segundo ? primeiro.compareDocumentPosition(segundo) & Node.DOCUMENT_POSITION_FOLLOWING : 0,
      await subirOSegundo.elementHandle(),
    );
    expect(ordem).toBeTruthy();
    // O "Subir" do primeiro bloco fica desabilitado: o Tab passa pelo "Descer" dele antes do segundo.
    await page.getByRole('button', { name: `Descer ${SUPRIMENTOS}` }).focus();
    let passos = 0;
    while (passos < 12 && !(await subirOSegundo.evaluate((el) => el === document.activeElement))) {
      await page.keyboard.press('Tab');
      passos += 1;
    }
    await expect(subirOSegundo).toBeFocused();
  });
});

test('numa área com menos de 1.200 px, os blocos de metade ficam um embaixo do outro', async ({
  page,
  servidor,
}) => {
  servidor.preferenciasDaConta = DOIS_DE_METADE;
  await page.setViewportSize({ width: 1180, height: 800 });
  await page.goto('/');
  const suprimentos = await caixaDe(page, SUPRIMENTOS);
  const backups = await caixaDe(page, BACKUPS);
  expect(backups.y).toBeGreaterThan(suprimentos.y + suprimentos.height - 1);
  expect(Math.abs(suprimentos.width - backups.width)).toBeLessThan(2);
  expect(backups.x).toBe(suprimentos.x);
});

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Metade no celular: cada bloco ocupa a largura inteira, um embaixo do outro', async ({
    page,
    servidor,
  }) => {
    servidor.preferenciasDaConta = DOIS_DE_METADE;
    await page.goto('/');
    const suprimentos = await caixaDe(page, SUPRIMENTOS);
    const backups = await caixaDe(page, BACKUPS);
    const inteiro = await resolver(page).boundingBox();
    expect(backups.y).toBeGreaterThan(suprimentos.y + suprimentos.height - 1);
    expect(suprimentos.width).toBe(inteiro?.width);
    expect(backups.width).toBe(inteiro?.width);
  });
});
