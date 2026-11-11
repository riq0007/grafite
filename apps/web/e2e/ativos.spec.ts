import type { Page } from '@playwright/test';
import { IDS_DO_CATALOGO } from './api-do-catalogo.ts';
import { IDS_DOS_ATIVOS, simularAtivos } from './api-dos-ativos.ts';
import { campoDeLocal, escolherLocal } from './escolhas.ts';
import { abrirCartao, abrirEtapa, escolherModelo, etapa, etapaAberta } from './etapas.ts';
import { expect, test } from './fixtures.ts';

// Specs cadastro-de-ativos, modulo-ativos, modulos-da-organizacao, tabelas-configuraveis e
// visoes-de-tabela, com a web compilada e a API simulada.

const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });
const dock = (pagina: Page) => pagina.getByRole('navigation', { name: 'Dock' });
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });
const tabela = (pagina: Page) => pagina.getByRole('grid', { name: 'Ativos', exact: true });
/** A linha do ativo na tabela, pelo texto dela, como o patrimônio. */
const linha = (pagina: Page, texto: string) =>
  tabela(pagina).getByRole('row').filter({ hasText: texto });
/** A primeira linha do corpo da tabela: a segunda da grade, depois da dos cabeçalhos. */
const primeiraLinha = (pagina: Page) => tabela(pagina).locator('[role="row"][aria-rowindex="2"]');
const cabecalho = (pagina: Page, rotulo: string) =>
  tabela(pagina).getByRole('columnheader', { name: new RegExp(`^${rotulo}`) });
const escolhaDaVisao = (pagina: Page) => pagina.getByRole('button', { name: /^Visão / });
const filtrosAtivos = (pagina: Page) => pagina.getByRole('group', { name: 'Filtros ativos' });
/** Um parâmetro do endereço da página, já decodificado. */
const parametro = (pagina: Page, nome: string) => new URL(pagina.url()).searchParams.get(nome);

/** Abre o painel de filtros pelo botão "Filtros" e escolhe a coluna: o editor dela fica à direita. */
async function filtrar(pagina: Page, coluna: string) {
  await pagina.getByRole('button', { name: 'Filtros', exact: true }).click();
  const painel = pagina.getByRole('dialog', { name: 'Filtros' });
  await painel.getByRole('option', { name: coluna, exact: true }).click();
  return painel;
}

/** Escolhe uma ação no menu da visão aberta. */
async function noMenuDaVisao(pagina: Page, acao: string) {
  await escolhaDaVisao(pagina).click();
  await pagina.getByRole('menuitem', { name: acao }).click();
}

/** O que a área de transferência guarda, com as quebras de linha do Windows como as dos outros. */
const copiado = async (pagina: Page) =>
  (await pagina.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');

/**
 * Escolhe uma opção de uma seleção, como o usuário. O nome do botão termina pelo rótulo, depois da
 * opção escolhida, e só ele abre uma lista: a trava do campo tem o rótulo no nome também.
 */
async function selecionar(pagina: Page, rotulo: string, opcao: string) {
  await pagina
    .getByRole('button', { name: new RegExp(`${rotulo}$`) })
    .and(pagina.locator('[aria-haspopup="listbox"]'))
    .click();
  await pagina.getByRole('option', { name: opcao, exact: true }).click();
}

test.describe('quem cadastra os ativos', () => {
  test('cadastra uma impressora com o modelo e os campos do tipo, e o obrigatório vazio é recusado no campo', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await page.goto('/ativos');
    await expect(titulo(page, 'Ativos')).toBeVisible();
    await page.getByRole('button', { name: 'Novo ativo' }).first().click();
    await expect(titulo(page, 'Novo ativo')).toBeVisible();
    await selecionar(page, 'Tipo do ativo', 'Impressora');
    await escolherModelo(page, 'laserjet', 'HP LaserJet M404');
    await abrirEtapa(page, 'Identificação');
    await page.getByRole('textbox', { name: 'Patrimônio' }).fill('PAT-00500');
    await abrirEtapa(page, 'Uso');
    await escolherLocal(page, 'Local', 'Jundiaí › Expedição');
    await expect(etapa(page, 'Rede')).toContainText('Falta: IP');

    // "Cadastrar", na última etapa, abre a do campo recusado, com o foco nele.
    await abrirEtapa(page, 'Administrativo');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(etapaAberta(page, 'Rede')).toBeVisible();
    await expect(page.getByText('Preencha este campo.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'IP' })).toBeFocused();
    expect(api.corposDe('POST /api/ativos')).toEqual([]);

    await page.getByRole('textbox', { name: 'IP' }).fill('10.0.0.7');
    await abrirEtapa(page, 'Administrativo');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(titulo(page, /HP LaserJet M404/)).toBeVisible();
    await expect(avisos(page).getByText('Ativo cadastrado.')).toBeVisible();
    const [corpo] = api.corposDe('POST /api/ativos');
    expect(corpo).toMatchObject({
      tipoId: IDS_DO_CATALOGO.impressora,
      modeloId: IDS_DO_CATALOGO.m404,
      valores: {
        'ativo.patrimonio': 'PAT-00500',
        'ativo.local': IDS_DOS_ATIVOS.expedicao,
        [IDS_DOS_ATIVOS.ip]: '10.0.0.7',
      },
    });
    const cadastrado = api.ativos.at(-1);
    await expect(page).toHaveURL(new RegExp(`/ativos/${cadastrado?.id}$`));
    expect(cadastrado?.estado['ativo.patrimonio']?.origem).toBe('manual');
  });

  test('o patrimônio repetido é recusado pela API no campo, com o formulário preenchido', async ({
    page,
  }) => {
    await simularAtivos(page);
    await page.goto('/ativos/novo');
    await selecionar(page, 'Tipo do ativo', 'Impressora');
    await abrirEtapa(page, 'Identificação');
    await page.getByRole('textbox', { name: 'Patrimônio' }).fill('pat-00412');
    await abrirEtapa(page, 'Rede');
    await page.getByRole('textbox', { name: 'IP' }).fill('10.0.0.8');
    await abrirEtapa(page, 'Administrativo');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(etapaAberta(page, 'Identificação')).toBeVisible();
    await expect(page.getByText('Já existe um ativo com este patrimônio.').first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Patrimônio' })).toBeFocused();
    await abrirEtapa(page, 'Rede');
    await expect(page.getByRole('textbox', { name: 'IP' })).toHaveValue('10.0.0.8');
    await expect(titulo(page, 'Novo ativo')).toBeVisible();
  });

  test('a ficha mostra o estado do campo, trava o patrimônio e inativa o ativo com confirmação', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await page.goto(`/ativos/${IDS_DOS_ATIVOS.daExpedicao}`);
    const cabecalho = titulo(page, /HP LaserJet M404/);
    await expect(cabecalho).toContainText('Em uso');
    await expect(cabecalho).toContainText('PAT-00412');
    await abrirCartao(page, 'Rede');
    await expect(page.getByText(/^Planilha · \d\d\/10\/2026 \d\d:00$/)).toBeVisible();
    await abrirCartao(page, 'Identificação');
    await expect(page.getByText(/^Manual · Ana Souza · \d\d\/10\/2026 \d\d:32$/)).toBeVisible();

    const trava = page.getByRole('button', { name: 'Trava de Patrimônio' });
    await expect(trava).toHaveAttribute('aria-pressed', 'false');
    await trava.click();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(avisos(page).getByText('Ativo salvo.')).toBeVisible();
    expect(api.corposDe(`PATCH /api/ativos/${IDS_DOS_ATIVOS.daExpedicao}`)).toEqual([
      { travas: { 'ativo.patrimonio': true } },
    ]);
    await expect(page.getByRole('button', { name: 'Trava de Patrimônio' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: 'Inativar' }).click();
    const confirmacao = page.getByRole('alertdialog', {
      name: 'Inativar o ativo HP LaserJet M404?',
    });
    await expect(confirmacao).toContainText(
      'O ativo sai da lista dos ativos, e os dados ficam guardados.',
    );
    await confirmacao.getByRole('button', { name: 'Inativar o ativo' }).click();
    await expect(avisos(page).getByText('Ativo inativado.')).toBeVisible();
    await expect(cabecalho).toContainText('Inativo');
    expect(api.ativos.find((ativo) => ativo.id === IDS_DOS_ATIVOS.daExpedicao)?.situacao).toBe(
      'inativo',
    );
  });
});

test.describe('quem procura os ativos', () => {
  test('a tabela acha pela busca e filtra pelo texto e pelo local, com os filtros guardados na conta', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await page.goto('/');
    await dock(page).getByRole('button', { name: 'Ativos', exact: true }).click();
    await expect(page).toHaveURL(/\/ativos\?visao=fabrica$/);
    await expect(page.getByText('2 ativos')).toBeVisible();
    await expect(linha(page, 'PAT-00412')).toBeVisible();
    await expect(linha(page, 'PAT-00999')).toBeVisible();

    await page.getByRole('searchbox', { name: 'Buscar ativos' }).fill('pat-00999');
    await expect(page).toHaveURL(/busca=pat-00999/);
    await expect(linha(page, 'PAT-00412')).toHaveCount(0);
    await expect(linha(page, 'Impressora do RH')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar ativos' }).fill('');
    await expect(linha(page, 'PAT-00412')).toBeVisible();

    const patrimonio = await filtrar(page, 'Patrimônio');
    await patrimonio.getByRole('textbox', { name: 'Texto' }).fill('00412');
    await patrimonio.getByRole('button', { name: 'Aplicar filtro' }).click();
    await expect(filtrosAtivos(page).getByRole('listitem')).toHaveText([
      'Patrimônio · contém · 00412',
    ]);
    await expect(linha(page, 'PAT-00999')).toHaveCount(0);
    await expect(linha(page, 'PAT-00412')).toBeVisible();
    await filtrosAtivos(page)
      .getByRole('button', { name: 'Limpar o filtro Patrimônio: contém 00412' })
      .click();
    await expect(linha(page, 'PAT-00999')).toBeVisible();

    const local = await filtrar(page, 'Local');
    await escolherLocal(page, 'Local', 'Jundiaí › Expedição', local);
    await local.getByRole('button', { name: 'Aplicar filtro' }).click();
    await expect(filtrosAtivos(page).getByRole('listitem')).toHaveText([
      'Local · em · Jundiaí › Expedição',
    ]);
    await expect(linha(page, 'PAT-00412')).toBeVisible();
    await expect(linha(page, 'PAT-00999')).toHaveCount(0);
    // O filtro fica guardado na conta, sobre a visão de fábrica, e o endereço fica sem ele.
    await expect
      .poll(() => api.mudancas.get('fabrica')?.definicao.filtros)
      .toContainEqual({ chave: 'ativo.local', operador: 'em', local: IDS_DOS_ATIVOS.expedicao });
    expect(parametro(page, 'filtros')).toBeNull();
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Todos os ativos, personalizada');

    await page.reload();
    await expect(filtrosAtivos(page).getByRole('listitem')).toHaveText([
      'Local · em · Jundiaí › Expedição',
    ]);
    await expect(linha(page, 'PAT-00412')).toBeVisible();
    await expect(linha(page, 'PAT-00999')).toHaveCount(0);
  });

  test('filtra pelo painel com quantos ativos cada tipo traz, e edita o filtro pelo rótulo dele', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await page.goto('/ativos');
    await expect(page.getByText('2 ativos')).toBeVisible();

    const painel = await filtrar(page, 'Tipo');
    // O filtro do rótulo procura a caixa a partir dele: o localizador é da página.
    const impressora = page.getByRole('checkbox', { name: 'Impressora (2)' });
    await expect(impressora).toBeVisible();
    await painel.locator('label').filter({ has: impressora }).click();
    await painel.getByRole('button', { name: 'Mostrar 2 ativos' }).click();
    await expect(filtrosAtivos(page).getByRole('listitem')).toHaveText(['Tipo · Impressora']);
    expect(api.parametrosDe('GET /api/ativos/contagens').at(-1)?.get('coluna')).toBe('ativo.tipo');

    const patrimonio = await filtrar(page, 'Patrimônio');
    await patrimonio.getByRole('textbox', { name: 'Texto' }).fill('00412');
    await patrimonio.getByRole('button', { name: 'Aplicar filtro' }).click();
    await expect(linha(page, 'PAT-00999')).toHaveCount(0);

    // O rótulo do filtro ativo abre o editor dele, preso ao rótulo, já com o texto.
    await filtrosAtivos(page)
      .getByRole('button', { name: 'Editar o filtro Patrimônio: contém 00412' })
      .click();
    const editor = page.getByRole('dialog', { name: 'Filtro de Patrimônio' });
    await expect(editor.getByRole('textbox', { name: 'Texto' })).toHaveValue('00412');
    await editor.getByRole('textbox', { name: 'Texto' }).fill('00999');
    await editor.getByRole('button', { name: 'Aplicar filtro' }).click();
    await expect(linha(page, 'PAT-00999')).toBeVisible();
    await expect(linha(page, 'PAT-00412')).toHaveCount(0);
    await expect(filtrosAtivos(page).getByRole('listitem')).toHaveText([
      'Tipo · Impressora',
      'Patrimônio · contém · 00999',
    ]);
  });

  test('acha o ativo pela busca global, com o patrimônio, o tipo e o local, e abre a ficha', async ({
    page,
  }) => {
    await simularAtivos(page);
    await page.goto('/');
    await expect(titulo(page, 'O que resolver agora')).toBeVisible();
    await page.keyboard.press('Control+k');
    await page.keyboard.type('00412');
    const opcao = page
      .getByRole('dialog', { name: 'Busca' })
      .getByRole('group', { name: 'Ativos', exact: true })
      .getByRole('option', { name: /HP LaserJet M404/ });
    await expect(opcao).toContainText('PAT-00412 · Impressora · Jundiaí › Expedição');
    await opcao.click();
    await expect(page).toHaveURL(new RegExp(`/ativos/${IDS_DOS_ATIVOS.daExpedicao}$`));
    await expect(titulo(page, /HP LaserJet M404/)).toBeVisible();
  });
});

// As relações do ativo à vista (change relacoes-vivas): as referências com cartão, a tabela a
// partir de uma origem, com o cadastro preenchido, e as ações da tela na busca.
test.describe('quem segue as relações dos ativos', () => {
  test('o cartão do responsável, "Ver ativos" do local com a origem e o cadastro preenchido, e "Nesta tela"', async ({
    page,
  }) => {
    await simularAtivos(page);
    await page.goto('/ativos?visao=fabrica&colunas=ativo.rotulo,ativo.local,ativo.responsavel');
    const daExpedicao = linha(page, 'HP LaserJet M404');

    // O ponteiro parado sobre o responsável abre o cartão dele, com os ativos sob responsabilidade.
    await daExpedicao.getByRole('link', { name: 'João da Silva' }).hover();
    const doJoao = page.getByRole('dialog', { name: 'Resumo de João da Silva' });
    await expect(doJoao.getByText('1 ativo sob responsabilidade')).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(doJoao).toHaveCount(0);

    // "Ver ativos" no cartão do local abre a tabela só com o local, com a faixa da origem.
    await daExpedicao.getByRole('link', { name: 'Jundiaí › Expedição' }).hover();
    const doLocal = page.getByRole('dialog', { name: 'Resumo de Jundiaí › Expedição' });
    await expect(doLocal.getByText('Ativos: 1 aqui · 1 com os de dentro')).toBeVisible();
    await doLocal.getByRole('link', { name: 'Ver ativos' }).click();
    const faixa = page.getByRole('group', { name: 'Origem da tabela' });
    await expect(faixa).toContainText('Ativos de Jundiaí › Expedição (vindo do local)');
    await expect(page.getByText('1 ativo', { exact: true })).toBeVisible();
    await expect(linha(page, 'PAT-00999')).toHaveCount(0);
    // A origem fica fora da visão: ela continua a de fábrica, sem mudanças.
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Todos os ativos');

    // A busca, com o campo vazio, traz as ações da tabela em "Nesta tela".
    await page.keyboard.press('Control+k');
    const nestaTela = page
      .getByRole('dialog', { name: 'Busca' })
      .getByRole('group', { name: 'Nesta tela' });
    await expect(nestaTela.getByRole('option')).toHaveText(['Novo ativo', 'Filtrar por tipo…']);
    await page.keyboard.press('Escape');

    // "Novo ativo" leva a origem ao cadastro, que diz onde e traz o local preenchido.
    await page.getByRole('button', { name: 'Novo ativo' }).click();
    await expect(titulo(page, 'Novo ativo em Expedição')).toBeVisible();
    await selecionar(page, 'Tipo do ativo', 'Impressora');
    await abrirEtapa(page, 'Uso');
    await expect(campoDeLocal(page, 'Local', 'Jundiaí › Expedição')).toBeVisible();
  });
});

test.describe('quem trabalha na tabela dos ativos', () => {
  test('mostra a coluna IP, muda a largura e ordena por ela, e a tabela personalizada volta pelo dock', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    const guardadas = () => api.mudancas.get('fabrica')?.definicao;
    await page.goto('/ativos');
    await expect(page).toHaveURL(/\/ativos\?visao=fabrica$/);
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Todos os ativos');

    await page.getByRole('button', { name: 'Colunas' }).click();
    await page
      .getByRole('dialog', { name: 'Colunas' })
      .locator('label')
      .filter({ has: page.getByRole('checkbox', { name: 'IP', exact: true }) })
      .click();
    await page.keyboard.press('Escape');
    const ip = cabecalho(page, 'IP');
    await expect(ip).toBeVisible();
    await expect(linha(page, 'PAT-00412')).toContainText('10.0.0.5');
    await expect.poll(() => guardadas()?.colunas.at(-1)?.chave).toBe(IDS_DOS_ATIVOS.ip);

    const largura = (await ip.boundingBox())?.width ?? 0;
    await page.getByRole('button', { name: 'Opções da coluna IP' }).click();
    await page.getByRole('menuitem', { name: 'Redimensionar coluna' }).click();
    for (const tecla of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter']) {
      await page.keyboard.press(tecla);
    }
    await expect.poll(async () => (await ip.boundingBox())?.width ?? 0).toBeGreaterThan(largura);
    await expect.poll(() => guardadas()?.colunas.at(-1)?.largura ?? 0).toBeGreaterThan(0);

    await ip.getByText('IP', { exact: true }).click();
    await expect(ip).toHaveAttribute('aria-sort', 'ascending');
    await expect(primeiraLinha(page)).toContainText('PAT-00412');
    await ip.getByText('IP', { exact: true }).click();
    await expect(ip).toHaveAttribute('aria-sort', 'descending');
    await expect(primeiraLinha(page)).toContainText('PAT-00999');
    await expect
      .poll(() => guardadas()?.ordenacao)
      .toEqual({ chave: IDS_DOS_ATIVOS.ip, direcao: 'decrescente' });
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Todos os ativos, personalizada');
    await expect(escolhaDaVisao(page)).toContainText('Personalizada');
    await expect(page.getByRole('group', { name: 'Estado da visão' })).toContainText(
      'Você mudou as colunas e a ordem. As mudanças ficam guardadas para você.',
    );
    // O endereço fica só com a visão: as mudanças estão na conta.
    await expect(page).toHaveURL(/\/ativos\?visao=fabrica$/);

    // Noutro módulo e de volta pelo dock, a tabela abre como a conta a deixou.
    await dock(page).getByRole('button', { name: 'Início' }).click();
    await expect(titulo(page, 'O que resolver agora')).toBeVisible();
    await dock(page).getByRole('button', { name: 'Ativos', exact: true }).click();
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Todos os ativos, personalizada');
    await expect(cabecalho(page, 'IP')).toHaveAttribute('aria-sort', 'descending');
    await expect(primeiraLinha(page)).toContainText('PAT-00999');

    // Restaurada, a visão volta a ser a de fábrica, e as mudanças saem da conta.
    await page
      .getByRole('group', { name: 'Estado da visão' })
      .getByRole('button', { name: 'Restaurar a visão' })
      .click();
    await expect(avisos(page).getByText('Visão restaurada.')).toBeVisible();
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Todos os ativos');
    await expect(cabecalho(page, 'IP')).toHaveCount(0);
    await expect.poll(() => api.mudancas.size).toBe(0);
  });

  test('o link mostra "Do link", salvo como visão nova guarda as mudanças nela e reabre pela busca', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await page.goto(
      `/ativos?visao=fabrica&colunas=ativo.rotulo,ativo.patrimonio,${IDS_DOS_ATIVOS.ip}:180&ordem=-${IDS_DOS_ATIVOS.ip}`,
    );
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Todos os ativos, do link');
    await expect(page.getByRole('group', { name: 'Estado da visão' })).toContainText(
      'Esta tabela veio de um link.',
    );
    await noMenuDaVisao(page, 'Salvar como nova visão…');
    const dialogo = page.getByRole('dialog', { name: 'Salvar como nova visão' });
    await dialogo.getByRole('textbox', { name: 'Nome' }).fill('Impressoras por IP');
    await dialogo.getByRole('button', { name: 'Salvar visão' }).click();
    await expect(avisos(page).getByText('Visão criada.')).toBeVisible();
    await expect(dialogo).toHaveCount(0);
    const [criada] = api.visoes;
    expect(criada).toMatchObject({
      nome: 'Impressoras por IP',
      definicao: {
        colunas: [
          { chave: 'ativo.rotulo' },
          { chave: 'ativo.patrimonio' },
          { chave: IDS_DOS_ATIVOS.ip, largura: 180 },
        ],
        ordenacao: { chave: IDS_DOS_ATIVOS.ip, direcao: 'decrescente' },
      },
    });
    expect(criada?.contaId).not.toBeNull();
    await expect(page).toHaveURL(new RegExp(`/ativos\\?visao=${criada?.id}$`));
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Impressoras por IP');

    // Na visão da conta, a mudança vai à própria visão, sem marca.
    await page.getByRole('button', { name: 'Opções da coluna IP' }).click();
    await page.getByRole('menuitem', { name: 'Ordenar crescente' }).click();
    await expect(primeiraLinha(page)).toContainText('PAT-00412');
    await expect
      .poll(() => api.visoes.find((visao) => visao.id === criada?.id)?.definicao.ordenacao)
      .toEqual({ chave: IDS_DOS_ATIVOS.ip, direcao: 'crescente' });
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Impressoras por IP');
    await expect(page).toHaveURL(new RegExp(`/ativos\\?visao=${criada?.id}$`));

    await page.goto('/');
    await expect(titulo(page, 'O que resolver agora')).toBeVisible();
    await page.keyboard.press('Control+k');
    await page.keyboard.type('por ip');
    const opcao = page
      .getByRole('dialog', { name: 'Busca' })
      .getByRole('group', { name: 'Visões' })
      .getByRole('option', { name: /Impressoras por IP/ });
    await expect(opcao).toContainText('Ativos › Visões');
    await opcao.click();
    await expect(page).toHaveURL(new RegExp(`/ativos\\?visao=${criada?.id}$`));
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Impressoras por IP');
    await expect(cabecalho(page, 'IP')).toHaveAttribute('aria-sort', 'ascending');
    await expect(cabecalho(page, 'Local')).toHaveCount(0);
  });

  test('seleciona com Ctrl e Shift, copia as linhas e usa o menu de contexto', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await simularAtivos(page, { numeradas: 2 });
    await page.goto('/ativos');
    await linha(page, 'PAT-00412')
      .getByText('PAT-00412')
      .click({ modifiers: ['Control'] });
    await expect(page.getByText('1 selecionado')).toBeVisible();
    await linha(page, 'PAT-10003')
      .getByText('PAT-10003')
      .click({ modifiers: ['Shift'] });
    await expect(page.getByText('3 selecionados')).toBeVisible();
    await expect(linha(page, 'PAT-00999')).toHaveAttribute('aria-selected', 'true');
    await expect(linha(page, 'PAT-10004')).toHaveAttribute('aria-selected', 'false');

    await page.keyboard.press('Control+c');
    await expect(avisos(page).getByText('3 linhas copiadas.')).toBeVisible();
    expect(await copiado(page)).toBe(
      [
        'Ativo\tPatrimônio\tLocal\tSituação',
        'HP LaserJet M404\tPAT-00412\tJundiaí › Expedição\tEm uso',
        'Impressora do RH\tPAT-00999\tJundiaí › RH\tEm estoque',
        'Impressora 03\tPAT-10003\tJundiaí › RH\tEm uso',
      ].join('\n'),
    );

    // Sobre a seleção, o menu age nela inteira; fora dela, só na linha, que passa a ser a seleção.
    await linha(page, 'PAT-00999').getByText('PAT-00999').click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Ações das linhas' });
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Prévia',
      'Copiar linhas',
      'Imprimir etiquetas',
    ]);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await linha(page, 'PAT-10004').getByText('PAT-10004').click({ button: 'right' });
    await expect(page.getByText('1 selecionado')).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Abrir',
      'Prévia',
      'Copiar linhas',
      'Copiar patrimônio',
      'Copiar link',
      'Imprimir etiqueta',
    ]);
    await menu.getByRole('menuitem', { name: 'Copiar patrimônio' }).click();
    await expect(avisos(page).getByText('Patrimônio copiado.')).toBeVisible();
    expect(await copiado(page)).toBe('PAT-10004');
  });

  test('a prévia passa pelas setas até a página seguinte da lista', async ({ page }) => {
    const api = await simularAtivos(page, { numeradas: 43, porPagina: 40 });
    await page.goto('/ativos');
    await expect(page.getByText('45 ativos')).toBeVisible();
    await linha(page, 'PAT-00412').focus();
    await page.keyboard.press('Space');
    const previa = page.getByRole('dialog', { name: /^Prévia: / });
    await expect(previa).toHaveAccessibleName('Prévia: HP LaserJet M404');
    await expect(previa).toContainText('1 de 45');
    for (let vez = 0; vez < 40; vez += 1) await page.keyboard.press('ArrowDown');
    await expect(previa).toHaveAccessibleName('Prévia: Impressora 41');
    await expect(previa).toContainText('41 de 45');
    await expect(previa).toContainText('PAT-10041');
    expect(
      api.parametrosDe('GET /api/ativos').some((parametros) => parametros.get('cursor') === '40'),
    ).toBe(true);
  });

  test('o mouse parado sobre a linha resume as colunas fora da área visível', async ({ page }) => {
    // O relógio falso adianta a pausa de 1,5 s logo depois do hover. Com o tempo real, a espera
    // ficava exposta 1,5 s, a cada tentativa, aos ajustes tardios da tabela com o executor
    // carregado, que rolam e a cancelam, como a spec manda.
    await page.clock.install();
    await simularAtivos(page);
    await page.goto(
      `/ativos?visao=fabrica&colunas=ativo.rotulo,ativo.patrimonio,ativo.local:800,${IDS_DOS_ATIVOS.ip}`,
    );
    // O mouse para sobre o nome, à vista inteiro: o hover do Playwright rolaria a tabela até uma
    // célula cortada, e a rolagem cancela a espera, como deve. Se um ajuste ainda cancelar, o mouse
    // sai e para de novo (change testes-sob-carga, decisão 6). O resumo também traz a coluna cujo
    // conteúdo a célula cortou (change celulas-numa-linha): lido antes de a tabela assentar, ele
    // aparece só com o nome cortado, sem o IP, e a tentativa só vale com o IP nele.
    const nome = linha(page, 'PAT-00412').getByText('HP LaserJet M404');
    const resumo = page.getByRole('tooltip');
    await expect(async () => {
      await page.mouse.move(0, 0);
      await nome.hover();
      await page.clock.fastForward(1_500);
      await expect(resumo).toContainText('IP', { timeout: 4_000 });
    }).toPass({ timeout: 15_000 });
    await expect(resumo).toContainText('10.0.0.5');
    await expect(resumo).not.toContainText('PAT-00412');
  });
});

// As visões no dock (spec visoes-de-tabela, "Visões fixadas no menu"; spec modulo-ativos, "Ativos
// no dock"; change visoes-no-dock).
test.describe('quem leva as visões ao dock', () => {
  test('fixa uma visão no menu e a abre pelo dock, e abre as impressoras pelo tipo no menu', async ({
    page,
  }) => {
    const api = await simularAtivos(page);
    await page.goto('/ativos?visao=fabrica&ordem=-ativo.patrimonio');
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Todos os ativos, do link');
    await noMenuDaVisao(page, 'Salvar como nova visão…');
    const dialogo = page.getByRole('dialog', { name: 'Salvar como nova visão' });
    await dialogo.getByRole('textbox', { name: 'Nome' }).fill('Impressoras recentes');
    await dialogo.getByRole('button', { name: 'Salvar visão' }).click();
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Impressoras recentes');
    const [criada] = api.visoes;
    await noMenuDaVisao(page, 'Fixar no menu');
    await expect(avisos(page).getByText('Visão fixada no menu.')).toBeVisible();

    // Noutro módulo, a visão está no menu do Ativos no dock, depois dos tipos.
    await dock(page).getByRole('button', { name: 'Início' }).click();
    await expect(titulo(page, 'O que resolver agora')).toBeVisible();
    const ativos = dock(page).getByRole('button', { name: 'Ativos', exact: true });
    await ativos.focus();
    await page.keyboard.press('ArrowUp');
    const menu = page.getByRole('menu', { name: 'Ativos', exact: true });
    await expect(menu.getByRole('menuitem', { name: 'Todos os ativos' })).toBeFocused();
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Todos os ativos',
      'Impressora',
      'Impressoras recentes',
    ]);
    await menu.getByRole('menuitem', { name: 'Impressoras recentes' }).click();
    await expect(page).toHaveURL(new RegExp(`/ativos\\?visao=${criada?.id}$`));
    await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Impressoras recentes');

    // "Ativos › Impressora" abre a tabela com a origem do tipo, com o menu da escolha anterior já
    // fechado.
    await expect(page.getByRole('menu')).toHaveCount(0);
    await ativos.focus();
    await page.keyboard.press('ArrowUp');
    await expect(menu.getByRole('menuitem', { name: 'Todos os ativos' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Impressora', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => parametro(page, 'origem')).toBe(`tipo:${IDS_DO_CATALOGO.impressora}`);
    await expect(page.getByRole('group', { name: 'Origem da tabela' })).toContainText(
      'Ativos do tipo Impressora',
    );
  });
});

test('desligado na seção Módulos, o Ativos some do dock, e o endereço dele diz que está desligado', async ({
  page,
  servidor,
}) => {
  await simularAtivos(page);
  await page.goto('/administracao/modulos');
  await expect(titulo(page, 'Módulos')).toBeVisible();
  await expect(dock(page).getByRole('button', { name: 'Ativos', exact: true })).toBeVisible();
  await page
    .locator('label')
    .filter({ has: page.getByRole('switch', { name: 'Ativos Ligado' }) })
    .click();
  const confirmacao = page.getByRole('alertdialog', { name: 'Desligar o módulo Ativos?' });
  await expect(confirmacao).toContainText(
    'O módulo Ativos some do dock e da busca de todos, e os dados dele ficam guardados.',
  );
  await confirmacao.getByRole('button', { name: 'Desligar o módulo' }).click();
  await expect(avisos(page).getByText('Módulo desligado.')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Ativos Desligado' })).not.toBeChecked();
  await expect(dock(page).getByRole('button', { name: 'Ativos', exact: true })).toHaveCount(0);
  expect(servidor.modulosDesligados).toEqual(['ativos']);

  await page.goto('/ativos');
  await expect(titulo(page, 'Ativos')).toBeVisible();
  await expect(page.getByText('O módulo Ativos está desligado nesta organização.')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir Módulos' }).click();
  await expect(page).toHaveURL(/\/administracao\/modulos$/);
  await page
    .locator('label')
    .filter({ has: page.getByRole('switch', { name: 'Ativos Desligado' }) })
    .click();
  await expect(avisos(page).getByText('Módulo ligado.')).toBeVisible();
  await expect(dock(page).getByRole('button', { name: 'Ativos', exact: true })).toBeVisible();
});
