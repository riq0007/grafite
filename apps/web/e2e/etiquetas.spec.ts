import type { Page } from '@playwright/test';
import { IDS_DOS_ATIVOS, simularAtivos } from './api-dos-ativos.ts';
import { expect, test } from './fixtures.ts';

// Spec etiquetas-de-ativos: as etiquetas dos ativos, com a web compilada e a API simulada, da tabela
// e da ficha à impressão, com o diálogo do navegador simulado.

const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });
const tabela = (pagina: Page) => pagina.getByRole('grid', { name: 'Ativos', exact: true });
/** A linha do ativo na tabela, pelo texto dela, como o patrimônio. */
const linha = (pagina: Page, texto: string) =>
  tabela(pagina).getByRole('row').filter({ hasText: texto });
const previa = (pagina: Page) => pagina.getByRole('region', { name: 'Prévia das etiquetas' });
/** Uma posição de uma folha da prévia: de 1 a 21 na folha A4, e só a 1 na impressora. */
const posicao = (pagina: Page, folha: number, numero: number) =>
  previa(pagina)
    .getByRole('figure', { name: `Folha ${folha}` })
    .locator(`[data-posicao="${numero}"]`);
const comecarNa = (pagina: Page) =>
  pagina
    .getByRole('button', { name: /Começar na etiqueta$/ })
    .and(pagina.locator('[aria-haspopup="listbox"]'));

/** Troca o diálogo de impressão do navegador por uma contagem das vezes em que ele abriria. */
async function simularImpressao(pagina: Page) {
  await pagina.addInitScript(() => {
    const janela = window as Window & { impressoes?: number };
    janela.impressoes = 0;
    janela.print = () => {
      janela.impressoes = (janela.impressoes ?? 0) + 1;
    };
  });
  return () => pagina.evaluate(() => (window as Window & { impressoes?: number }).impressoes ?? 0);
}

/** O tamanho da página na impressão, pelo `@page` que a tela das etiquetas põe no head. */
const tamanhoDaPagina = (pagina: Page) =>
  pagina.evaluate(() =>
    [...document.head.querySelectorAll('style')]
      .map((estilo) => estilo.textContent ?? '')
      .find((texto) => texto.startsWith('@page')),
  );

test.describe('as etiquetas dos ativos', () => {
  test('seleciona duas linhas, começa numa etiqueta da folha, imprime e troca o formato', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    const impressoes = await simularImpressao(page);
    await page.goto('/ativos');
    // A escolha fora da ordem da tabela: as etiquetas saem na ordem dela.
    await linha(page, 'PAT-00999')
      .getByText('PAT-00999')
      .click({ modifiers: ['Control'] });
    await linha(page, 'PAT-00412')
      .getByText('PAT-00412')
      .click({ modifiers: ['Control'] });
    // A barra da seleção, no lugar dos filtros, imprime as etiquetas das linhas.
    const acoes = page.getByRole('toolbar', { name: 'Ações da seleção' });
    await expect(acoes.getByText('2 selecionados')).toBeVisible();
    await acoes.getByRole('button', { name: 'Imprimir etiquetas' }).click();

    await expect(titulo(page, 'Etiquetas')).toBeVisible();
    await expect(page.getByText('2 etiquetas')).toBeVisible();
    expect(api.parametrosDe('GET /api/ativos/etiquetas').map((busca) => busca.get('ids'))).toEqual([
      `${IDS_DOS_ATIVOS.daExpedicao},${IDS_DOS_ATIVOS.doRh}`,
    ]);
    await expect(page.getByText('21 etiquetas de 63,5 × 38,1 mm')).toBeVisible();
    await expect(previa(page).getByRole('figure')).toHaveCount(1);
    const primeira = posicao(page, 1, 1);
    await expect(primeira).toContainText('PAT-00412');
    await expect(primeira).toContainText('HP LaserJet M404');
    await expect(primeira).toContainText('Empresa de exemplo');
    await expect(
      primeira.getByRole('img', { name: 'QR code da ficha de PAT-00412' }),
    ).toBeVisible();
    await expect(primeira.locator('[data-etiqueta]')).toHaveAttribute(
      'data-endereco',
      new RegExp(`^http://[^/]+/ativos/${IDS_DOS_ATIVOS.daExpedicao}$`),
    );
    await expect(posicao(page, 1, 2)).toContainText('PAT-00999');
    expect(await tamanhoDaPagina(page)).toBe('@page { size: 210mm 297mm; margin: 0; }');

    // A folha já perdeu as 4 primeiras etiquetas.
    await comecarNa(page).click();
    await page.getByRole('option', { name: '5', exact: true }).click();
    await expect(page).toHaveURL(/[?&]inicio=5(&|$)/);
    for (const vazia of [1, 2, 3, 4]) await expect(posicao(page, 1, vazia)).toBeEmpty();
    await expect(posicao(page, 1, 5)).toContainText('PAT-00412');
    await expect(posicao(page, 1, 6)).toContainText('PAT-00999');
    await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
    expect(await impressoes()).toBe(1);

    // No papel, só a cópia das folhas, sem a casca.
    await page.emulateMedia({ media: 'print' });
    await expect(titulo(page, 'Etiquetas')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Dock' })).toBeHidden();
    await expect(previa(page)).toBeHidden();
    await expect(page.locator('[data-etiqueta]').filter({ visible: true })).toHaveCount(2);
    await page.emulateMedia({ media: 'screen' });

    // Na impressora, uma etiqueta por página, sem a posição na folha.
    await page
      .locator('label', { has: page.getByRole('radio', { name: 'Impressora de etiquetas' }) })
      .click();
    await expect(page).toHaveURL(/[?&]formato=impressora(&|$)/);
    expect(new URL(page.url()).searchParams.get('inicio')).toBeNull();
    await expect(page.getByText('uma etiqueta de 50 × 30 mm por página')).toBeVisible();
    await expect(comecarNa(page)).toHaveCount(0);
    await expect(previa(page).getByRole('figure')).toHaveCount(2);
    await expect(posicao(page, 1, 1)).toContainText('PAT-00412');
    await expect(posicao(page, 2, 1)).toContainText('PAT-00999');
    await expect.poll(() => tamanhoDaPagina(page)).toBe('@page { size: 50mm 30mm; margin: 0; }');
    await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
    expect(await impressoes()).toBe(2);
    // A tela das etiquetas só lê.
    expect(api.corposDe('POST /api/ativos')).toEqual([]);
  });

  test('a ficha e o menu de contexto abrem a etiqueta de um ativo, e o de fora fica de fora', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    const doRh = api.ativos.find((ativo) => ativo.id === IDS_DOS_ATIVOS.doRh);
    if (doRh) delete doRh.valores['ativo.patrimonio'];
    await page.goto(`/ativos/${IDS_DOS_ATIVOS.daExpedicao}`);
    await expect(titulo(page, /HP LaserJet M404/)).toBeVisible();
    await page.getByRole('button', { name: 'Imprimir etiqueta' }).click();
    await expect(titulo(page, 'Etiquetas')).toBeVisible();
    await expect(page.getByText('1 etiqueta', { exact: true })).toBeVisible();
    await expect(posicao(page, 1, 1)).toContainText('PAT-00412');

    await page.goto('/ativos');
    await linha(page, 'Impressora do RH').getByText('Impressora do RH').click({ button: 'right' });
    await page
      .getByRole('menu', { name: 'Ações das linhas' })
      .getByRole('menuitem', { name: 'Imprimir etiqueta' })
      .click();
    await expect(titulo(page, 'Etiquetas')).toBeVisible();
    await expect(posicao(page, 1, 1)).toContainText('Sem patrimônio');
    await expect(
      posicao(page, 1, 1).getByRole('img', { name: 'QR code da ficha de Impressora do RH' }),
    ).toBeVisible();

    // Um id que a conta não vê, ou que não existe, fica de fora, sem dizer qual.
    await page.goto(
      `/ativos/etiquetas?ids=${IDS_DOS_ATIVOS.daExpedicao},00000000-0000-4000-8000-000000009999`,
    );
    await expect(page.getByText('1 etiqueta', { exact: true })).toBeVisible();
    await expect(page.getByText('1 ativo fora do seu acesso ficou de fora.')).toBeVisible();
  });
});
