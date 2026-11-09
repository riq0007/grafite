import type { Page } from '@playwright/test';
import { IDS_DOS_ATIVOS, IDS_DOS_FORNECEDORES, simularAtivos } from './api-dos-ativos.ts';
import { abrirCartao } from './etapas.ts';
import { expect, test } from './fixtures.ts';

// Specs fornecedores, modulo-administracao ("Tela de fornecedores") e cadastro-de-ativos (change
// p4a-fornecedores): a seção Fornecedores, o fornecedor escolhido no ativo, a tabela pela origem e
// o Novo fornecedor pedido pelo campo, com a web compilada e a API simulada.

const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });
const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });
const HP = `/ativos/${IDS_DOS_ATIVOS.daExpedicao}`;

test.describe('os fornecedores', () => {
  test('a seção cadastra o fornecedor, recusa o CNPJ errado no campo e o inativa com confirmação', async ({
    page,
  }) => {
    await simularAtivos(page, { fornecedores: true });
    await page.goto('/administracao/fornecedores');
    const tabela = page.getByRole('grid', { name: 'Fornecedores' });
    await expect(tabela.getByRole('row').nth(1)).toContainText('HP Brasil');
    await expect(tabela).toContainText('12.345.678/0001-95');
    await expect(tabela).not.toContainText('Locadora Norte');

    await page.getByRole('button', { name: 'Novo fornecedor' }).first().click();
    await expect(titulo(page, 'Novo fornecedor')).toBeVisible();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Locadora Sul');
    await page.getByRole('textbox', { name: 'CNPJ' }).fill('12.345.678/0001-96');
    await page.getByRole('button', { name: 'Cadastrar' }).click();
    await expect(page.getByText('CNPJ inválido: confira os 14 caracteres.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'CNPJ' })).toBeFocused();

    await page.getByRole('textbox', { name: 'CNPJ' }).fill('11.222.333/0001-81');
    await page.getByRole('button', { name: 'Cadastrar' }).click();
    await expect(avisos(page).getByText('Fornecedor cadastrado.')).toBeVisible();
    const cabecalho = titulo(page, /Locadora Sul/);
    await expect(cabecalho).toContainText('Ativo');

    await page.getByRole('button', { name: 'Inativar fornecedor' }).click();
    const confirmacao = page.getByRole('alertdialog', {
      name: 'Inativar o fornecedor Locadora Sul?',
    });
    await expect(confirmacao).toContainText(
      'O fornecedor continua nos registros que já apontam para ele, mas não pode mais ser escolhido.',
    );
    await confirmacao.getByRole('button', { name: 'Inativar fornecedor' }).click();
    await expect(avisos(page).getByText('Fornecedor inativado.')).toBeVisible();
    await expect(cabecalho).toContainText('Inativo');
  });

  test('o ativo escolhe o fornecedor no cartão Administrativo, e a ficha dele abre a tabela pela origem', async ({
    page,
  }) => {
    const api = await simularAtivos(page, { fornecedores: true });
    await page.goto(HP);
    await abrirCartao(page, 'Administrativo');
    const fornecedor = page.getByRole('combobox', { name: 'Fornecedor' });
    await fornecedor.fill('12.345');
    await page.getByRole('option', { name: 'HP Brasil', exact: true }).click();
    await expect(fornecedor).toHaveValue('HP Brasil');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(avisos(page).getByText('Ativo salvo.')).toBeVisible();
    expect(api.corposDe(`PATCH /api${HP}`)).toEqual([
      { valores: { 'ativo.fornecedor': IDS_DOS_FORNECEDORES.hpBrasil } },
    ]);

    await page.goto(`/administracao/fornecedores/${IDS_DOS_FORNECEDORES.hpBrasil}`);
    await expect(page.getByText('Ativos deste fornecedor: 1')).toBeVisible();
    await page.getByRole('link', { name: 'Ver na tabela' }).click();
    const faixa = page.getByRole('group', { name: 'Origem da tabela' });
    await expect(faixa).toContainText('Ativos do fornecedor HP Brasil');
    const linhas = page.getByRole('grid', { name: 'Ativos', exact: true }).getByRole('row');
    await expect(linhas).toHaveCount(2);
    await expect(linhas.nth(1)).toContainText('PAT-00412');
  });

  test('o Novo fornecedor pedido pelo campo do ativo abre numa aba e volta escolhido', async ({
    page,
  }) => {
    const api = await simularAtivos(page, { fornecedores: true });
    await page.goto(HP);
    await abrirCartao(page, 'Administrativo');
    await page.getByRole('button', { name: 'Cadastrar novo fornecedor' }).click();
    await expect(titulo(page, 'Novo fornecedor')).toBeVisible();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Assistência Rápida');
    await page.getByRole('button', { name: 'Cadastrar' }).click();

    await expect(page.getByRole('combobox', { name: 'Fornecedor' })).toHaveValue(
      'Assistência Rápida',
    );
    await expect(
      page.getByRole('navigation', { name: 'Grupos da ficha' }).getByRole('button', {
        name: 'Administrativo',
      }),
    ).toHaveAccessibleDescription('Assistência Rápida');
    expect(api.fornecedores.map((fornecedor) => fornecedor.nome)).toContain('Assistência Rápida');
  });
});
