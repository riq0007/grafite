import type { Page } from '@playwright/test';
import { simularImportacoes } from './api-das-importacoes.ts';
import { IDS_DOS_ATIVOS, simularAtivos } from './api-dos-ativos.ts';
import { expect, test } from './fixtures.ts';

// Spec importacao-de-ativos: a importação por planilha, com a web compilada e a API simulada, do
// envio ao resultado.

const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });

/** A seleção do campo de uma coluna do rascunho, pelo título da coluna. */
const colunaDe = (pagina: Page, titulo: string) =>
  pagina.getByRole('group', { name: 'Colunas' }).getByRole('button', { name: new RegExp(titulo) });

const PLANILHA = [
  'Patrimônio;IP;Setor',
  'PAT-00412;10.0.0.77;RH',
  'PAT-07001;10.0.7.1;RH',
  'PAT-07002;10.0.7;RH',
].join('\n');

test.describe('a importação por planilha', () => {
  test('do envio ao resultado: as colunas, a prévia com a trava e o erro, e a gravação', async ({
    page,
    servidor,
  }) => {
    const api = await simularAtivos(page);
    // O IP da HP da Expedição foi conferido à mão e travado: a planilha não o muda.
    const hp = api.ativos.find((ativo) => ativo.id === IDS_DOS_ATIVOS.daExpedicao);
    if (hp) {
      hp.estado[IDS_DOS_ATIVOS.ip] = {
        origem: 'manual',
        momento: '2026-10-09T17:32:00.000Z',
        autorId: null,
        trava: true,
      };
    }
    const simuladas = await simularImportacoes(page, api);

    await page.goto('/gestao/importacoes/nova');
    await expect(titulo(page, 'Importar planilha')).toBeVisible();
    await page.getByRole('button', { name: /Tipo dos ativos/ }).click();
    await page.getByRole('option', { name: 'Impressora' }).click();
    await page
      .getByRole('group', { name: 'Planilha' })
      .locator('input[type="file"]')
      .setInputFiles({
        name: 'impressoras.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(PLANILHA),
      });

    // O rascunho: o Patrimônio e o IP sugeridos pelo título, e o Setor em "Ignorar".
    await expect(titulo(page, 'impressoras.csv')).toBeVisible();
    await expect(colunaDe(page, 'Setor')).toContainText('Ignorar');
    await expect(colunaDe(page, 'IP')).toContainText('IP');
    await colunaDe(page, 'Setor').click();
    await page.getByRole('option', { name: 'Local' }).click();
    await expect(colunaDe(page, 'Setor')).toContainText('Local');

    // A prévia: a HP muda de local e fica com o IP travado, a nova entra, e o IP errado é recusado.
    await expect(page.getByText('3 linhas: 1 novo · 1 alterado · 1 com erro')).toBeVisible();
    const previa = page.getByRole('list', { name: 'Prévia da importação' });
    const daHp = previa.getByRole('listitem', { name: 'Linha 2' });
    await expect(daHp).toContainText('Alterar');
    await expect(daHp).toContainText('Local: Jundiaí › Expedição → Jundiaí › RH');
    await expect(daHp).toContainText('Travado: IP');
    await page.locator('label', { has: page.getByRole('radio', { name: /Com erro/ }) }).click();
    await expect(previa.getByRole('listitem', { name: /^Linha/ })).toHaveCount(1);
    await expect(previa).toContainText('IP: Use um IP, como 192.168.0.10.');

    // Importar: a confirmação diz o que vai ser gravado, e a tela mostra a fila.
    await page.getByRole('button', { name: 'Importar' }).click();
    const confirmacao = page.getByRole('alertdialog', { name: 'Importar impressoras.csv?' });
    await expect(confirmacao).toContainText('1 ativo novo e 1 ativo alterado.');
    await confirmacao.getByRole('button', { name: 'Importar' }).click();
    await expect(avisos(page).getByText('Importação na fila.')).toBeVisible();
    await expect(page.getByText('Na fila: a importação começa em instantes.')).toBeVisible();

    // A fila conclui e avisa: a tela mostra o resultado, sem recarregar.
    servidor.eventos.push({
      tipo: 'importacoes.mudaram',
      alvo: { tipo: 'importacao', id: simuladas.importacoes[0]?.id ?? '' },
    });
    await expect(page.getByText('1 novo · 1 alterado · 1 com erro')).toBeVisible();
    const erros = page.getByRole('list', { name: 'Linhas com erro' });
    await expect(erros.getByRole('listitem', { name: 'Linha 4' })).toContainText(
      'IP: Use um IP, como 192.168.0.10.',
    );

    // Os ativos: a HP no RH com o IP de antes, e a nova com a origem "planilha".
    expect(hp?.valores).toMatchObject({
      'ativo.local': IDS_DOS_ATIVOS.rh,
      [IDS_DOS_ATIVOS.ip]: '10.0.0.5',
    });
    const nova = api.ativos.find((ativo) => ativo.valores['ativo.patrimonio'] === 'PAT-07001');
    expect(nova?.estado['ativo.patrimonio']?.origem).toBe('planilha');

    // A lista das importações mostra a concluída, com os totais.
    await page.goto('/gestao/importacoes');
    const lista = page.getByRole('list', { name: 'Importações' });
    await expect(lista).toContainText('impressoras.csv');
    await expect(lista).toContainText('Concluída');
    await expect(lista).toContainText('1 novo · 1 alterado · 1 com erro');
  });
});
