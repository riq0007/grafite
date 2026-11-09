import type { Page } from '@playwright/test';
import { simularAtivos } from './api-dos-ativos.ts';
import { campoDeLocal, escolherLocal } from './escolhas.ts';
import { abrirEtapa } from './etapas.ts';
import { expect, test } from './fixtures.ts';

// Specs estrutura-da-casca ("Abas de cadastro na janela") e cadastro-de-ativos ("Cadastro pedido
// por um campo do ativo"), com a web compilada e a API simulada (change cadastro-em-abas).

const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });
const abas = (pagina: Page) => pagina.getByRole('tablist', { name: 'Abas da janela' });
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });

/**
 * Escolhe uma opção de uma seleção, como o usuário. O nome do botão termina pelo rótulo, depois da
 * opção escolhida, e só ele abre uma lista: a trava do campo tem o rótulo no nome também.
 */
async function selecionar(pagina: Page, rotulo: string, opcao: string) {
  await pagina
    .getByRole('button', { name: new RegExp(`${rotulo}$`) })
    .and(pagina.locator('[aria-haspopup="listbox"]'))
    .click();
  await pagina.getByRole('option', { name: opcao, exact: true }).click();
}

/**
 * Abre o cadastro de uma impressora, com o patrimônio já digitado, na etapa Uso, onde ficam o Local
 * e o Responsável.
 */
async function cadastroDaImpressora(pagina: Page) {
  await pagina.goto('/ativos/novo');
  await expect(titulo(pagina, 'Novo ativo')).toBeVisible();
  await selecionar(pagina, 'Tipo do ativo', 'Impressora');
  await abrirEtapa(pagina, 'Identificação');
  await pagina.getByRole('textbox', { name: 'Patrimônio' }).fill('PAT-00900');
  await abrirEtapa(pagina, 'Uso');
}

/** O patrimônio digitado continua no cadastro, na etapa Identificação. */
async function patrimonioContinua(pagina: Page) {
  await abrirEtapa(pagina, 'Identificação');
  await expect(pagina.getByRole('textbox', { name: 'Patrimônio' })).toHaveValue('PAT-00900');
}

test.describe('os cadastros que os campos abrem numa aba', () => {
  test('o Local abre o Novo local numa aba, que volta com o local escolhido e o que foi digitado', async ({
    page,
  }) => {
    await simularAtivos(page);
    await cadastroDaImpressora(page);

    await page.getByRole('button', { name: 'Cadastrar novo local' }).click();
    await expect(page.getByRole('tab', { name: 'Novo local' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(titulo(page, 'Novo local')).toBeFocused();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Sala 12');
    await selecionar(page, 'Tipo', 'Sala');
    await escolherLocal(page, 'Dentro de', 'Jundiaí › Expedição');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();

    await expect(abas(page)).toHaveCount(0);
    await expect(avisos(page).getByText('Local cadastrado.')).toBeVisible();
    await expect(campoDeLocal(page, 'Local', 'Jundiaí › Expedição › Sala 12')).toBeVisible();
    await patrimonioContinua(page);
  });

  test('o Responsável abre a Nova pessoa, que abre o Novo local, e cada uma volta à aba que a pediu', async ({
    page,
  }) => {
    await simularAtivos(page);
    await cadastroDaImpressora(page);

    await page.getByRole('button', { name: 'Cadastrar nova pessoa' }).click();
    await expect(titulo(page, 'Nova pessoa')).toBeFocused();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Ana Souza');
    await page.getByRole('button', { name: 'Cadastrar novo local' }).click();
    await expect(titulo(page, 'Novo local')).toBeFocused();
    await expect(abas(page).getByRole('tab')).toHaveText([
      'Novo ativo',
      'Nova pessoa',
      'Novo local',
    ]);
    await page.getByRole('textbox', { name: 'Nome' }).fill('Portaria');
    await selecionar(page, 'Tipo', 'Setor');
    await escolherLocal(page, 'Dentro de', 'Jundiaí');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();

    await expect(titulo(page, 'Nova pessoa')).toBeVisible();
    await expect(abas(page).getByRole('tab')).toHaveText(['Novo ativo', 'Nova pessoa']);
    await expect(campoDeLocal(page, 'Local de trabalho', 'Jundiaí › Portaria')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nome' })).toHaveValue('Ana Souza');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();

    await expect(abas(page)).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Responsável' })).toHaveValue('Ana Souza');
    await patrimonioContinua(page);
  });

  test('fechar uma aba com dados pergunta antes, e só fecha com a confirmação', async ({
    page,
  }) => {
    await simularAtivos(page);
    await cadastroDaImpressora(page);
    await page.getByRole('button', { name: 'Cadastrar novo local' }).click();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Sala 12');

    await page.getByRole('button', { name: 'Fechar Novo local' }).click();
    const confirmacao = page.getByRole('alertdialog', { name: 'Fechar sem salvar?' });
    await confirmacao.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(confirmacao).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Nome' })).toHaveValue('Sala 12');

    await page.getByRole('button', { name: 'Fechar Novo local' }).click();
    await confirmacao.getByRole('button', { name: 'Fechar' }).click();
    await expect(abas(page)).toHaveCount(0);
    await patrimonioContinua(page);
  });
});
