import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Spec ajustes-do-sistema, "App Ajustes com seções", com a web compilada.

const titulo = (pagina: Page, nome: string) =>
  pagina.getByRole('heading', { level: 1, name: nome, exact: true });
const secoes = (pagina: Page) => pagina.getByRole('navigation', { name: 'Seções dos Ajustes' });

test('o endereço da seção Dock abre Ajustes com a seção Dock escolhida na lista', async ({
  page,
}) => {
  await page.goto('/ajustes/dock');
  await expect(titulo(page, 'Dock')).toBeVisible();
  await expect(secoes(page).getByRole('link', { name: 'Dock' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('escolher "Dock" no menu de Ajustes do dock abre a seção Dock', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Dock' })
    .getByRole('button', { name: 'Ajustes' })
    .hover();
  const menu = page.getByRole('menu', { name: 'Ajustes' });
  await menu.getByRole('menuitem', { name: 'Dock' }).click();
  await expect(page).toHaveURL(/\/ajustes\/dock$/);
  await expect(titulo(page, 'Dock')).toBeFocused();
});

test('o tamanho em 36 px muda o dock na hora e mostra "36 px"', async ({ page }) => {
  await page.goto('/ajustes/dock');
  await page.getByRole('slider', { name: 'Tamanho' }).focus();
  await page.keyboard.press('Home');
  for (let passo = 0; passo < 8; passo++) await page.keyboard.press('ArrowRight');
  await expect(page.getByText('36 px', { exact: true })).toBeVisible();
  const item = page
    .getByRole('navigation', { name: 'Dock' })
    .getByRole('button', { name: 'Início' });
  await expect.poll(async () => (await item.boundingBox())?.width).toBe(36);
});

// Spec ajustes-do-sistema, "Seção Dock": os módulos do dock (change dock-personalizavel). No
// navegador, o botão que fica desabilitado e a linha que muda de lugar perdem o foco, e a seção o
// devolve: só aqui isso se confere, porque o DOM dos testes unitários não tira o foco de ninguém.
test('a ordem do dock muda pelos Ajustes, o foco acompanha o módulo, e o tirado vai para o Mais', async ({
  page,
  servidor,
}) => {
  await page.goto('/ajustes/dock');
  await expect(titulo(page, 'Dock')).toBeVisible();
  const dock = page.getByRole('navigation', { name: 'Dock' });
  const noDock = () =>
    dock
      .getByRole('button')
      .evaluateAll((itens) => itens.map((item) => item.getAttribute('aria-label')));
  const botao = (nome: string) => page.getByRole('button', { name: nome, exact: true });
  expect((await noDock()).slice(0, 2)).toEqual(['Início', 'Ativos']);

  // Primeiro da lista: o dock muda na hora, o Subir fica desabilitado, e o foco vai ao Descer.
  await botao('Subir Ativos').focus();
  await page.keyboard.press('Enter');
  await expect(botao('Subir Ativos')).toBeDisabled();
  await expect(botao('Descer Ativos')).toBeFocused();
  expect((await noDock()).slice(0, 2)).toEqual(['Ativos', 'Início']);
  await page.keyboard.press('Enter');
  await expect(botao('Descer Ativos')).toBeFocused();
  expect((await noDock()).slice(0, 2)).toEqual(['Início', 'Ativos']);

  // No meio da lista, a linha muda de lugar, e o foco continua no mesmo botão.
  await botao('Subir Operação').focus();
  await page.keyboard.press('Enter');
  await expect(botao('Subir Operação')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(botao('Subir Operação')).toBeFocused();
  expect((await noDock()).slice(0, 4)).toEqual([
    'Início',
    'Ativos',
    'Operação',
    'Gestão de ativos',
  ]);

  // Tirar do dock: o módulo vai para o Mais, antes de Ajustes, e o foco vai ao botão que desfaz.
  await botao('Tirar Salas do dock').focus();
  await page.keyboard.press('Enter');
  await expect(botao('Pôr Salas no dock')).toBeFocused();
  await expect(dock.getByRole('button', { name: 'Salas', exact: true })).toHaveCount(0);
  expect((await noDock()).slice(-2)).toEqual(['Mais', 'Ajustes']);
  await dock.getByRole('button', { name: 'Mais', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Mais', exact: true });
  await expect(menu.getByRole('menuitem', { name: 'Salas' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // A lista inteira vai gravada na conta, com o módulo tirado.
  await expect
    .poll(() => servidor.preferenciasDaConta.dock?.modulos?.find(({ id }) => id === 'salas'))
    .toEqual({ id: 'salas', visivel: false });

  // Pôr de volta: o módulo volta ao fim do dock, o Mais some, e o foco vai ao "Tirar do dock".
  await botao('Pôr Salas no dock').focus();
  await page.keyboard.press('Enter');
  await expect(botao('Tirar Salas do dock')).toBeFocused();
  await expect(dock.getByRole('button', { name: 'Mais', exact: true })).toHaveCount(0);
  expect((await noDock()).slice(-2)).toEqual(['Salas', 'Ajustes']);
});

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Ajustes mostra primeiro a lista, e a seção aparece sozinha, com Voltar', async ({
    page,
  }) => {
    await page.goto('/ajustes');
    await expect(titulo(page, 'Ajustes do Sistema')).toBeVisible();
    await expect(secoes(page).getByRole('link')).toHaveText([
      'Conta',
      'Aparência',
      'Dock',
      'Cursor',
      'Notificações',
      'Tabelas',
      'Idioma e região',
      'Acessibilidade',
    ]);

    await secoes(page).getByRole('link', { name: 'Dock' }).tap();
    await expect(titulo(page, 'Dock')).toBeVisible();
    await expect(secoes(page)).toHaveCount(0);

    await page.getByRole('link', { name: 'Voltar' }).tap();
    await expect(titulo(page, 'Ajustes do Sistema')).toBeVisible();
  });
});
