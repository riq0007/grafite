import type { Page } from '@playwright/test';
import { type OrdemSemeada, simularOrdens } from './api-das-ordens.ts';
import { simularSolicitacoes } from './api-das-solicitacoes.ts';
import { simularEstoque } from './api-do-estoque.ts';
import { IDS_DOS_ATIVOS, simularAtivos } from './api-dos-ativos.ts';
import { type ConsumivelGuardado, simularConsumiveis } from './api-dos-consumiveis.ts';
import { expect, test } from './fixtures.ts';

// Specs ordens-de-servico, modulo-operacao, solicitacoes e cadastro-de-ativos (change
// p4e-ordens-de-servico): a OS aberta pela ficha do ativo, a espera pelo fornecedor, a peça do
// estoque e a resolução, até a ficha; "Abrir OS" na solicitação de conserto, a OS na ficha e na
// lista da solicitação e a solicitação concluída com a OS; a lista com o filtro, a busca e o
// encerramento em lote, com a web compilada e a API simulada.

const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });
const gaveta = (pagina: Page, titulo: string) => pagina.getByRole('dialog', { name: titulo });
const linhaNaTabela = (pagina: Page, tabela: string, numero: number) =>
  pagina
    .getByRole('grid', { name: tabela })
    .getByRole('row')
    .filter({ has: pagina.getByRole('rowheader', { name: String(numero), exact: true }) });
const linhaDa = (pagina: Page, numero: number) =>
  linhaNaTabela(pagina, 'Ordens de serviço', numero);
const linhasDasOrdens = (pagina: Page) =>
  pagina.getByRole('grid', { name: 'Ordens de serviço' }).getByRole('row');

/** O rolete de alimentação, uma Peça, com 3 na Expedição. */
const ROLETE: ConsumivelGuardado = {
  id: '0199e2a0-0000-7000-8000-000000000a02',
  codigo: 'RL1-2412',
  nome: 'Rolete de alimentação',
  tipo: 'peca',
  cor: null,
  rendimento: null,
  situacao: 'ativo',
  fornecedores: [],
  modelos: [],
};

const CONSERTO_DO_RH = {
  tipo: 'conserto',
  pessoa: IDS_DOS_ATIVOS.marina,
  ativo: IDS_DOS_ATIVOS.doRh,
  defeito: 'Atolando papel',
};

/** O catálogo, os ativos, os consumíveis, o estoque e as solicitações simulados, com as OS por cima. */
async function simular(
  pagina: Page,
  {
    solicitacoes: semeadas = [],
    ordens = [],
  }: { solicitacoes?: Record<string, unknown>[]; ordens?: OrdemSemeada[] } = {},
) {
  const ativos = await simularAtivos(pagina, { fornecedores: true });
  const consumiveis = await simularConsumiveis(pagina, ativos, [ROLETE]);
  const deps = {
    catalogo: ativos.catalogo,
    fornecedores: ativos.fornecedores,
    ativos: ativos.ativos,
    consumiveis: consumiveis.consumiveis,
  };
  const estoque = await simularEstoque(pagina, deps, {
    saldos: [
      {
        id: '0199e2a0-0000-7000-8000-000000000b02',
        consumivelId: ROLETE.id,
        localId: IDS_DOS_ATIVOS.expedicao,
        saldo: 3,
        minimo: 0,
        abaixoDesde: null,
      },
    ],
  });
  const solicitacoes = await simularSolicitacoes(
    pagina,
    { ...deps, compativeisDoModelo: consumiveis.compativeisDoModelo, estoque },
    semeadas,
  );
  await simularOrdens(pagina, { ...deps, estoque, solicitacoes }, ordens);
  return { estoque };
}

/** Escolhe a opção de uma busca com sugestões dentro da gaveta. */
async function escolherNaBusca(
  pagina: Page,
  titulo: string,
  rotulo: string,
  busca: string,
  opcao: string,
) {
  await gaveta(pagina, titulo).getByRole('combobox', { name: rotulo }).fill(busca);
  await pagina.getByRole('option', { name: opcao }).click();
}

/** Escolhe a ação no menu "Ações" da linha da OS. */
async function agir(pagina: Page, numero: number, acao: string) {
  await pagina.getByRole('button', { name: `Ações da OS ${numero}` }).click();
  await pagina.getByRole('menuitem', { name: acao }).click();
}

/** Resolve a OS pela ficha dela, com o que foi feito. */
async function resolver(pagina: Page, numero: number, oQueFoiFeito: string) {
  await pagina.getByRole('button', { name: 'Resolver', exact: true }).click();
  const resolucao = gaveta(pagina, `Resolver a OS ${numero}`);
  await resolucao.getByRole('textbox', { name: 'O que foi feito' }).fill(oQueFoiFeito);
  await resolucao.getByRole('button', { name: 'Resolver', exact: true }).click();
  await expect(avisos(pagina).getByText('OS resolvida.')).toBeVisible();
}

test.describe('as ordens de serviço', () => {
  test('a OS aberta pela ficha do ativo, a espera pelo fornecedor, a peça do estoque e a resolução, até a ficha', async ({
    page,
  }) => {
    const { estoque } = await simular(page);
    await page.goto(`/ativos/${IDS_DOS_ATIVOS.doRh}`);
    const secao = page.getByRole('region', { name: 'Ordens de serviço' });
    await expect(secao.getByText('Nenhuma ordem de serviço deste ativo.')).toBeVisible();

    // A nova OS pela ficha da impressora do RH, já com ela no ativo.
    await secao.getByRole('link', { name: 'Nova ordem de serviço' }).click();
    const nova = gaveta(page, 'Nova ordem de serviço');
    await expect(nova.getByRole('combobox', { name: 'Ativo' })).toHaveValue(
      'Impressora do RH · PAT-00999',
    );
    await nova.getByRole('textbox', { name: 'Problema' }).fill('Atolando papel');
    await nova.getByRole('button', { name: 'Abrir a OS' }).click();
    await expect(avisos(page).getByText('OS 12 aberta.')).toBeVisible();
    await expect(linhaDa(page, 12)).toContainText('Aberta');

    // A espera pela HP Brasil, com o número da OS dela.
    await agir(page, 12, 'Mudar a situação');
    const situacao = gaveta(page, 'Mudar a situação da OS 12');
    await situacao.getByText('Aguardando fornecedor').click();
    await escolherNaBusca(page, 'Mudar a situação da OS 12', 'Fornecedor', 'hp', 'HP Brasil');
    await situacao.getByRole('textbox', { name: 'Número da OS no fornecedor' }).fill('HP-7781');
    await situacao.getByRole('button', { name: 'Mudar' }).click();
    await expect(avisos(page).getByText('Situação mudada.')).toBeVisible();
    await expect(linhaDa(page, 12)).toContainText('Aguardando fornecedor');

    // A peça do estoque, pela ficha: 1 rolete da Expedição, com "OS 12" na saída.
    await linhaDa(page, 12).getByText('Atolando papel').click();
    await expect(page).toHaveURL(/\/operacao\/ordens\/12$/);
    await expect(page.getByText('HP Brasil · OS HP-7781')).toBeVisible();
    await page.getByRole('button', { name: 'Lançar peça' }).click();
    const peca = gaveta(page, 'Lançar peça na OS 12');
    await escolherNaBusca(
      page,
      'Lançar peça na OS 12',
      'Consumível',
      'rolete',
      'RL1-2412 · Rolete de alimentação',
    );
    await expect(peca.getByRole('button', { name: /Local de origem/ })).toContainText(
      'Jundiaí › Expedição · saldo 3',
    );
    await peca.getByRole('textbox', { name: 'Quantidade' }).fill('1');
    await peca.getByRole('button', { name: 'Lançar' }).click();
    await expect(avisos(page).getByText('Peça lançada.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Peças' })).toContainText(
      '1 RL1-2412 · Rolete de alimentação',
    );
    expect(estoque.saldoDe(ROLETE.id)).toBe(2);
    expect(estoque.movimentos.at(-1)).toMatchObject({
      tipo: 'saida',
      ativoId: IDS_DOS_ATIVOS.doRh,
      observacao: 'OS 12',
    });

    // A resolução, com o histórico de Aberta a Resolvida.
    await resolver(page, 12, 'Rolete trocado');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Resolvida');
    await expect(page.getByText('Rolete trocado', { exact: true }).first()).toBeVisible();
    const historico = page.getByRole('region', { name: 'Histórico' }).getByRole('listitem');
    await expect(historico).toHaveCount(3);
    await expect(historico.nth(0)).toContainText('Resolvida');
    await expect(historico.nth(1)).toContainText('Aguardando fornecedor');
    await expect(historico.nth(2)).toContainText('Aberta');
    await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible();

    // A ficha da impressora, com a 12 entre as resolvidas.
    await page.goto(`/ativos/${IDS_DOS_ATIVOS.doRh}`);
    await expect(secao.getByRole('link', { name: 'OS 12' })).toBeVisible();
    await expect(secao).toContainText('Resolvida');
  });

  test('"Abrir OS" na solicitação de conserto, a OS na ficha e na lista dela, e a solicitação concluída com a OS', async ({
    page,
  }) => {
    await simular(page, { solicitacoes: [CONSERTO_DO_RH] });
    await page.goto('/operacao/solicitacoes/42');
    await page.getByRole('button', { name: 'Abrir OS' }).click();
    await expect(avisos(page).getByText('OS 12 aberta.')).toBeVisible();
    await expect(page).toHaveURL(/\/operacao\/ordens\/12$/);
    await expect(page.getByText('Atolando papel', { exact: true })).toBeVisible();

    // A ficha da solicitação: Em atendimento, com a OS, sem nenhuma ação.
    await page.getByRole('link', { name: 'Solicitação 42 · Marina Alves' }).click();
    await expect(page).toHaveURL(/\/operacao\/solicitacoes\/42$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Em atendimento');
    await expect(page.getByRole('link', { name: 'OS 12 · Aberta' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Alterar' })).toHaveCount(0);

    // A lista: a OS ao lado da situação, e a linha sem ações.
    await page.goto('/operacao/solicitacoes');
    await expect(linhaNaTabela(page, 'Solicitações', 42)).toContainText('Em atendimento · OS 12');
    await expect(page.getByRole('button', { name: 'Ações da solicitação 42' })).toHaveCount(0);

    // A OS resolvida conclui a solicitação, com o que foi feito.
    await page.goto('/operacao/ordens/12');
    await resolver(page, 12, 'Rolete trocado');
    await page.goto('/operacao/solicitacoes/42');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Concluída');
    await expect(page.getByText('Rolete trocado')).toBeVisible();
    await expect(page.getByRole('link', { name: 'OS 12 · Resolvida' })).toBeVisible();
  });

  test('a lista com o filtro, a busca e o encerramento em lote', async ({ page }) => {
    await simular(page, {
      ordens: [
        { ativo: IDS_DOS_ATIVOS.doRh, problema: 'Atolando papel' },
        { ativo: IDS_DOS_ATIVOS.daExpedicao, problema: 'Não imprime', solucao: 'Cabo trocado' },
        { ativo: IDS_DOS_ATIVOS.doRh, problema: 'Mancha na impressão', solucao: 'Cilindro limpo' },
      ],
    });
    await page.goto('/operacao/ordens');

    // As em aberto por padrão: só a 12.
    await expect(linhasDasOrdens(page)).toHaveCount(2);
    await expect(linhaDa(page, 12)).toContainText('Atolando papel');

    // Todas, pelo filtro da situação, no endereço.
    await page.getByRole('button', { name: /Situação$/ }).click();
    await page.getByRole('option', { name: 'Todas' }).click();
    await expect(linhasDasOrdens(page)).toHaveCount(4);
    await expect(page).toHaveURL(/situacao=todas/);

    // A busca pelo patrimônio.
    const busca = page.getByRole('searchbox', { name: 'Buscar nas ordens de serviço' });
    await busca.fill('00412');
    await expect(linhasDasOrdens(page)).toHaveCount(2);
    await expect(linhaDa(page, 13)).toContainText('Não imprime');
    await busca.fill('');
    await expect(linhasDasOrdens(page)).toHaveCount(4);

    // O encerramento em lote: as duas resolvidas se encerram, e a 12, em aberto, fica.
    for (const [numero, problema] of [
      [12, 'Atolando papel'],
      [13, 'Não imprime'],
      [14, 'Mancha na impressão'],
    ] as const) {
      await linhaDa(page, numero)
        .getByText(problema, { exact: true })
        .click({ modifiers: ['ControlOrMeta'] });
    }
    const selecao = page.getByRole('toolbar', { name: 'Ações da seleção' });
    await expect(selecao).toContainText('3 selecionados');
    await selecao.getByRole('button', { name: 'Mudar a situação' }).click();
    await gaveta(page, 'Mudar a situação').getByText('Encerrada', { exact: true }).click();
    await gaveta(page, 'Mudar a situação').getByRole('button', { name: 'Mudar' }).click();
    await expect(
      avisos(page).getByText('2 ordens de serviço mudaram. A 12 não: ainda não foi resolvida.'),
    ).toBeVisible();
    await expect(linhaDa(page, 13)).toContainText('Encerrada');
    await expect(linhaDa(page, 14)).toContainText('Encerrada');
    await expect(linhaDa(page, 12)).toContainText('Aberta');
  });
});
