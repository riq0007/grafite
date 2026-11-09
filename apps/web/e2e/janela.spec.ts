import type { Page } from '@playwright/test';
import { IDS_DOS_ATIVOS, simularAtivos } from './api-dos-ativos.ts';
import { abrirCartao, abrirEtapa } from './etapas.ts';
import { expect, test } from './fixtures.ts';

// Specs estrutura-da-casca ("Janela de conteúdo") e dock ("Posição e tamanho"), com a web
// compilada e a API simulada (change janela-rolavel-e-campos-em-colunas): a janela termina antes
// do dock e rola por dentro, e a tela nova abre no começo.

const HP = `/ativos/${IDS_DOS_ATIVOS.daExpedicao}`;
const dock = (pagina: Page) => pagina.getByRole('navigation', { name: 'Dock' });
const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });
/** A área que rola, dentro da janela. */
const areaQueRola = (pagina: Page) =>
  pagina.getByRole('main').locator(':scope > [data-rolagem-da-janela]');
const rolagem = (pagina: Page) => areaQueRola(pagina).evaluate((area) => area.scrollTop);

test('"Ir para o conteúdo" leva o foco à área que rola, e o PageDown rola o conteúdo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await simularAtivos(page);
  await page.goto(HP);
  await expect(titulo(page, /HP LaserJet M404/)).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Ir para o conteúdo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(areaQueRola(page)).toBeFocused();
  expect(await rolagem(page)).toBe(0);
  await page.keyboard.press('PageDown');
  await expect.poll(() => rolagem(page)).toBeGreaterThan(0);
  // A página não rola: só a área dentro da janela.
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
});

test('a tabela dos ativos vai até o fim da área que rola, sem a área rolar', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await simularAtivos(page);
  await page.goto('/ativos');
  await expect(page.getByRole('grid', { name: 'Ativos', exact: true })).toBeVisible();

  const medidas = () =>
    page.evaluate(() => {
      const area = document.querySelector('main > [data-rolagem-da-janela]') as HTMLElement;
      const estilo = getComputedStyle(area);
      const fimDaArea =
        area.getBoundingClientRect().bottom -
        Number.parseFloat(estilo.borderBottomWidth) -
        Number.parseFloat(estilo.paddingBottom);
      // O elemento a que a tabela deu a altura até o fim.
      let medido = document.querySelector('[role="grid"][aria-label="Ativos"]') as HTMLElement;
      while (medido.parentElement && !medido.style.height) medido = medido.parentElement;
      return {
        sobra: Math.abs(fimDaArea - medido.getBoundingClientRect().bottom),
        rola: area.scrollHeight > area.clientHeight + 1,
      };
    });
  await expect.poll(async () => (await medidas()).sobra).toBeLessThanOrEqual(1);
  expect((await medidas()).rola).toBe(false);
});

test('a ficha rolada até o fim, e Ajustes no dock abre no começo, com o foco no título', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await simularAtivos(page);
  await page.goto(HP);
  await expect(titulo(page, /HP LaserJet M404/)).toBeVisible();
  await areaQueRola(page).evaluate((area) => {
    area.scrollTop = area.scrollHeight;
  });
  await expect.poll(() => rolagem(page)).toBeGreaterThan(0);

  await dock(page).getByRole('button', { name: 'Ajustes' }).click();
  await expect(titulo(page, 'Aparência')).toBeFocused();
  await expect.poll(() => rolagem(page)).toBe(0);
});

/**
 * Escolhe uma opção de uma seleção, como o usuário: o nome do botão termina pelo rótulo, e só ele
 * abre uma lista.
 */
async function selecionar(pagina: Page, rotulo: string, opcao: string) {
  await pagina
    .getByRole('button', { name: new RegExp(`${rotulo}$`) })
    .and(pagina.locator('[aria-haspopup="listbox"]'))
    .click();
  await pagina.getByRole('option', { name: opcao, exact: true }).click();
}

/** A caixa de um campo de texto da etapa, pelo rótulo. */
const caixa = async (pagina: Page, rotulo: string) => {
  const medida = await pagina.getByRole('textbox', { name: rotulo, exact: true }).boundingBox();
  if (!medida) throw new Error(`O campo ${rotulo} não está à vista.`);
  return medida;
};

/** Os campos de texto da etapa Administrativo, na ordem dela. */
const ADMINISTRATIVO = ['Nota fiscal', 'Valor de compra', 'Contrato', 'Custo mensal'];

/** Abre a etapa Administrativo do cadastro de uma impressora. */
async function cadastroNoAdministrativo(pagina: Page) {
  await pagina.goto('/ativos/novo');
  await expect(titulo(pagina, 'Novo ativo')).toBeVisible();
  await selecionar(pagina, 'Tipo do ativo', 'Impressora');
  await abrirEtapa(pagina, 'Administrativo');
}

/** Contrato e Custo mensal lado a lado, depois da Nota fiscal, numa linha de cima. */
async function conferirLadoALado(pagina: Page) {
  const notaFiscal = await caixa(pagina, 'Nota fiscal');
  const contrato = await caixa(pagina, 'Contrato');
  const custo = await caixa(pagina, 'Custo mensal');
  expect(Math.abs(custo.y - contrato.y)).toBeLessThanOrEqual(1);
  expect(custo.x).toBeGreaterThan(contrato.x + contrato.width);
  expect(notaFiscal.y + notaFiscal.height).toBeLessThan(contrato.y);
}

test.describe('os campos em colunas', () => {
  test('no cadastro numa janela de 1366 px, os campos da etapa ficam lado a lado, linha por linha', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await simularAtivos(page);
    await cadastroNoAdministrativo(page);
    await conferirLadoALado(page);
  });

  test('no cadastro numa janela de 390 px, os campos ficam um embaixo do outro', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await simularAtivos(page);
    await cadastroNoAdministrativo(page);
    const caixas = await Promise.all(ADMINISTRATIVO.map((rotulo) => caixa(page, rotulo)));
    for (const [indice, atual] of caixas.entries()) {
      const anterior = caixas[indice - 1];
      if (anterior) expect(atual.y).toBeGreaterThan(anterior.y + anterior.height);
    }
  });

  test('no cadastro numa janela de 1920 px, a área dos campos não passa de 960 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await simularAtivos(page);
    await cadastroNoAdministrativo(page);
    const caixas = await Promise.all(ADMINISTRATIVO.map((rotulo) => caixa(page, rotulo)));
    const esquerda = Math.min(...caixas.map((medida) => medida.x));
    const direita = Math.max(...caixas.map((medida) => medida.x + medida.width));
    expect(direita - esquerda).toBeLessThanOrEqual(960);
    // O limite não vale para o cadastro inteiro: a lista das etapas e a imagem ficam fora dele, e
    // os campos passam dos 960 px contados do começo do conteúdo.
    const comeco = await areaQueRola(page).evaluate(
      (area) =>
        area.getBoundingClientRect().left +
        area.clientLeft +
        Number.parseFloat(getComputedStyle(area).paddingLeft),
    );
    expect(direita).toBeGreaterThan(comeco + 960);
  });

  test('na ficha numa janela de 1366 px, os campos do cartão ficam lado a lado, como no cadastro', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await simularAtivos(page);
    await page.goto(HP);
    await abrirCartao(page, 'Administrativo');
    await conferirLadoALado(page);
  });
});

test.describe('o título do Novo ativo', () => {
  test('sai da vista com a aba "Novo modelo" aberta, continua achado pelo papel, e volta depois de fechá-la', async ({
    page,
  }) => {
    await simularAtivos(page);
    await page.goto('/ativos/novo');
    const tituloDoCadastro = titulo(page, 'Novo ativo');
    await expect(tituloDoCadastro).toBeVisible();
    const altura = async () => (await tituloDoCadastro.boundingBox())?.height ?? 0;
    expect(await altura()).toBeGreaterThan(1);

    await selecionar(page, 'Tipo do ativo', 'Impressora');
    await abrirEtapa(page, 'Modelo');
    await page.getByRole('button', { name: 'Cadastrar novo modelo' }).click();
    await expect(titulo(page, 'Novo modelo')).toBeFocused();
    await page.getByRole('tab', { name: 'Novo ativo' }).click();
    await expect(tituloDoCadastro).toHaveCount(1);
    await expect.poll(altura).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'Fechar Novo modelo' }).click();
    await expect(page.getByRole('tablist', { name: 'Abas da janela' })).toHaveCount(0);
    await expect.poll(altura).toBeGreaterThan(1);
  });
});

/** A caixa de um elemento à vista: o elemento fora da página reprova o teste. */
async function caixaDe(elemento: ReturnType<Page['locator']>) {
  const medida = await elemento.boundingBox();
  if (!medida) throw new Error('O elemento não está à vista.');
  return medida;
}

test.describe('a janela acima do dock', () => {
  test('com a etapa mais alta que a janela, nada fica sob o dock, e o esmaecimento segue a rolagem', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await simularAtivos(page);
    await cadastroNoAdministrativo(page);
    // A etapa abre pela lista, e o clique rola até ela: o teste começa do topo da área.
    const area = areaQueRola(page);
    await area.evaluate((elemento) => {
      elemento.scrollTop = 0;
    });
    await expect(area).toHaveAttribute('data-mais-abaixo', '');
    await expect(area).not.toHaveAttribute('data-mais-acima');

    const janela = await caixaDe(page.getByRole('main'));
    const caixaDoDock = await caixaDe(dock(page));
    expect(janela.y + janela.height).toBeLessThanOrEqual(caixaDoDock.y);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      480,
    );
    // O último campo da etapa fica além da borda de baixo da janela, e não sob o dock.
    const vidaUtil = await caixaDe(page.getByRole('textbox', { name: 'Vida útil (meses)' }));
    expect(vidaUtil.y).toBeGreaterThan(janela.y + janela.height);

    await area.evaluate((elemento) => {
      elemento.scrollTop = elemento.scrollHeight;
    });
    await expect(area).not.toHaveAttribute('data-mais-abaixo');
    await expect(area).toHaveAttribute('data-mais-acima', '');
    const noFim = await caixaDe(page.getByRole('textbox', { name: 'Vida útil (meses)' }));
    expect(noFim.y + noFim.height).toBeLessThanOrEqual(janela.y + janela.height);
  });

  test('a aba do ativo volta no mesmo ponto da rolagem depois do Novo fornecedor', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await simularAtivos(page, { fornecedores: true });
    await cadastroNoAdministrativo(page);
    await areaQueRola(page).evaluate((elemento) => {
      elemento.scrollTop = 40;
    });
    await expect.poll(() => rolagem(page)).toBe(40);

    await page.getByRole('button', { name: 'Cadastrar novo fornecedor' }).click();
    await expect(titulo(page, 'Novo fornecedor')).toBeFocused();
    await expect.poll(() => rolagem(page)).toBe(0);

    await page.getByRole('tab', { name: 'Novo ativo' }).click();
    await expect.poll(() => rolagem(page)).toBe(40);
    await expect(page.getByRole('combobox', { name: 'Fornecedor' })).toBeInViewport();
  });
});
