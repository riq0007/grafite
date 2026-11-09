import type { Page } from '@playwright/test';
import { IDS_DOS_ATIVOS, simularAtivos } from './api-dos-ativos.ts';
import { abrirEtapa, etapa, etapaAberta } from './etapas.ts';
import { expect, test } from './fixtures.ts';

// Spec cadastro-de-ativos ("Cadastro do ativo em etapas" e "Rascunho do cadastro do ativo"), com a
// web compilada e a API simulada (change cadastro-em-etapas).

const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });

/**
 * Escolhe uma opção de uma seleção, como o usuário. O nome do botão termina pelo rótulo, depois da
 * opção escolhida, e só ele abre uma lista.
 */
async function selecionar(pagina: Page, rotulo: string, opcao: string) {
  await pagina
    .getByRole('button', { name: new RegExp(`${rotulo}$`) })
    .and(pagina.locator('[aria-haspopup="listbox"]'))
    .click();
  await pagina.getByRole('option', { name: opcao, exact: true }).click();
}

/** Começa o cadastro de uma impressora com o patrimônio e espera o rascunho guardado. */
async function comecarImpressora(pagina: Page) {
  await pagina.goto('/ativos/novo');
  await expect(titulo(pagina, 'Novo ativo')).toBeVisible();
  await selecionar(pagina, 'Tipo do ativo', 'Impressora');
  await abrirEtapa(pagina, 'Identificação');
  await pagina.getByRole('textbox', { name: 'Patrimônio' }).fill('PAT-00700');
  await expect(pagina.getByText('Rascunho guardado agora')).toBeVisible();
}

test.describe('o cadastro do ativo em etapas', () => {
  test('antes do tipo, só o Tipo abre; "Continuar" e "Voltar" andam, e o Enter num campo continua', async ({
    page,
  }) => {
    await simularAtivos(page);
    await page.goto('/ativos/novo');
    await expect(etapa(page, 'Tipo')).toContainText('Falta escolher');
    await expect(etapa(page, 'Modelo')).toContainText('Escolha o tipo antes');
    await expect(etapa(page, 'Modelo')).toHaveAttribute('aria-disabled', 'true');

    await selecionar(page, 'Tipo do ativo', 'Impressora');
    await expect(etapa(page, 'Rede')).toContainText('Falta: IP');
    await page.getByRole('button', { name: 'Continuar para Modelo' }).click();
    await expect(etapaAberta(page, 'Modelo')).toBeFocused();
    await expect(etapa(page, 'Modelo')).toHaveAttribute('aria-current', 'step');
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(etapaAberta(page, 'Tipo')).toBeFocused();

    await abrirEtapa(page, 'Identificação');
    await page.getByRole('textbox', { name: 'Patrimônio' }).fill('PAT-00700');
    await page.getByRole('textbox', { name: 'Patrimônio' }).press('Enter');
    await expect(etapaAberta(page, 'Uso')).toBeFocused();
    await expect(etapa(page, 'Identificação')).toContainText('Preenchida');
  });

  test('o rascunho volta depois de recarregar a página, na etapa em que estava', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await comecarImpressora(page);
    expect(api.rascunho()).toMatchObject({ valores: { 'ativo.patrimonio': 'PAT-00700' } });

    await page.reload();
    await expect(etapaAberta(page, 'Identificação')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Patrimônio' })).toHaveValue('PAT-00700');
    await expect(etapa(page, 'Tipo')).toContainText('Impressora');
    await expect(page.getByText(/^Rascunho guardado (agora|às \d\d:\d\d)$/)).toBeVisible();
  });

  test('"Descartar o rascunho" pede confirmação e recomeça o cadastro vazio, também depois de recarregar', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await comecarImpressora(page);
    await page.getByRole('button', { name: 'Descartar o rascunho' }).click();
    const confirmacao = page.getByRole('alertdialog', { name: 'Descartar o rascunho?' });
    await confirmacao.getByRole('button', { name: 'Descartar', exact: true }).click();
    await expect(etapa(page, 'Tipo')).toContainText('Falta escolher');
    expect(api.rascunho()).toBeNull();

    await page.reload();
    await expect(etapa(page, 'Tipo')).toContainText('Falta escolher');
    await expect(page.getByRole('button', { name: 'Descartar o rascunho' })).toHaveCount(0);
  });

  test('cadastrar o ativo apaga o rascunho, e o Novo ativo seguinte começa vazio', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await comecarImpressora(page);
    await abrirEtapa(page, 'Rede');
    await page.getByRole('textbox', { name: 'IP' }).fill('10.0.0.70');
    await abrirEtapa(page, 'Administrativo');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(titulo(page, /Impressora/)).toBeVisible();
    expect(api.corposDe('POST /api/ativos')).toEqual([
      expect.objectContaining({
        valores: expect.objectContaining({ [IDS_DOS_ATIVOS.ip]: '10.0.0.70' }),
      }),
    ]);
    expect(api.rascunho()).toBeNull();

    await page.goto('/ativos/novo');
    await expect(etapa(page, 'Tipo')).toContainText('Falta escolher');
  });
});
