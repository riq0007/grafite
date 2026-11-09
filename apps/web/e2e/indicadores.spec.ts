import { randomUUID } from 'node:crypto';
import type { components } from '@grafite/api-client';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Spec indicadores, com a web compilada e a API dos indicadores simulada (change p3d-indicadores):
// o indicador fora da meta com a decisão, a meta mudada por quem administra os alertas, quem só vê
// sem "Mudar a meta" e a notificação do indicador fora da meta, que abre a tela no indicador.

type Indicadores = components['schemas']['IndicadoresDosAlertas'];
type Notificacao = components['schemas']['NotificacaoNaLista'];

const IMPRESSORA = '0199d3a0-0000-7000-8000-0000000000a1';
const DECISAO_DO_TONER =
  'Deixe toner de reserva nos locais que mais esperam, ou suba o limite da regra do toner para o alerta abrir antes.';

const semDado = {
  valor: null,
  anterior: null,
  base: 0,
  situacao: 'sem-dado' as const,
  itens: [],
  mais: 0,
};

/** A resposta dos indicadores, com a meta do toner dada. */
function indicadores(metaDoToner: number, mudarMeta: boolean): Indicadores {
  return {
    periodo: {
      inicio: new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString(),
      fim: new Date().toISOString(),
    },
    permite: { mudarMeta },
    indicadores: {
      toner: {
        meta: metaDoToner,
        metaDeFabrica: 2880,
        valor: 4608,
        anterior: 3312,
        base: 5,
        situacao: 4608 > metaDoToner ? 'fora' : 'dentro',
        itens: [
          {
            alerta: { id: randomUUID(), texto: 'Cyan Toner Cartridge em 7%' },
            alvo: { tipo: 'ativo', id: IMPRESSORA, nome: 'Impressora do RH', local: 'Jundiaí' },
            minutos: 3 * 24 * 60 + 600,
            esperando: true,
            reconhecidoPor: null,
          },
        ],
        mais: 0,
      },
      critico: { meta: 30, metaDeFabrica: 30, ...semDado },
      disponibilidade: { meta: 990, metaDeFabrica: 990, ...semDado },
      'que-voltam': {
        meta: 3,
        metaDeFabrica: 3,
        valor: 0,
        anterior: 0,
        base: 4,
        situacao: 'dentro',
        itens: [],
        mais: 0,
      },
    },
  };
}

/** A API dos indicadores: a leitura e a meta do toner, guardando o que a tela gravou. */
async function simularIndicadores(pagina: Page, { mudarMeta = true } = {}) {
  const estado = { metaDoToner: 2880, metasPedidas: [] as unknown[] };
  await pagina.route('**/api/alertas/indicadores', (rota) =>
    rota.fulfill({ json: indicadores(estado.metaDoToner, mudarMeta) }),
  );
  await pagina.route('**/api/alertas/indicadores/toner/meta', (rota) => {
    const { meta } = rota.request().postDataJSON() as { meta: number };
    estado.metasPedidas.push(meta);
    estado.metaDoToner = meta;
    return rota.fulfill({ json: { indicador: 'toner', meta, metaDeFabrica: 2880 } });
  });
  return estado;
}

const secaoDoToner = (pagina: Page) =>
  pagina.getByRole('region', { name: 'Tempo de atendimento do toner' });

test.describe('os indicadores', () => {
  test('o toner fora da meta diz o que fazer, e quem administra muda a meta', async ({ page }) => {
    const api = await simularIndicadores(page);
    await page.goto('/alertas/indicadores');
    await expect(page.getByRole('heading', { level: 1, name: 'Indicadores' })).toBeVisible();
    await expect(page.getByText('Últimos 30 dias, comparados com os 30 anteriores')).toBeVisible();
    const toner = secaoDoToner(page);
    await expect(toner.getByText('3,2 dias')).toBeVisible();
    await expect(toner.getByText('Meta: 2 dias')).toBeVisible();
    await expect(toner.getByText('Fora da meta')).toBeVisible();
    await expect(toner.getByText(DECISAO_DO_TONER, { exact: false })).toBeVisible();
    await expect(
      toner.getByRole('grid', { name: 'Toners acima da meta' }).getByRole('row').nth(1),
    ).toContainText('Esperando há 3,4 dias');

    await toner.getByRole('button', { name: 'Mudar a meta' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Meta do tempo de atendimento do toner' });
    await expect(dialogo.getByText('De fábrica: 2 dias.')).toBeVisible();
    await dialogo.getByRole('textbox', { name: /^Meta/ }).fill('5');
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('region', { name: /Avisos/ })).toContainText('Meta salva.');
    expect(api.metasPedidas).toEqual([5 * 24 * 60]);
    await expect(toner.getByText('Meta: 5 dias')).toBeVisible();
    await expect(toner.getByText('Dentro da meta')).toBeVisible();
  });

  test('quem só vê os alertas vê as metas, sem "Mudar a meta"', async ({ page }) => {
    await simularIndicadores(page, { mudarMeta: false });
    await page.goto('/alertas/indicadores');
    await expect(secaoDoToner(page).getByText('Meta: 2 dias')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mudar a meta' })).toHaveCount(0);
  });

  test('a notificação do indicador fora da meta abre a tela com o foco no indicador', async ({
    page,
  }) => {
    await simularIndicadores(page);
    const notificacao: Notificacao = {
      id: randomUUID(),
      severidade: 'atencao',
      titulo: 'Tempo de atendimento do toner fora da meta: 3,2 dias, com a meta de 2 dias',
      descricao: DECISAO_DO_TONER,
      origem: 'Alertas',
      destino: '/alertas/indicadores?foco=indicador-toner',
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
      .filter({ hasText: 'Tempo de atendimento do toner fora da meta' })
      .getByRole('button', { name: 'Abrir' })
      .click();
    await expect(page).toHaveURL(/\/alertas\/indicadores\?foco=indicador-toner$/);
    await expect(secaoDoToner(page)).toBeFocused();
  });
});
