import type { Page } from '@playwright/test';
import { simularAdministracao } from './api-da-administracao.ts';
import { IDS_DOS_ATIVOS, simularAtivos } from './api-dos-ativos.ts';
import { escolherLocal } from './escolhas.ts';
import { abrirCartao } from './etapas.ts';
import { expect, test } from './fixtures.ts';

// Specs cadastro-de-ativos, ligacoes-de-ativos, arquivos-e-imagens e consulta-da-auditoria: a ficha
// completa do ativo, com a web compilada e a API simulada.

const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });
const tabela = (pagina: Page) => pagina.getByRole('grid', { name: 'Ativos', exact: true });
/** A linha do ativo na tabela, pelo texto dela, como o patrimônio. */
const linha = (pagina: Page, texto: string) =>
  tabela(pagina).getByRole('row').filter({ hasText: texto });
/** Um grupo de uma aba da ficha, como o "Ligado a", pelo título dele. */
const grupo = (pagina: Page, nome: string) => pagina.getByRole('region', { name: nome });

/**
 * Digita no campo com sugestões e escolhe uma delas, como o usuário, até o campo mostrar a
 * escolhida: só então ela vale no formulário. Com a máquina carregada, as sugestões da API podem
 * chegar no meio do clique, e o campo volta vazio; a escolha se repete.
 */
async function escolherSugestao(pagina: Page, campo: string, digitado: string, sugestao: string) {
  const entrada = pagina.getByRole('combobox', { name: campo });
  await expect(async () => {
    await entrada.fill(digitado);
    await pagina.getByRole('option', { name: sugestao, exact: true }).click({ timeout: 2_000 });
    await expect(entrada).toHaveValue(sugestao, { timeout: 1_000 });
  }).toPass();
}

const HP = `/ativos/${IDS_DOS_ATIVOS.daExpedicao}`;
const DO_RH = `/ativos/${IDS_DOS_ATIVOS.doRh}`;

test.describe('a ficha do ativo', () => {
  test('ligar pelo campo do tipo ativo leva o ativo ao lado de lá do escolhido', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await page.goto(DO_RH);
    await expect(titulo(page, /Impressora do RH/)).toBeVisible();
    await abrirCartao(page, 'Outros');
    await escolherSugestao(page, 'Substitui', 'laserjet', 'HP LaserJet M404 · PAT-00412');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(avisos(page).getByText('Ativo salvo.')).toBeVisible();
    expect(api.corposDe(`PATCH /api${DO_RH}`)).toEqual([
      { valores: { [IDS_DOS_ATIVOS.substitui]: IDS_DOS_ATIVOS.daExpedicao } },
    ]);

    await page.goto(`${HP}?aba=ligados`);
    await expect(page.getByRole('tab', { name: 'Ligados (1)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const substituida = grupo(page, 'Substituída por');
    await expect(substituida).toContainText('Impressora · PAT-00999 · Jundiaí › RH');
    await substituida.getByRole('link', { name: 'Impressora do RH' }).click();
    await expect(titulo(page, /Impressora do RH/)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${DO_RH}$`));
  });

  test('liga dois ativos pela ligação livre e desfaz a ligação, que sai das duas fichas', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await page.goto(`${HP}?aba=ligados`);
    await expect(page.getByText('Nenhum ativo ligado.')).toBeVisible();
    await page.getByRole('button', { name: 'Ligar a outro ativo' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Ligar a outro ativo' });
    await dialogo.getByRole('combobox', { name: 'Ativo' }).fill('rh');
    await page.getByRole('option', { name: 'Impressora do RH · PAT-00999', exact: true }).click();
    await dialogo.getByRole('button', { name: 'Ligar' }).click();
    await expect(avisos(page).getByText('Ativos ligados.')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Ligados (1)' })).toBeVisible();
    expect(api.corposDe(`POST /api${HP}/ligacoes`)).toEqual([{ outroId: IDS_DOS_ATIVOS.doRh }]);

    // A ligação aparece igual na ficha do outro, que a desfaz.
    await grupo(page, 'Ligado a').getByRole('link', { name: 'Impressora do RH' }).click();
    await expect(titulo(page, /Impressora do RH/)).toBeVisible();
    await page.getByRole('tab', { name: 'Ligados (1)' }).click();
    const doOutro = grupo(page, 'Ligado a');
    await expect(doOutro.getByRole('link', { name: 'HP LaserJet M404' })).toBeVisible();
    await doOutro.getByRole('button', { name: 'Desfazer a ligação com HP LaserJet M404' }).click();
    const confirmacao = page.getByRole('alertdialog', {
      name: 'Desfazer a ligação com HP LaserJet M404?',
    });
    await expect(confirmacao).toContainText(
      'A ligação sai das fichas dos dois ativos e fica no histórico.',
    );
    await confirmacao.getByRole('button', { name: 'Desfazer ligação' }).click();
    await expect(avisos(page).getByText('Ligação desfeita.')).toBeVisible();
    await expect(page.getByText('Nenhum ativo ligado.')).toBeVisible();
    expect(api.ligacoes).toEqual([]);
  });

  test('envia o PDF da nota fiscal na ficha e o baixa com o nome original', async ({ page }) => {
    const api = await simularAtivos(page);
    await page.goto(HP);
    await abrirCartao(page, 'Outros');
    const nota = page.getByRole('group', { name: 'PDF da nota fiscal' });
    await expect(nota).toContainText('Sem arquivo');
    await nota.locator('input[type="file"]').setInputFiles({
      name: 'nota-fiscal-1234.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n%%EOF\n'),
    });
    await expect(avisos(page).getByText('Arquivo enviado.')).toBeVisible();
    await expect(nota).toContainText('nota-fiscal-1234.pdf');
    const [envio] = api.parametrosDe(`PUT /api${HP}/campos/${IDS_DOS_ATIVOS.notaFiscal}/arquivo`);
    expect(envio?.get('nome')).toBe('nota-fiscal-1234.pdf');

    const baixado = page.waitForEvent('download');
    await nota.getByRole('link', { name: 'Baixar' }).click();
    expect((await baixado).suggestedFilename()).toBe('nota-fiscal-1234.pdf');
  });

  test('troca a imagem do ativo, que aparece na ficha, na tabela e na prévia', async ({ page }) => {
    const api = await simularAtivos(page);
    await page.goto(HP);
    await page
      .getByRole('group', { name: 'Imagem de HP LaserJet M404' })
      .locator('input[type="file"]')
      .setInputFiles({
        name: 'impressora.png',
        mimeType: 'image/png',
        buffer: Buffer.from('png'),
      });
    await expect(avisos(page).getByText('Imagem do ativo trocada.')).toBeVisible();
    const imagem = api.ativos.find((ativo) => ativo.id === IDS_DOS_ATIVOS.daExpedicao)?.imagem;
    const endereco = (lado: number) => `/api${HP}/imagem/${imagem?.id}/${lado}`;
    await expect(titulo(page, /HP LaserJet M404/).locator('img')).toHaveAttribute(
      'src',
      endereco(128),
    );

    await page.goto('/ativos');
    await expect(linha(page, 'PAT-00412').locator('img')).toHaveAttribute('src', endereco(64));
    await expect(linha(page, 'PAT-00999').locator('img')).toHaveCount(0);
    await linha(page, 'PAT-00412').focus();
    await page.keyboard.press('Space');
    const previa = page.getByRole('dialog', { name: 'Prévia: HP LaserJet M404' });
    await expect(previa.locator('img')).toHaveAttribute('src', endereco(512));
  });

  test('o histórico mostra o local mudado, a aba fica no endereço e "Ver na auditoria" filtra pelo ativo', async ({
    page,
  }) => {
    // A Administração antes, para a auditoria: os caminhos que os ativos não respondem vão a ela.
    await simularAdministracao(page);
    await simularAtivos(page);
    await page.goto(HP);
    await abrirCartao(page, 'Uso');
    await escolherLocal(page, 'Local', 'Jundiaí › RH');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(avisos(page).getByText('Ativo salvo.')).toBeVisible();

    // O cartão Uso, aberto para o local, segue no endereço junto da aba.
    await page.getByRole('tab', { name: 'Histórico' }).click();
    await expect(page).toHaveURL(new RegExp(`${HP}\\?aba=historico&grupo=uso$`));
    const historico = page.getByRole('list', { name: 'Histórico do ativo' });
    const registro = historico.getByRole('listitem').first();
    await expect(registro).toContainText('Ativo alterado');
    await expect(registro).toContainText('Ana Souza');
    await expect(registro).toContainText('Local: Jundiaí › Expedição → Jundiaí › RH');

    await page.reload();
    await expect(page.getByRole('tab', { name: 'Histórico' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(historico).toContainText('Local: Jundiaí › Expedição → Jundiaí › RH');

    await page.getByRole('link', { name: 'Ver na auditoria' }).click();
    await expect(titulo(page, 'Auditoria')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Filtros ativos' })).toContainText(
      'Registro · HP LaserJet M404',
    );
  });
});
