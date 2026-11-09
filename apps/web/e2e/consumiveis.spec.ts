import type { Page } from '@playwright/test';
import { IDS_DO_CATALOGO } from './api-do-catalogo.ts';
import { IDS_DOS_ATIVOS, IDS_DOS_FORNECEDORES, simularAtivos } from './api-dos-ativos.ts';
import {
  COMPATIBILIDADE,
  type ConsumivelGuardado,
  simularConsumiveis,
} from './api-dos-consumiveis.ts';
import { abrirCartao } from './etapas.ts';
import { expect, test } from './fixtures.ts';

// Specs consumiveis, modulo-operacao e cadastro-de-ativos (change p4b-consumiveis): a lista e o
// cadastro dos consumíveis, com o fornecedor e o modelo, a recusa do código repetido, a
// inativação, e os compatíveis na ficha do modelo e no cartão da ficha da impressora, com a web
// compilada e a API simulada.

const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });
const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });

const consumivel = (
  id: string,
  codigo: string,
  extras: Partial<ConsumivelGuardado> = {},
): ConsumivelGuardado => ({
  id,
  codigo,
  nome: null,
  tipo: 'toner',
  cor: null,
  rendimento: null,
  situacao: 'ativo',
  fornecedores: [],
  modelos: [],
  ...extras,
});

/** O catálogo, os ativos e os fornecedores simulados, com os consumíveis por cima. */
async function simular(pagina: Page, iniciais: ConsumivelGuardado[] = []) {
  let consumiveis: Awaited<ReturnType<typeof simularConsumiveis>> | undefined;
  const ativos = await simularAtivos(pagina, {
    fornecedores: true,
    consumiveisDoModelo: (modeloId) => consumiveis?.compativeisDoModelo(modeloId) ?? [],
  });
  // A impressora liga os consumíveis compatíveis.
  for (const tipo of ativos.catalogo.tipos) {
    if (tipo.id === IDS_DO_CATALOGO.impressora) tipo.capacidades.push(COMPATIBILIDADE);
  }
  consumiveis = await simularConsumiveis(pagina, ativos, iniciais);
  return consumiveis;
}

/** Inclui um item pela busca de uma lista do consumível, escolhendo a opção sugerida. */
async function incluir(pagina: Page, rotulo: string, busca: string, opcao: string) {
  await pagina.getByRole('combobox', { name: rotulo }).fill(busca);
  await pagina.getByRole('option', { name: opcao }).click();
}

test.describe('os consumíveis', () => {
  test('o Operação lista, cadastra com o fornecedor e o modelo, recusa o código repetido e inativa', async ({
    page,
  }) => {
    const api = await simular(page, [consumivel('tn2370', 'TN-2370', { nome: 'Brother TN-2370' })]);
    await page.goto('/operacao');
    await page
      .getByRole('navigation', { name: 'Listas do Operação' })
      .getByRole('link', { name: /^Consumíveis/ })
      .click();
    await expect(page).toHaveURL(/\/operacao\/consumiveis$/);
    const tabela = page.getByRole('grid', { name: 'Consumíveis' });
    await expect(tabela.getByRole('row').nth(1)).toContainText('TN-2370');

    await page.getByRole('button', { name: 'Novo consumível' }).first().click();
    await expect(titulo(page, 'Novo consumível')).toBeVisible();
    await page.getByRole('textbox', { name: 'Código' }).fill('CF258A');
    await page.getByRole('button', { name: /Tipo/ }).click();
    await page.getByRole('option', { name: 'Toner' }).click();
    await page.getByRole('button', { name: /Cor/ }).click();
    await page.getByRole('option', { name: 'Preto' }).click();
    await page.getByRole('textbox', { name: 'Rendimento' }).fill('3.000');
    await incluir(page, 'Incluir um fornecedor', 'hp', 'HP Brasil');
    await incluir(page, 'Incluir um modelo', 'm404', 'HP LaserJet M404 · Impressora');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(avisos(page).getByText('Consumível cadastrado.')).toBeVisible();
    const cabecalho = titulo(page, /CF258A/);
    await expect(cabecalho).toContainText('Ativo');
    expect(api.corposDe('POST /api/consumiveis')).toEqual([
      {
        codigo: 'CF258A',
        nome: null,
        tipo: 'toner',
        cor: 'preto',
        rendimento: 3000,
        fornecedores: [IDS_DOS_FORNECEDORES.hpBrasil],
        modelos: [IDS_DO_CATALOGO.m404],
      },
    ]);
    await expect(page.getByRole('list', { name: 'Fornecedores do consumível' })).toContainText(
      'HP Brasil',
    );
    await expect(page.getByRole('list', { name: 'Modelos compatíveis' })).toContainText(
      'HP LaserJet M404',
    );

    await page.getByRole('button', { name: 'Inativar consumível' }).click();
    const confirmacao = page.getByRole('alertdialog', { name: 'Inativar o consumível CF258A?' });
    await expect(confirmacao).toContainText(
      'O consumível sai dos consumíveis compatíveis dos modelos e dos ativos.',
    );
    await confirmacao.getByRole('button', { name: 'Inativar consumível' }).click();
    await expect(avisos(page).getByText('Consumível inativado.')).toBeVisible();
    await expect(cabecalho).toContainText('Inativo');

    await page.goto('/operacao/consumiveis/novo');
    await page.getByRole('textbox', { name: 'Código' }).fill('tn 2370');
    await page.getByRole('button', { name: /Tipo/ }).click();
    await page.getByRole('option', { name: 'Toner' }).click();
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByText('Já existe um consumível com este código.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Código' })).toBeFocused();
  });

  test('a ficha do modelo mostra os compatíveis, e o cartão da impressora os resume', async ({
    page,
  }) => {
    await simular(page, [
      consumivel('cf258a', 'CF258A', {
        nome: 'HP 58A',
        cor: 'preto',
        rendimento: 3000,
        modelos: [IDS_DO_CATALOGO.m404],
      }),
      consumivel('cf258x', 'CF258X', { cor: 'preto', modelos: [IDS_DO_CATALOGO.m404] }),
      consumivel('cf232a', 'CF232A', { tipo: 'cilindro', modelos: [IDS_DO_CATALOGO.m404] }),
    ]);
    await page.goto(`/gestao/catalogo/modelos/${IDS_DO_CATALOGO.m404}`);
    const secao = page.getByRole('region', { name: 'Consumíveis compatíveis' });
    await expect(secao.getByRole('listitem')).toHaveCount(3);
    await expect(secao.getByRole('listitem').first()).toContainText('CF258A');
    await expect(secao).toContainText('3.000 páginas');

    await page.goto(`/ativos/${IDS_DOS_ATIVOS.daExpedicao}`);
    const cartao = page
      .getByRole('navigation', { name: 'Grupos da ficha' })
      .getByRole('button', { name: 'Consumíveis compatíveis' });
    await expect(cartao).toBeVisible();
    await expect(cartao).toContainText('CF258A · CF258X e mais 1');
    await abrirCartao(page, 'Consumíveis compatíveis');
    await expect(page.getByRole('list', { name: 'Consumíveis compatíveis' })).toContainText(
      'Toner · Preto',
    );
    // A administradora vê os consumíveis: o código leva à ficha do consumível.
    await page.getByRole('link', { name: 'CF232A' }).click();
    await expect(titulo(page, /CF232A/)).toBeVisible();
  });
});
