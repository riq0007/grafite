import { randomUUID } from 'node:crypto';
import type { components } from '@grafite/api-client';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Spec indicadores-da-operacao, com a web compilada e a API dos indicadores da operação simulada
// (change p4f-indicadores-da-operacao): os três indicadores, com as listas e as situações, a meta
// das OS repetidas mudada por quem administra a operação e a notificação do indicador fora da meta,
// que abre a tela no indicador.

type Indicadores = components['schemas']['IndicadoresDaOperacao'];
type Notificacao = components['schemas']['NotificacaoNaLista'];

const DIA = 24 * 60;
const DECISAO_DAS_REPETIDAS =
  'Confira se o conserto resolveu a causa do problema, ou se o ativo deve ser substituído.';

const NB0031 = {
  id: '0199e3a0-0000-7000-8000-0000000000a1',
  nome: 'Dell Latitude 5420',
  patrimonio: 'NB-0031',
  local: 'Jundiaí › Financeiro',
};
const PAT00412 = {
  id: '0199e3a0-0000-7000-8000-0000000000a2',
  nome: 'HP LaserJet M404',
  patrimonio: 'PAT-00412',
  local: 'Jundiaí › Expedição',
};
const OS_12 = { id: '0199e3a0-0000-7000-8000-0000000000b1', numero: 12, problema: 'Não liga' };
const OS_20 = {
  id: '0199e3a0-0000-7000-8000-0000000000b2',
  numero: 20,
  problema: 'Não liga de novo',
};

/** A resposta dos indicadores da operação, com a meta das OS repetidas dada. */
function indicadores(metaDasRepetidas: number): Indicadores {
  const repetidas = metaDasRepetidas <= 2;
  return {
    periodo: {
      inicio: new Date(Date.now() - 30 * DIA * 60_000).toISOString(),
      fim: new Date().toISOString(),
    },
    permite: { mudarMeta: true },
    indicadores: {
      'resolucao-das-os': {
        meta: 3 * DIA,
        metaDeFabrica: 3 * DIA,
        valor: 2 * DIA,
        anterior: 4.5 * DIA,
        base: 3,
        situacao: 'dentro',
        itens: [
          {
            ordem: OS_20,
            ativo: NB0031,
            minutos: 5 * DIA,
            emAberto: true,
            esperaPelaPeca: 0,
            esperaPeloFornecedor: 0,
          },
          {
            ordem: OS_12,
            ativo: NB0031,
            minutos: 6 * DIA,
            emAberto: false,
            esperaPelaPeca: 0,
            esperaPeloFornecedor: 4 * DIA,
          },
        ],
        mais: 0,
      },
      'os-repetidas': {
        meta: metaDasRepetidas,
        metaDeFabrica: 2,
        valor: repetidas ? 1 : 0,
        anterior: 0,
        base: 34,
        situacao: repetidas ? 'fora' : 'dentro',
        itens: repetidas
          ? [
              {
                ativo: NB0031,
                quantas: 2,
                ordens: [OS_12, OS_20],
                ultimaEm: new Date(Date.now() - 5 * DIA * 60_000).toISOString(),
              },
            ]
          : [],
        mais: 0,
      },
      'paginas-por-toner': {
        meta: 800,
        metaDeFabrica: 800,
        valor: 1,
        anterior: null,
        base: 8,
        situacao: 'fora',
        itens: [
          {
            impressora: PAT00412,
            consumivel: { id: '0199e3a0-0000-7000-8000-0000000000c1', codigo: 'CF258A' },
            paginas: 1850,
            rendimento: 3000,
            porMil: 617,
            trocadoEm: new Date(Date.now() - 2 * DIA * 60_000).toISOString(),
          },
        ],
        mais: 0,
      },
    },
  };
}

/** A API dos indicadores da operação: a leitura e a meta das OS repetidas, com o que a tela gravou. */
async function simularIndicadores(pagina: Page) {
  const estado = { metaDasRepetidas: 2, metasPedidas: [] as unknown[] };
  await pagina.route('**/api/operacao/indicadores', (rota) =>
    rota.fulfill({ json: indicadores(estado.metaDasRepetidas) }),
  );
  await pagina.route('**/api/operacao/indicadores/os-repetidas/meta', (rota) => {
    const { meta } = rota.request().postDataJSON() as { meta: number };
    estado.metasPedidas.push(meta);
    estado.metaDasRepetidas = meta;
    return rota.fulfill({ json: { indicador: 'os-repetidas', meta, metaDeFabrica: 2 } });
  });
  return estado;
}

const secao = (pagina: Page, nome: string) => pagina.getByRole('region', { name: nome });

test.describe('os indicadores da operação', () => {
  test('mostra os três indicadores com as listas, e quem administra muda a meta das OS repetidas', async ({
    page,
  }) => {
    const api = await simularIndicadores(page);
    await page.goto('/operacao/indicadores');
    await expect(page.getByRole('heading', { level: 1, name: 'Indicadores' })).toBeVisible();
    await expect(page.getByText('Últimos 30 dias, comparados com os 30 anteriores')).toBeVisible();

    const resolucao = secao(page, 'Tempo de resolução das OS');
    await expect(resolucao.getByText('2 dias', { exact: true })).toBeVisible();
    await expect(resolucao.getByText('Antes: 4,5 dias')).toBeVisible();
    await expect(resolucao.getByText('Dentro da meta')).toBeVisible();
    const osAcimaDaMeta = resolucao
      .getByRole('grid', { name: 'OS acima da meta' })
      .getByRole('row');
    await expect(osAcimaDaMeta.nth(1)).toContainText('Aberta há 5 dias');
    await expect(osAcimaDaMeta.nth(2)).toContainText('4 dias esperando o fornecedor');

    const repetidas = secao(page, 'OS repetidas');
    await expect(repetidas.getByText('1 ativo', { exact: true })).toBeVisible();
    await expect(repetidas.getByText('Fora da meta')).toBeVisible();
    await expect(repetidas.getByText(DECISAO_DAS_REPETIDAS, { exact: false })).toBeVisible();
    await expect(
      repetidas.getByRole('grid', { name: 'Ativos com OS repetidas' }).getByRole('row').nth(1),
    ).toContainText('2 OS');

    const paginas = secao(page, 'Páginas por toner');
    await expect(paginas.getByText('1 toner', { exact: true })).toBeVisible();
    await expect(
      paginas.getByRole('grid', { name: 'Toners abaixo da meta' }).getByRole('row').nth(1),
    ).toContainText('1.850 de 3.000 páginas (61,7%)');

    await repetidas.getByRole('button', { name: 'Mudar a meta' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Meta das OS repetidas' });
    await expect(dialogo.getByText('De fábrica: 2 OS.')).toBeVisible();
    await dialogo.getByRole('textbox', { name: /^Meta/ }).fill('3');
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('region', { name: /Avisos/ })).toContainText('Meta salva.');
    expect(api.metasPedidas).toEqual([3]);
    await expect(repetidas.getByText('Meta: 3 OS')).toBeVisible();
    await expect(repetidas.getByText('Nenhum ativo com 3 OS nos últimos 30 dias.')).toBeVisible();
    await expect(repetidas.getByText('Dentro da meta')).toBeVisible();
  });

  test('a notificação das OS repetidas fora da meta abre a tela com o foco no indicador', async ({
    page,
  }) => {
    await simularIndicadores(page);
    const notificacao: Notificacao = {
      id: randomUUID(),
      severidade: 'atencao',
      titulo: 'OS repetidas fora da meta: 1 ativo com 2 OS ou mais',
      descricao: DECISAO_DAS_REPETIDAS,
      origem: 'Operação',
      destino: '/operacao/indicadores?foco=indicador-os-repetidas',
      criadaEm: new Date().toISOString(),
      lida: false,
      alerta: null,
    };
    await page.route('**/api/notificacoes**', (rota) => {
      const pedido = rota.request();
      const { pathname } = new URL(pedido.url());
      if (pedido.method() === 'GET' && pathname === '/api/notificacoes') {
        return rota.fulfill({
          json: { itens: [notificacao], naoLidas: notificacao.lida ? 0 : 1, proximo: null },
        });
      }
      if (
        pedido.method() === 'POST' &&
        pathname === `/api/notificacoes/${notificacao.id}/leitura`
      ) {
        notificacao.lida = true;
        return rota.fulfill({ status: 204 });
      }
      return rota.fallback();
    });
    await page.goto('/');
    await page
      .getByRole('banner')
      .getByRole('button', { name: /^Notificações/ })
      .click();
    const central = page.getByRole('dialog', { name: 'Notificações' });
    await central
      .getByRole('listitem')
      .filter({ hasText: 'OS repetidas fora da meta' })
      .getByRole('button', { name: 'Abrir' })
      .click();
    await expect(page).toHaveURL(/\/operacao\/indicadores\?foco=indicador-os-repetidas$/);
    await expect(secao(page, 'OS repetidas')).toBeFocused();
  });
});
