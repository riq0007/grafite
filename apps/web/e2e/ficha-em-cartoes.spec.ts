import type { Page } from '@playwright/test';
import { IDS_DOS_ATIVOS, simularAtivos } from './api-dos-ativos.ts';
import { escolherLocal } from './escolhas.ts';
import { abrirCartao, cartao, etapaAberta, listaDosCartoes } from './etapas.ts';
import { expect, test } from './fixtures.ts';

// Spec cadastro-de-ativos, "Aba Dados em cartões", e modulo-alertas, "Resumo no cartão" (change
// ficha-em-cartoes): os cartões da impressora, com o resumo de cada um, o salvar de dois cartões
// numa gravação só e o cartão no endereço, com a web compilada e a API simulada.

const HP = `/ativos/${IDS_DOS_ATIVOS.daExpedicao}`;
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });

/** O alerta aberto da impressora da expedição, como a lista dos alertas o traz. */
const ALERTA = {
  id: '0199d3a0-0000-7000-8000-0000000000e1',
  regra: { id: '0199d3a0-0000-7000-8000-0000000000d1', nome: 'Toner em 10% ou menos' },
  condicao: 'toner.nivel',
  severidade: 'critico',
  texto: 'Toner preto em 8%',
  situacao: 'aberto',
  alvo: {
    tipo: 'ativo',
    id: IDS_DOS_ATIVOS.daExpedicao,
    nome: 'HP LaserJet M404',
    patrimonio: 'PAT-00412',
    tipoDoAtivo: {
      id: '0199d3a0-0000-7000-8000-0000000000b1',
      nome: 'Impressora',
      icone: 'impressora',
    },
    imagem: null,
    modelo: null,
  },
  abertoEm: new Date(Date.now() - 32 * 60_000).toISOString(),
  resolvidoEm: null,
  comoTerminou: null,
  reconhecido: null,
  adiado: null,
  silencio: null,
  permite: { tratar: true },
};

/** A impressora com um alerta aberto, sem silêncio, que a conta vê: o bloco e o resumo dele. */
async function comUmAlertaAberto(pagina: Page) {
  await pagina.route(`**/api${HP}/silencio`, (rota) =>
    rota.request().method() === 'GET'
      ? rota.fulfill({ json: { silencio: null, permite: { ver: true, tratar: true } } })
      : rota.fallback(),
  );
  await pagina.route('**/api/alertas*', (rota) => {
    const endereco = new URL(rota.request().url());
    if (rota.request().method() !== 'GET' || endereco.pathname !== '/api/alertas') {
      return rota.fallback();
    }
    const doAtivo = endereco.searchParams.get('ativo') === IDS_DOS_ATIVOS.daExpedicao;
    return rota.fulfill({
      json: { itens: doAtivo ? [ALERTA] : [], total: doAtivo ? 1 : 0, proximo: null },
    });
  });
}

test.describe('a ficha em cartões', () => {
  test('mostra os cartões da impressora com o resumo de cada um, e o cartão aberto volta depois de recarregar', async ({
    page,
  }) => {
    await simularAtivos(page);
    await comUmAlertaAberto(page);
    await page.goto(HP);

    const cartoes = listaDosCartoes(page).getByRole('button');
    const ordem = ['Visão geral', 'Identificação', 'Uso', 'Rede', 'Outros', 'Administrativo'];
    await expect(cartoes).toHaveCount(ordem.length);
    for (const [posicao, nome] of ordem.entries()) {
      await expect(cartoes.nth(posicao)).toHaveAccessibleName(nome);
    }
    await expect(cartao(page, 'Visão geral')).toHaveAttribute('aria-current', 'true');
    await expect(etapaAberta(page, 'Visão geral')).toBeVisible();
    await expect(cartao(page, 'Visão geral')).toHaveAccessibleDescription('1 alerta aberto');
    await expect(cartao(page, 'Identificação')).toHaveAccessibleDescription('PAT-00412');
    await expect(cartao(page, 'Uso')).toHaveAccessibleDescription('Em uso · Jundiaí › Expedição');
    await expect(cartao(page, 'Rede')).toHaveAccessibleDescription('10.0.0.5');
    await expect(cartao(page, 'Outros')).toHaveAccessibleDescription('Nada preenchido');
    await expect(page.getByText('Nenhuma alteração')).toBeVisible();

    // A imagem fica ao lado do conteúdo de cada cartão, não só da Visão geral.
    const imagem = page.getByRole('group', { name: 'Imagem de HP LaserJet M404' });
    await expect(imagem).toBeVisible();
    await abrirCartao(page, 'Rede');
    await expect(imagem).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'IP' })).toHaveValue('10.0.0.5');
    await expect(page).toHaveURL(/[?&]grupo=organizacao(%3A|:)Rede$/);

    await page.reload();
    await expect(etapaAberta(page, 'Rede')).toBeVisible();
    await expect(cartao(page, 'Rede')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('textbox', { name: 'IP' })).toHaveValue('10.0.0.5');
  });

  test('salva o que mudou em dois cartões numa gravação só, com a contagem embaixo da lista', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await page.goto(HP);
    await abrirCartao(page, 'Identificação');
    await page.getByRole('textbox', { name: 'Hostname' }).fill('IMP-EXP-01');
    await expect(page.getByText('1 alteração não salva')).toBeVisible();

    await abrirCartao(page, 'Uso');
    await escolherLocal(page, 'Local', 'Jundiaí › RH');
    await expect(page.getByText('2 alterações não salvas')).toBeVisible();
    await expect(cartao(page, 'Uso')).toHaveAccessibleDescription('Em uso · Jundiaí › RH');

    // Trocar de cartão não descarta o que foi digitado.
    await abrirCartao(page, 'Identificação');
    await expect(page.getByRole('textbox', { name: 'Hostname' })).toHaveValue('IMP-EXP-01');

    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(avisos(page).getByText('Ativo salvo.')).toBeVisible();
    expect(api.corposDe(`PATCH /api${HP}`)).toEqual([
      { valores: { 'ativo.hostname': 'IMP-EXP-01', 'ativo.local': IDS_DOS_ATIVOS.rh } },
    ]);
    await expect(page.getByText('Nenhuma alteração')).toBeVisible();
  });
});
