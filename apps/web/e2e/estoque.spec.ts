import type { Page } from '@playwright/test';
import { IDS_DO_CATALOGO } from './api-do-catalogo.ts';
import { type SaldoGuardado, simularEstoque } from './api-do-estoque.ts';
import { IDS_DOS_ATIVOS, IDS_DOS_FORNECEDORES, simularAtivos } from './api-dos-ativos.ts';
import {
  COMPATIBILIDADE,
  type ConsumivelGuardado,
  simularConsumiveis,
} from './api-dos-consumiveis.ts';
import { abrirCartao } from './etapas.ts';
import { expect, test } from './fixtures.ts';

// Specs estoque, modulo-operacao, consumiveis, fornecedores, cadastro-de-ativos e tela-inicial
// (change p4c-estoque): a entrada, a saída, a transferência, o ajuste e o mínimo na gaveta do
// estoque, a ocorrência no Início, as movimentações filtradas, a seção da ficha do consumível, o
// cartão da impressora com "Registrar saída" e a ficha do fornecedor, com a web compilada e a API
// simulada.

const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });
const gaveta = (pagina: Page, titulo: string) => pagina.getByRole('dialog', { name: titulo });
const tabela = (pagina: Page) => pagina.getByRole('grid', { name: 'Estoque' });
const linhaDo = (pagina: Page, local: string) =>
  tabela(pagina).getByRole('row').filter({ hasText: local });

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

/** O catálogo, os ativos, os fornecedores e os consumíveis simulados, com o estoque por cima. */
async function simular(pagina: Page, saldos: SaldoGuardado[] = []) {
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
    { saldos },
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

/** Escolhe um local na árvore, pelo filtro. */
async function escolherLocal(
  pagina: Page,
  titulo: string,
  rotulo: string,
  filtro: string,
  caminho: string,
) {
  await gaveta(pagina, titulo)
    .getByRole('button', { name: new RegExp(`^${rotulo}`) })
    .click();
  const painel = pagina.getByRole('dialog', { name: rotulo });
  await painel.getByRole('searchbox', { name: 'Filtrar' }).fill(filtro);
  await pagina.getByRole('option', { name: caminho }).click();
}

/** Abre o lançamento de um tipo pelo menu "Lançar" da linha do local. */
async function lancarPelaLinha(pagina: Page, local: string, tipo: string) {
  await pagina.getByRole('button', { name: `Lançar CF258A em ${local}` }).click();
  await pagina.getByRole('menuitem', { name: tipo }).click();
}

test.describe('o estoque', () => {
  test('lança a entrada, define o mínimo, lança a saída, a transferência e o ajuste', async ({
    page,
  }) => {
    const estoque = await simular(page);
    await page.goto('/operacao/estoque');
    await expect(page.getByText('Nenhum consumível no estoque ainda.')).toBeVisible();

    // A entrada de 10 CF258A na Expedição, da HP Brasil.
    await page.getByRole('button', { name: 'Entrada' }).first().click();
    await escolherNaBusca(page, 'Nova entrada', 'Consumível', 'cf258', 'CF258A');
    await gaveta(page, 'Nova entrada').getByRole('textbox', { name: 'Quantidade' }).fill('10');
    await escolherLocal(page, 'Nova entrada', 'Destino', 'exped', 'Jundiaí › Expedição');
    await escolherNaBusca(page, 'Nova entrada', 'Fornecedor', 'hp', 'HP Brasil');
    await gaveta(page, 'Nova entrada').getByRole('textbox', { name: 'Nota fiscal' }).fill('12345');
    await gaveta(page, 'Nova entrada').getByRole('button', { name: 'Lançar' }).click();
    await expect(avisos(page).getByText('Entrada lançada.')).toBeVisible();
    await expect(linhaDo(page, 'Jundiaí › Expedição')).toContainText('10');
    await expect(linhaDo(page, 'Jundiaí › Expedição')).toContainText('Sem mínimo');

    // O mínimo 5 na Expedição.
    await page
      .getByRole('button', { name: 'Definir mínimo do CF258A em Jundiaí › Expedição' })
      .click();
    await gaveta(page, 'Definir mínimo').getByRole('textbox', { name: 'Mínimo' }).fill('5');
    await gaveta(page, 'Definir mínimo').getByRole('button', { name: 'Salvar' }).click();
    await expect(avisos(page).getByText('Mínimo salvo.')).toBeVisible();
    await expect(linhaDo(page, 'Jundiaí › Expedição')).toContainText('Em estoque');

    // A saída de 6 para a PAT-00412, que fica abaixo do mínimo.
    await lancarPelaLinha(page, 'Jundiaí › Expedição', 'Saída');
    await expect(gaveta(page, 'Nova saída')).toContainText('Saldo em Jundiaí › Expedição: 10');
    await gaveta(page, 'Nova saída').getByRole('textbox', { name: 'Quantidade' }).fill('6');
    await escolherNaBusca(page, 'Nova saída', 'Ativo', 'pat', 'HP LaserJet M404 · PAT-00412');
    await gaveta(page, 'Nova saída').getByRole('button', { name: 'Lançar' }).click();
    await expect(avisos(page).getByText('Saída lançada.')).toBeVisible();
    await expect(linhaDo(page, 'Jundiaí › Expedição')).toContainText('Abaixo do mínimo');

    // A transferência de 1 para o RH e o ajuste que o retira, por perda.
    await lancarPelaLinha(page, 'Jundiaí › Expedição', 'Transferência');
    await gaveta(page, 'Nova transferência').getByRole('textbox', { name: 'Quantidade' }).fill('1');
    await escolherLocal(page, 'Nova transferência', 'Destino', 'rh', 'Jundiaí › RH');
    await gaveta(page, 'Nova transferência').getByRole('button', { name: 'Lançar' }).click();
    await expect(avisos(page).getByText('Transferência lançada.')).toBeVisible();
    await expect(linhaDo(page, 'Jundiaí › RH')).toContainText('1');

    await lancarPelaLinha(page, 'Jundiaí › RH', 'Ajuste');
    await gaveta(page, 'Novo ajuste').getByRole('textbox', { name: 'Quantidade' }).fill('1');
    await gaveta(page, 'Novo ajuste')
      .getByRole('button', { name: /Direção/ })
      .click();
    await page.getByRole('option', { name: 'Retirar' }).click();
    await gaveta(page, 'Novo ajuste')
      .getByRole('button', { name: /Motivo/ })
      .click();
    await page.getByRole('option', { name: 'Perda' }).click();
    await gaveta(page, 'Novo ajuste').getByRole('button', { name: 'Lançar' }).click();
    await expect(avisos(page).getByText('Ajuste lançado.')).toBeVisible();
    await expect(linhaDo(page, 'Jundiaí › RH')).toContainText('Sem estoque');

    expect(estoque.corposDe('POST /api/estoque/saidas')).toEqual([
      {
        consumivel: CF258A.id,
        quantidade: 6,
        origem: IDS_DOS_ATIVOS.expedicao,
        ativo: IDS_DOS_ATIVOS.daExpedicao,
        observacao: null,
      },
    ]);
  });

  test('a ocorrência no Início leva ao estoque, e as movimentações filtram pelo ativo', async ({
    page,
  }) => {
    await simular(page, [
      {
        id: '0199e2a0-0000-7000-8000-000000000b01',
        consumivelId: CF258A.id,
        localId: IDS_DOS_ATIVOS.expedicao,
        saldo: 6,
        minimo: 5,
        abaixoDesde: null,
      },
    ]);
    await page.goto(`/operacao/estoque?lancar=saida&consumivel=${CF258A.id}`);
    await gaveta(page, 'Nova saída').getByRole('textbox', { name: 'Quantidade' }).fill('2');
    await escolherLocal(page, 'Nova saída', 'Origem', 'exped', 'Jundiaí › Expedição');
    await escolherNaBusca(page, 'Nova saída', 'Ativo', 'pat', 'HP LaserJet M404 · PAT-00412');
    await gaveta(page, 'Nova saída').getByRole('button', { name: 'Lançar' }).click();
    await expect(avisos(page).getByText('Saída lançada.')).toBeVisible();

    await page.goto('/');
    const ocorrencias = page.getByRole('grid', { name: 'Ocorrências abertas' });
    const ocorrencia = ocorrencias.getByText(
      'CF258A abaixo do mínimo em Jundiaí › Expedição: 4 de 5',
    );
    await expect(ocorrencia).toBeVisible();
    await expect(ocorrencias).toContainText('CF258A · HP 58A');
    await ocorrencia.click();
    await expect(page).toHaveURL(/\/operacao\/estoque\?/);
    await expect(linhaDo(page, 'Jundiaí › Expedição')).toContainText('Abaixo do mínimo');

    await page.goto(`/operacao/movimentacoes?ativo=${IDS_DOS_ATIVOS.daExpedicao}`);
    const movimentacoes = page.getByRole('grid', { name: 'Movimentações' });
    await expect(movimentacoes.getByRole('row')).toHaveCount(2);
    await expect(movimentacoes).toContainText('HP LaserJet M404 · PAT-00412');
    await expect(page.getByRole('group', { name: 'Filtros ativos' })).toContainText('PAT-00412');
  });

  test('a ficha do consumível, o cartão da impressora e a ficha do fornecedor mostram o estoque', async ({
    page,
  }) => {
    await simular(page);
    // A entrada que dá o saldo e a entrada do fornecedor.
    await page.goto(`/operacao/estoque?lancar=entrada&consumivel=${CF258A.id}`);
    await gaveta(page, 'Nova entrada').getByRole('textbox', { name: 'Quantidade' }).fill('4');
    await escolherLocal(page, 'Nova entrada', 'Destino', 'exped', 'Jundiaí › Expedição');
    await escolherNaBusca(page, 'Nova entrada', 'Fornecedor', 'hp', 'HP Brasil');
    await gaveta(page, 'Nova entrada').getByRole('textbox', { name: 'Nota fiscal' }).fill('777');
    await gaveta(page, 'Nova entrada').getByRole('button', { name: 'Lançar' }).click();
    await expect(avisos(page).getByText('Entrada lançada.')).toBeVisible();

    await page.goto(`/operacao/consumiveis/${CF258A.id}`);
    const secao = page.getByRole('region', { name: 'Estoque' });
    await expect(secao.getByRole('list', { name: 'Saldos nos locais' })).toContainText(
      'Jundiaí › Expedição',
    );
    await expect(secao).toContainText('4 em estoque nos locais que você vê');
    await expect(secao.getByRole('list', { name: 'Movimentações mais novas' })).toContainText(
      'Entrada de 4',
    );

    await page.goto(`/ativos/${IDS_DOS_ATIVOS.daExpedicao}`);
    await abrirCartao(page, 'Consumíveis compatíveis');
    const compativeis = page.getByRole('list', { name: 'Consumíveis compatíveis' });
    await expect(compativeis).toContainText('4 em estoque');
    await compativeis.getByRole('button', { name: 'Registrar saída do CF258A' }).click();
    await expect(page).toHaveURL(/\/operacao\/estoque\?/);
    await expect(gaveta(page, 'Nova saída').getByRole('combobox', { name: 'Ativo' })).toHaveValue(
      'HP LaserJet M404 · PAT-00412',
    );
    await expect(
      gaveta(page, 'Nova saída').getByRole('combobox', { name: 'Consumível' }),
    ).toHaveValue('CF258A');
    await gaveta(page, 'Nova saída').getByRole('button', { name: 'Cancelar' }).click();

    await page.goto(`/administracao/fornecedores/${IDS_DOS_FORNECEDORES.hpBrasil}`);
    await expect(
      page.getByRole('region', { name: 'Consumíveis deste fornecedor' }).getByRole('link', {
        name: 'CF258A',
      }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Entradas no estoque' })).toContainText(
      'Entradas no estoque: 1',
    );
  });
});
