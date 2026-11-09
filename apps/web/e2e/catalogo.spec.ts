import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { IDS_DO_CATALOGO, simularCatalogo } from './api-do-catalogo.ts';
import { simularAtivos } from './api-dos-ativos.ts';
import { expect, sessaoDe, test } from './fixtures.ts';

// Specs catalogo-de-ativos, campos-personalizados e modulo-ativos, com a web compilada e a API
// simulada.

const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });
const dock = (pagina: Page) => pagina.getByRole('navigation', { name: 'Dock' });
const secoes = (pagina: Page) => pagina.getByRole('navigation', { name: 'Seções do catálogo' });
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });

/** Uma imagem de impressora para enviar como imagem do modelo. */
const IMPRESSORA = fileURLToPath(new URL('./exemplos/impressora.svg', import.meta.url));

/** Escolhe uma opção de uma seleção, pelo botão dela, como o usuário. */
async function selecionar(pagina: Page, rotulo: string, opcao: string) {
  await pagina.getByRole('button', { name: new RegExp(rotulo) }).click();
  await pagina.getByRole('option', { name: opcao, exact: true }).click();
}

/** Marca uma opção, um rádio ou uma caixa, clicando no rótulo dela, como o usuário. */
const marcar = (pagina: Page, papel: 'radio' | 'checkbox', nome: string | RegExp) =>
  pagina
    .locator('label')
    .filter({ has: pagina.getByRole(papel, { name: nome, exact: typeof nome === 'string' }) })
    .click();

/** A sessão de "Bruno Costa", que só edita os modelos. */
const SO_MODELOS = sessaoDe({ usuario: 'bruno.costa', nome: 'Bruno Costa' }, [
  { chave: 'modelos.editar', organizacao: true, locais: [] },
]);

test.describe('quem cuida do catálogo', () => {
  test('o primeiro uso: sem tipos, o cadastro do ativo cadastra o tipo numa aba, que volta escolhido', async ({
    page,
  }) => {
    await simularAtivos(page, { vazio: true });
    await page.goto('/');
    await dock(page).getByRole('button', { name: 'Ativos', exact: true }).click();
    await expect(page).toHaveURL(/\/ativos\?visao=fabrica$/);
    await expect(page.getByText('Nenhum ativo encontrado.')).toBeVisible();
    await page.getByRole('button', { name: 'Novo ativo' }).first().click();
    await expect(page.getByText('Nenhum tipo de ativo ainda.')).toBeVisible();
    await page.getByRole('button', { name: 'Cadastrar novo tipo' }).click();
    await expect(titulo(page, 'Novo tipo')).toBeFocused();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Notebook');
    await marcar(page, 'radio', 'Computador');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByRole('tablist', { name: 'Abas da janela' })).toHaveCount(0);
    await expect(
      page
        .getByRole('button', { name: /Tipo do ativo$/ })
        .and(page.locator('[aria-haspopup="listbox"]')),
    ).toContainText('Notebook');
  });

  test('cadastra a lista com opções e o tipo com ela e o inventário de hardware', async ({
    page,
  }) => {
    const api = await simularCatalogo(page, { vazio: true });
    await page.goto('/gestao/catalogo/campos/novo');
    await expect(titulo(page, 'Novo campo')).toBeVisible();
    await page.getByRole('textbox', { name: 'Rótulo' }).fill('Criticidade');
    await selecionar(page, 'Tipo do campo', 'Lista');
    await page.getByRole('combobox', { name: 'Grupo' }).fill('Uso');
    for (const [posicao, opcao] of ['Média', 'Baixa', 'Alta'].entries()) {
      await page.getByRole('button', { name: 'Incluir opção' }).click();
      await page.getByRole('textbox', { name: `Opção ${posicao + 1}` }).fill(opcao);
    }
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(titulo(page, /Criticidade/)).toBeVisible();
    await expect(avisos(page).getByText('Campo cadastrado.')).toBeVisible();
    const [campo] = api.estado.campos;
    expect(campo?.configuracao.opcoes?.map((opcao) => opcao.rotulo)).toEqual([
      'Média',
      'Baixa',
      'Alta',
    ]);

    await secoes(page).getByRole('link', { name: 'Tipos' }).click();
    await page.getByRole('button', { name: 'Novo tipo' }).first().click();
    await expect(titulo(page, 'Novo tipo')).toBeVisible();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Computador');
    await marcar(page, 'radio', 'Computador');
    await marcar(page, 'checkbox', /^Inventário de hardware/);
    await page.getByRole('button', { name: 'Incluir Criticidade' }).click();
    await marcar(page, 'checkbox', 'Criticidade obrigatório');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();

    await expect(titulo(page, /Computador/)).toBeVisible();
    await expect(avisos(page).getByText('Tipo cadastrado.')).toBeVisible();
    expect(api.corposDe('POST /api/tipos-de-ativo')).toEqual([
      {
        nome: 'Computador',
        icone: 'computador',
        capacidades: ['hardware.inventario'],
        configuracaoDasCapacidades: {},
        campos: [{ campoId: campo?.id, obrigatorio: true }],
        primeiroCartao: null,
      },
    ]);
    // Os treze campos da capacidade aparecem no grupo dela, só para leitura (spec
    // catalogo-de-ativos, "Inventário ligado no computador").
    const daCapacidade = page.getByRole('list', { name: 'Campos do Inventário de hardware' });
    await expect(daCapacidade.getByRole('listitem')).toHaveCount(13);
    await expect(daCapacidade.getByRole('button')).toHaveCount(0);

    await secoes(page).getByRole('link', { name: 'Campos' }).click();
    await expect(page.getByRole('row', { name: /Criticidade/ })).toContainText('Usado por 1 tipo');
  });

  test('cadastra o modelo com o fabricante sugerido e a imagem, que aparece na lista', async ({
    page,
  }) => {
    const api = await simularCatalogo(page);
    await page.goto('/gestao/catalogo/modelos');
    await expect(page.getByRole('row', { name: /LaserJet M404/ })).toBeVisible();
    await page.getByRole('button', { name: 'Novo modelo' }).click();
    await expect(titulo(page, 'Novo modelo')).toBeVisible();
    await selecionar(page, 'Tipo', 'Impressora');
    await page.getByRole('combobox', { name: 'Fabricante' }).fill('hp');
    await page.getByRole('option', { name: 'HP', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Fabricante' })).toHaveValue('HP');
    await page.getByRole('textbox', { name: 'Modelo' }).fill('LaserJet M406');
    const seletor = page.waitForEvent('filechooser');
    await page
      .getByRole('group', { name: 'Imagem do modelo' })
      .getByRole('button', { name: 'Escolher imagem' })
      .click();
    await (await seletor).setFiles(IMPRESSORA);
    await expect(
      page.getByRole('group', { name: 'Imagem do modelo' }).locator('img'),
    ).toBeVisible();

    const envio = page.waitForRequest(
      (pedido) => pedido.method() === 'PUT' && /\/api\/modelos\/[^/]+\/imagem$/.test(pedido.url()),
    );
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    const pedido = await envio;
    expect(pedido.headers()['content-type']).toBe('application/octet-stream');
    await expect(titulo(page, /HP LaserJet M406/)).toBeVisible();
    await expect(avisos(page).getByText('Modelo cadastrado.')).toBeVisible();
    expect(api.corposDe('POST /api/modelos')).toEqual([
      { tipoId: IDS_DO_CATALOGO.impressora, fabricante: 'HP', nome: 'LaserJet M406' },
    ]);
    const novo = api.estado.modelos.find((modelo) => modelo.nome === 'LaserJet M406');
    expect(novo?.imagem).toBeTruthy();
    const naFicha = page.getByRole('group', { name: 'Imagem de HP LaserJet M406' }).locator('img');
    await expect(naFicha).toHaveAttribute(
      'src',
      `/api/modelos/${novo?.id}/imagem/${novo?.imagem?.id}/256`,
    );
    await expect
      .poll(() => naFicha.evaluate((imagem: HTMLImageElement) => imagem.naturalWidth))
      .toBeGreaterThan(0);

    await secoes(page).getByRole('link', { name: 'Modelos' }).click();
    await expect(page.getByRole('row', { name: /LaserJet M406/ }).locator('img')).toHaveAttribute(
      'src',
      `/api/modelos/${novo?.id}/imagem/${novo?.imagem?.id}/64`,
    );
    // A outra impressora, sem imagem, mostra o ícone do tipo.
    await expect(
      page.getByRole('row', { name: /LaserJet M404/ }).locator('svg.lucide-impressora'),
    ).toBeVisible();
  });

  // A Gestão de ativos no dock (spec modulo-gestao-de-ativos, "Gestão de ativos no dock").
  test('a Gestão de ativos no dock reúne o catálogo, as importações, o software e o Control iD', async ({
    page,
  }) => {
    await simularCatalogo(page);
    await page.goto('/');
    await expect(titulo(page, 'O que resolver agora')).toBeVisible();
    const gestao = dock(page).getByRole('button', { name: 'Gestão de ativos' });
    await gestao.focus();
    await page.keyboard.press('ArrowUp');
    const menu = page.getByRole('menu', { name: 'Gestão de ativos' });
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Catálogo',
      'Importações',
      'Software',
      'Control iD',
    ]);
    await expect(menu.getByRole('menuitem', { name: 'Catálogo' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    const catalogo = page.getByRole('menu', { name: 'Catálogo' });
    await expect(catalogo.getByRole('menuitem')).toHaveText(['Tipos', 'Campos', 'Modelos']);
    await catalogo.getByRole('menuitem', { name: 'Modelos' }).click();
    await expect(page).toHaveURL(/\/gestao\/catalogo\/modelos$/);
    await expect(secoes(page).getByRole('link', { name: 'Modelos' })).toBeVisible();
  });

  test('acha o modelo pela busca, com o tipo, e Enter abre a ficha', async ({ page }) => {
    await simularAtivos(page, { semAtivos: true });
    await page.goto('/');
    await expect(titulo(page, 'O que resolver agora')).toBeVisible();
    await page.keyboard.press('Control+k');
    await page.keyboard.type('M404');
    const busca = page.getByRole('dialog', { name: 'Busca' });
    const opcao = busca
      .getByRole('group', { name: 'Modelos' })
      .getByRole('option', { name: /HP LaserJet M404/ });
    await expect(opcao).toContainText('Impressora');
    // A seta escolhe o primeiro resultado, e o Enter o aciona.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/gestao/catalogo/modelos/${IDS_DO_CATALOGO.m404}$`));
    await expect(titulo(page, /HP LaserJet M404/)).toBeVisible();
  });
});

test.describe('quem só edita os modelos', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/sessao', (rota) =>
      rota.request().method() === 'GET' ? rota.fulfill({ json: SO_MODELOS }) : rota.fallback(),
    );
  });

  test('vê os tipos e os campos só para leitura, e cadastra modelos', async ({ page }) => {
    await simularCatalogo(page, { pode: { catalogo: false, modelos: true } });
    await page.goto('/');
    // Sem ativos.ver, o dock não tem o Ativos, e a Gestão de ativos leva aos tipos.
    await expect(dock(page).getByRole('button', { name: 'Ativos', exact: true })).toHaveCount(0);
    await dock(page).getByRole('button', { name: 'Gestão de ativos' }).click();
    await expect(page).toHaveURL(/\/gestao\/catalogo\/tipos$/);
    await expect(page.getByRole('row', { name: /Impressora/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Novo tipo' })).toHaveCount(0);
    await page.getByRole('row', { name: /Impressora/ }).click();
    await expect(titulo(page, /Impressora/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nome' })).toHaveAttribute('readonly', '');
    await expect(page.getByRole('button', { name: 'Salvar alterações' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Inativar' })).toHaveCount(0);

    await secoes(page).getByRole('link', { name: 'Campos' }).click();
    await expect(page.getByRole('row', { name: /Criticidade/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Novo campo' })).toHaveCount(0);

    await secoes(page).getByRole('link', { name: 'Modelos' }).click();
    await expect(page.getByRole('button', { name: 'Novo modelo' })).toBeVisible();
  });
});
