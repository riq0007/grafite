import type { Page } from '@playwright/test';
import { simularSolicitacoes } from './api-das-solicitacoes.ts';
import { IDS_DO_CATALOGO } from './api-do-catalogo.ts';
import { simularEstoque } from './api-do-estoque.ts';
import { IDS_DOS_ATIVOS, IDS_DOS_FORNECEDORES, simularAtivos } from './api-dos-ativos.ts';
import {
  COMPATIBILIDADE,
  type ConsumivelGuardado,
  simularConsumiveis,
} from './api-dos-consumiveis.ts';
import { expect, test } from './fixtures.ts';

// Specs solicitacoes, modulo-operacao, cadastro-de-ativos e auditoria (change p4d-solicitacoes): o
// toner registrado com a sugestão, pedido ao fornecedor e entregue do estoque; o conserto concluído
// e o cancelamento; a lista com o filtro, a busca e o lote; a ficha e a seção da ficha do ativo, com
// a web compilada e a API simulada.

const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });
const gaveta = (pagina: Page, titulo: string) => pagina.getByRole('dialog', { name: titulo });
const tabela = (pagina: Page) => pagina.getByRole('grid', { name: 'Solicitações' });
const linhaDa = (pagina: Page, numero: number) =>
  tabela(pagina)
    .getByRole('row')
    .filter({ has: pagina.getByRole('rowheader', { name: String(numero), exact: true }) });

const CF258A: ConsumivelGuardado = {
  id: '0199e2a0-0000-7000-8000-000000000a01',
  codigo: 'CF258A',
  nome: 'HP 58A',
  tipo: 'toner',
  cor: 'preto',
  rendimento: 3000,
  situacao: 'ativo',
  fornecedores: [IDS_DOS_FORNECEDORES.hpBrasil],
  modelos: [IDS_DO_CATALOGO.m404],
};

const CONSERTO_DO_RH = {
  tipo: 'conserto',
  pessoa: IDS_DOS_ATIVOS.marina,
  ativo: IDS_DOS_ATIVOS.doRh,
  defeito: 'Atolando papel',
};

/** O catálogo, os ativos, os consumíveis e o estoque simulados, com as solicitações por cima. */
async function simular(pagina: Page, semeadas: Record<string, unknown>[] = []) {
  let consumiveis: Awaited<ReturnType<typeof simularConsumiveis>> | undefined;
  let estoque: Awaited<ReturnType<typeof simularEstoque>> | undefined;
  const ativos = await simularAtivos(pagina, {
    fornecedores: true,
    consumiveisDoModelo: (modeloId) =>
      (consumiveis?.compativeisDoModelo(modeloId) ?? []).map((compativel) => ({
        ...compativel,
        saldo: estoque?.saldoDe(compativel.id) ?? null,
      })),
  });
  for (const tipo of ativos.catalogo.tipos) {
    if (tipo.id === IDS_DO_CATALOGO.impressora) tipo.capacidades.push(COMPATIBILIDADE);
  }
  consumiveis = await simularConsumiveis(pagina, ativos, [CF258A]);
  estoque = await simularEstoque(
    pagina,
    {
      catalogo: ativos.catalogo,
      fornecedores: ativos.fornecedores,
      ativos: ativos.ativos,
      consumiveis: consumiveis.consumiveis,
    },
    {
      saldos: [
        {
          id: '0199e2a0-0000-7000-8000-000000000b01',
          consumivelId: CF258A.id,
          localId: IDS_DOS_ATIVOS.expedicao,
          saldo: 6,
          minimo: 0,
          abaixoDesde: null,
        },
      ],
    },
  );
  await simularSolicitacoes(
    pagina,
    {
      catalogo: ativos.catalogo,
      fornecedores: ativos.fornecedores,
      ativos: ativos.ativos,
      consumiveis: consumiveis.consumiveis,
      compativeisDoModelo: consumiveis.compativeisDoModelo,
      estoque,
    },
    semeadas,
  );
  return estoque;
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

/** Escolhe a ação no menu "Ações" da linha. */
async function agir(pagina: Page, numero: number, acao: string) {
  await pagina.getByRole('button', { name: `Ações da solicitação ${numero}` }).click();
  await pagina.getByRole('menuitem', { name: acao }).click();
}

test.describe('as solicitações', () => {
  test('o toner registrado com a sugestão, pedido ao fornecedor e entregue do estoque, na ficha e na do ativo', async ({
    page,
  }) => {
    const estoque = await simular(page);
    await page.goto('/operacao/solicitacoes');
    await expect(page.getByText('Nenhuma solicitação ainda.')).toBeVisible();

    // O toner de 1 preto para a PAT-00412, pedido por João, com o CF258A sugerido.
    await page.getByRole('button', { name: 'Nova solicitação' }).first().click();
    const nova = gaveta(page, 'Nova solicitação');
    await escolherNaBusca(page, 'Nova solicitação', 'Pedida por', 'joão', 'João da Silva');
    await escolherNaBusca(
      page,
      'Nova solicitação',
      'Adicionar impressora',
      '00412',
      'HP LaserJet M404 · PAT-00412',
    );
    const impressora = nova.getByRole('group', { name: 'HP LaserJet M404 · PAT-00412' });
    await impressora.getByRole('textbox', { name: 'Preto' }).fill('1');
    await expect(impressora.getByText('Sugerido: CF258A · HP 58A')).toBeVisible();
    await nova.getByRole('button', { name: 'Registrar' }).click();
    await expect(avisos(page).getByText('Solicitação 42 registrada.')).toBeVisible();
    await expect(linhaDa(page, 42)).toContainText('PAT-00412: 1 Preto');
    await expect(linhaDa(page, 42)).toContainText('Aberta');

    // O pedido à HP Brasil, com a OS dela.
    await agir(page, 42, 'Pedir ao fornecedor');
    await escolherNaBusca(page, 'Pedido ao fornecedor', 'Fornecedor', 'hp', 'HP Brasil');
    await gaveta(page, 'Pedido ao fornecedor')
      .getByRole('textbox', { name: 'Número da OS' })
      .fill('7781');
    await gaveta(page, 'Pedido ao fornecedor')
      .getByRole('button', { name: 'Registrar o pedido' })
      .click();
    await expect(avisos(page).getByText('Pedido ao fornecedor registrado.')).toBeVisible();
    await expect(linhaDa(page, 42)).toContainText('Aguardando entrega');
    await expect(linhaDa(page, 42)).toContainText('HP Brasil · OS 7781');

    // A entrega do estoque: o preto da Expedição, que tem 6.
    await agir(page, 42, 'Entregar');
    const entrega = gaveta(page, 'Entrega');
    const item = entrega.getByRole('group', { name: 'PAT-00412: 1 Preto' });
    await expect(item.getByRole('radio', { name: 'Pelo fornecedor' })).toBeChecked();
    await item.getByText('Do estoque').click();
    await expect(item.getByRole('button', { name: /Local de origem/ })).toContainText(
      'Jundiaí › Expedição · saldo 6',
    );
    await entrega.getByRole('button', { name: 'Lançar a entrega' }).click();
    await expect(avisos(page).getByText('Entrega lançada.')).toBeVisible();
    await expect(page.getByText('Nenhuma solicitação pendente.')).toBeVisible();
    expect(estoque.saldoDe(CF258A.id)).toBe(5);

    // Todas: a 42 concluída, e a ficha dela com a entrega do estoque.
    await page.getByRole('button', { name: 'Ver todas' }).click();
    await expect(linhaDa(page, 42)).toContainText('Concluída');
    await linhaDa(page, 42).getByText('PAT-00412: 1 Preto').click();
    await expect(page).toHaveURL(/\/operacao\/solicitacoes\/42$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Concluída');
    await expect(page.getByRole('region', { name: 'Impressoras' })).toContainText(
      'Entregue do estoque, de Jundiaí › Expedição',
    );

    // A seção da ficha da impressora, com a 42 e "Nova solicitação".
    await page.goto(`/ativos/${IDS_DOS_ATIVOS.daExpedicao}`);
    const secao = page.getByRole('region', { name: 'Solicitações' });
    await expect(secao.getByRole('link', { name: 'Solicitação 42' })).toBeVisible();
    await expect(secao).toContainText('Concluída');
    await secao.getByRole('link', { name: 'Nova solicitação' }).click();
    await expect(
      gaveta(page, 'Nova solicitação').getByRole('group', {
        name: 'HP LaserJet M404 · PAT-00412',
      }),
    ).toBeVisible();
  });

  test('o conserto concluído pela ficha, o cancelamento e a lista com o filtro, a busca e o lote', async ({
    page,
  }) => {
    await simular(page, [
      CONSERTO_DO_RH,
      { ...CONSERTO_DO_RH, defeito: 'Não liga' },
      {
        tipo: 'toner',
        pessoa: IDS_DOS_ATIVOS.joao,
        impressoras: [IDS_DOS_ATIVOS.daExpedicao],
        itens: [{ impressora: IDS_DOS_ATIVOS.daExpedicao, cor: 'preto', quantidade: 2 }],
      },
    ]);
    await page.goto('/operacao/solicitacoes');
    await expect(tabela(page).getByRole('row')).toHaveCount(4);

    // O filtro do tipo e a busca, no endereço.
    await page.getByRole('button', { name: /Tipo$/ }).click();
    await page.getByRole('option', { name: 'Conserto' }).click();
    await expect(tabela(page).getByRole('row')).toHaveCount(3);
    await expect(page).toHaveURL(/tipo=conserto/);
    await page.getByRole('searchbox', { name: 'Buscar nas solicitações' }).fill('42');
    await expect(tabela(page).getByRole('row')).toHaveCount(2);
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(tabela(page).getByRole('row')).toHaveCount(4);

    // O lote: os dois consertos para Em atendimento.
    await linhaDa(page, 42)
      .getByText('Atolando papel', { exact: false })
      .click({ modifiers: ['ControlOrMeta'] });
    await linhaDa(page, 43)
      .getByText('Não liga', { exact: false })
      .click({ modifiers: ['ControlOrMeta'] });
    const selecao = page.getByRole('toolbar', { name: 'Ações da seleção' });
    await expect(selecao).toContainText('2 selecionados');
    await selecao.getByRole('button', { name: 'Mudar a situação' }).click();
    await gaveta(page, 'Mudar a situação').getByText('Em atendimento').click();
    await gaveta(page, 'Mudar a situação').getByRole('button', { name: 'Mudar' }).click();
    await expect(avisos(page).getByText('2 solicitações mudaram.')).toBeVisible();
    await expect(linhaDa(page, 42)).toContainText('Em atendimento');
    await expect(linhaDa(page, 43)).toContainText('Em atendimento');

    // O cancelamento da 44, com o motivo.
    await agir(page, 44, 'Cancelar');
    const cancelamento = gaveta(page, 'Cancelamento');
    await cancelamento.getByRole('button', { name: 'Cancelar a solicitação' }).click();
    await expect(cancelamento.getByText('Informe o motivo do cancelamento.')).toBeVisible();
    await cancelamento.getByRole('textbox', { name: 'Motivo' }).fill('Pedido em duplicidade');
    await cancelamento.getByRole('button', { name: 'Cancelar a solicitação' }).click();
    await expect(avisos(page).getByText('Solicitação cancelada.')).toBeVisible();
    await expect(linhaDa(page, 44)).toHaveCount(0);

    // A conclusão da 42 pela ficha, com o que foi feito.
    await linhaDa(page, 42).getByText('Atolando papel', { exact: false }).click();
    await expect(page).toHaveURL(/\/operacao\/solicitacoes\/42$/);
    await page.getByRole('button', { name: 'Concluir' }).click();
    await gaveta(page, 'Conclusão')
      .getByRole('textbox', { name: 'O que foi feito' })
      .fill('Rolete trocado');
    await gaveta(page, 'Conclusão').getByRole('button', { name: 'Concluir' }).click();
    await expect(avisos(page).getByText('Solicitação concluída.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Concluída');
    await expect(page.getByText('Rolete trocado')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Alterar' })).toHaveCount(0);
  });
});
