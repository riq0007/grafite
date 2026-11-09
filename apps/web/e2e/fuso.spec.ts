import type { Page } from '@playwright/test';
import { expect, semRolagemHorizontal, test } from './fixtures.ts';

// Spec estrutura-da-casca, "Datas e horas no fuso escolhido", e ajustes-do-sistema, "Seção Idioma
// e região", com a web compilada: o sistema no Horário de Brasília, às 14:32 de 24 de setembro.

test.use({ timezoneId: 'America/Sao_Paulo' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-24T14:32:00-03:00'));
});

const relogio = (pagina: Page) => pagina.getByRole('banner').locator('time');
const fuso = (pagina: Page) => pagina.getByRole('combobox', { name: 'Fuso horário' });

test('o fuso de Manaus escolhido nos Ajustes muda o relógio na hora e fica gravado', async ({
  page,
  servidor,
}) => {
  await page.goto('/ajustes/idioma-e-regiao');
  // De fábrica, a interface segue o sistema.
  await expect(fuso(page)).toHaveValue('Seguir o sistema (Horário de Brasília)');
  await expect(relogio(page)).toHaveText('qui 24 set 14:32');

  await fuso(page).fill('manaus');
  await page.getByRole('option', { name: 'Horário do Amazonas · Manaus (UTC−4)' }).click();
  await expect(relogio(page)).toHaveText('qui 24 set 13:32');
  await expect(page.getByText('Agora: qui 24 set 13:32')).toBeVisible();

  await expect.poll(() => servidor.preferenciasDaConta.regiao).toEqual({ fuso: 'America/Manaus' });
  await page.reload();
  await expect(relogio(page)).toHaveText('qui 24 set 13:32');
});

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a seção Idioma e região cabe na largura, também com a lista de fusos aberta', async ({
    page,
  }) => {
    await page.goto('/ajustes/idioma-e-regiao');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Idioma e região', exact: true }),
    ).toBeVisible();
    await semRolagemHorizontal(page);
    await fuso(page).fill('horário');
    const lista = page.getByRole('listbox');
    await expect(lista).toBeVisible();
    await semRolagemHorizontal(page);
    // A lista, sobreposta à página, também cabe na largura da tela.
    const caixa = await lista.boundingBox();
    expect(caixa?.x).toBeGreaterThanOrEqual(0);
    expect((caixa?.x ?? 0) + (caixa?.width ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(390);
  });
});
