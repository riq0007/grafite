import type { Page } from '@playwright/test';
import { CODIGO_DO_APP, segredoDeExemplo, simularCofre } from './api-do-cofre.ts';
import { IDS_DOS_ATIVOS, simularAtivos } from './api-dos-ativos.ts';
import { expect, test } from './fixtures.ts';

// Specs cofre-de-segredos, modulo-cofre e cadastro-de-ativos, com a web compilada e a API do cofre
// simulada: o cadastro e o acesso, a liberação pelo código do app com o revelar e o copiar, a conta
// sem os dois passos e o segredo na ficha do ativo.

const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });
const secao = (pagina: Page, nome: string) => pagina.getByRole('region', { name: nome });

/** Escolhe uma opção de um campo com sugestões, até o campo mostrar a escolhida. */
async function escolherSugestao(pagina: Page, campo: string, digitado: string, sugestao: string) {
  const entrada = pagina.getByRole('combobox', { name: campo });
  await expect(async () => {
    await entrada.fill(digitado);
    await pagina.getByRole('option', { name: sugestao, exact: true }).click({ timeout: 2_000 });
    await expect(entrada).toHaveValue(sugestao, { timeout: 1_000 });
  }).toPass();
}

/** Escolhe uma opção de uma lista fechada, pelo rótulo do campo. */
async function escolher(pagina: Page, campo: string, opcao: string) {
  await pagina.getByRole('button', { name: new RegExp(campo) }).click();
  await pagina.getByRole('option', { name: opcao, exact: true }).click();
}

test.describe('o cofre', () => {
  test('cadastra um segredo e dá o acesso a um grupo', async ({ page }) => {
    const cofre = await simularCofre(page);
    await page.goto('/cofre');
    await expect(page.getByText('Nenhum segredo ainda.')).toBeVisible();
    await page.getByRole('button', { name: 'Novo segredo' }).first().click();
    await expect(titulo(page, 'Novo segredo')).toBeVisible();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Switch do CPD');
    await escolher(page, 'Tipo', 'Conta administrativa');
    await escolher(page, 'Classificação', 'Equipamento');
    await page.getByRole('textbox', { name: 'Identificador' }).fill('admin');
    const valor = page.getByLabel(/^Valor/);
    await valor.fill('S3nh@ do switch');
    await expect(valor).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();

    await expect(avisos(page).getByText('Segredo cadastrado.')).toBeVisible();
    await expect(titulo(page, /Switch do CPD/)).toBeVisible();
    await expect(page.getByText('S3nh@ do switch')).toHaveCount(0);
    const acesso = secao(page, 'Acesso');
    await expect(acesso.getByText('Ana Souza')).toBeVisible();
    await escolherSugestao(page, 'Incluir no acesso', 'sup', 'Grupo Suporte');
    await acesso.getByRole('button', { name: 'Incluir', exact: true }).click();
    await expect(avisos(page).getByText('Acesso salvo.')).toBeVisible();
    await expect(acesso.getByText('Suporte', { exact: true })).toBeVisible();
    expect(cofre.segredos[0]?.ficha.acesso?.map((titular) => titular.nome)).toEqual([
      'Ana Souza',
      'Suporte',
    ]);

    await page.goto('/cofre');
    await expect(page.getByRole('grid', { name: 'Segredos' })).toContainText('Switch do CPD');
  });

  test('libera o cofre com o código do app, revela e copia', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const switchDoCpd = segredoDeExemplo('Switch do CPD', 'S3nh@ do switch');
    const cofre = await simularCofre(page, { iniciais: [switchDoCpd] });
    await page.goto(`/cofre/${switchDoCpd.ficha.id}`);
    await expect(titulo(page, /Switch do CPD/)).toBeVisible();

    await page.getByRole('button', { name: 'Revelar' }).click();
    const pedido = page.getByRole('dialog', { name: 'Confirme o código do app' });
    await expect(pedido).toContainText(
      'Revelar e copiar ficam liberados por 5 minutos nesta sessão.',
    );
    await pedido.getByRole('textbox', { name: 'Código do app' }).fill(CODIGO_DO_APP);
    await pedido.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('S3nh@ do switch')).toBeVisible();
    await expect(page.getByText(/^Cofre liberado até \d\d:\d\d$/)).toBeVisible();

    await page.getByRole('button', { name: 'Ocultar' }).click();
    await expect(page.getByText('S3nh@ do switch')).toHaveCount(0);
    await page.getByRole('button', { name: 'Copiar' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    await expect(page.getByText('S3nh@ do switch')).toHaveCount(0);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('S3nh@ do switch');
    expect(cofre.pedidos).toEqual(['revelacao Switch do CPD', 'copia Switch do CPD']);
  });

  test('a conta sem os dois passos ouve o caminho até o cadastro', async ({ page }) => {
    await simularCofre(page, { semDoisPassos: true });
    await page.goto('/cofre');
    await expect(
      page.getByText('Cadastre a verificação em dois passos em Ajustes › Conta para usar o cofre.'),
    ).toBeVisible();
    await expect(page.getByRole('grid', { name: 'Segredos' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Abrir Ajustes › Conta' }).click();
    await expect(page).toHaveURL(/\/ajustes\/conta$/);
  });

  test('o segredo aparece na ficha do ativo e leva ao Cofre', async ({ page }) => {
    const switchDoCpd = segredoDeExemplo('Switch do CPD', 'S3nh@ do switch');
    const ativos = await simularAtivos(page);
    const impressora = ativos.ativos.find((ativo) => ativo.id === IDS_DOS_ATIVOS.daExpedicao);
    if (!impressora) throw new Error('A impressora da expedição não está na simulação.');
    impressora.segredos = [
      {
        id: switchDoCpd.ficha.id,
        nome: 'Switch do CPD',
        tipo: 'conta-administrativa',
        identificador: 'admin',
        situacao: 'ativo',
      },
    ];
    await simularCofre(page, { iniciais: [switchDoCpd] });
    await page.goto(`/ativos/${IDS_DOS_ATIVOS.daExpedicao}`);
    const segredos = secao(page, 'Segredos');
    await expect(segredos).toContainText('Conta administrativa · admin');
    await expect(segredos).not.toContainText('S3nh@');
    await segredos.getByRole('link', { name: 'Switch do CPD' }).click();
    await expect(titulo(page, /Switch do CPD/)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/cofre/${switchDoCpd.ficha.id}$`));
  });
});
