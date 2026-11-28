import { expect, type Page, test } from '@playwright/test';
import {
  type Aparencia,
  abrirATela,
  animacoes,
  type Estado,
  esperarOMovimento,
  estado,
  gravarAsAnimacoes,
  JANELA,
  ultimaForma,
} from './aparencia.ts';
import { chamadasDe, emitir } from './tauri.ts';

// O aviso e o movimento (change aba-dos-colaboradores, tarefa 5.5; spec "Aviso da resposta nova" e
// "Movimento da aba"; mockups m02, m04, m05 e m06): a aba que alarga e diz quem respondeu, o ponto
// que pulsa uma vez, a linha da resposta no painel de 372 px, o abrir, a cascata e o fechar.

test.use({ viewport: JANELA, timezoneId: 'America/Sao_Paulo' });

const ANA = {
  quem: 'Ana Souza',
  numero: 1041,
  titulo: 'Sem acesso à pasta do Financeiro',
  momento: '2026-11-11T12:21:00.000Z',
};
const COM_A_RESPOSTA: Partial<Estado> = {
  naoLidas: 4,
  respostasNovas: 1,
  porVer: { quantas: 1, ultima: ANA },
};
// As curvas como o token as escreve: a padrão e a de saída.
const PADRAO = expect.stringMatching(/^cubic-bezier\(0?\.2, 0?\.8, 0?\.2, 1\)$/);
const SAIDA = expect.stringMatching(/^cubic-bezier\(0?\.4, 0, 1, 1\)$/);

/** As animações do ponto que pulsa, no ::after dele. */
function pulsos(page: Page) {
  return page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animacao) => (animacao.effect as KeyframeEffect).pseudoElement === '::after')
        .map((animacao) => animacao.effect?.getTiming().duration).length,
  );
}

async function abrirComOAviso(page: Page, aparencia: Partial<Aparencia> = {}) {
  const aba = await abrirATela(page, { aparencia, estado: COM_A_RESPOSTA });
  await expect(aba).toHaveAccessibleName('Suporte da TI: 1 resposta nova · Ana Souza');
  return aba;
}

async function abrirOPainel(page: Page, aparencia: Partial<Aparencia> = {}) {
  const aba = await abrirComOAviso(page, aparencia);
  await aba.click();
  const painel = page.getByRole('dialog', { name: 'Suporte da TI' });
  await expect(painel).toBeVisible();
  await esperarOMovimento(page);
  return painel;
}

const linha = (page: Page) => page.getByRole('button', { name: /^Ana Souza respondeu/ });

test('com uma resposta por ver, a aba alarga e diz quem respondeu, com o ponto', async ({
  page,
}) => {
  const aba = await abrirComOAviso(page);
  await expect(aba).toContainText('1 resposta nova · Ana Souza');
  await expect.poll(() => pulsos(page)).toBe(1);
  await esperarOMovimento(page);
  const caixa = await aba.boundingBox();
  expect(caixa?.width).toBeGreaterThan(200);
  expect(caixa?.width).toBeLessThanOrEqual(280);
  expect(caixa?.height).toBe(34);
  // O pulso acaba aos 1.400 ms, e o ponto fica parado, sem o anel.
  expect(await pulsos(page)).toBe(0);
  // A forma informada acompanha a largura do aviso.
  await expect
    .poll(async () => Math.round((await ultimaForma(page))?.largura ?? 0))
    .toBe(Math.round(caixa?.width ?? 0));
});

test('a resposta que chega alarga a aba em 180 ms, e o texto entra aos 60 ms', async ({ page }) => {
  await gravarAsAnimacoes(page);
  const aba = await abrirATela(page);
  await emitir(page, 'estado-mudou', estado(COM_A_RESPOSTA));
  await expect(aba).toHaveAccessibleName('Suporte da TI: 1 resposta nova · Ana Souza');
  const alargar = (await animacoes(page)).find(
    (animacao) => animacao.quadros[0]?.width === '162px',
  );
  expect(alargar).toMatchObject({ duracao: 180, curva: PADRAO });
  const texto = aba.getByText('1 resposta nova', { exact: true });
  await expect(texto.locator('..')).toHaveCSS('animation-delay', '0.06s');
});

test('com mais de uma, o aviso conta os chamados e tira o nome', async ({ page }) => {
  const aba = await abrirATela(page, {
    estado: { porVer: { quantas: 3, ultima: ANA }, respostasNovas: 3 },
  });
  await expect(aba).toHaveAccessibleName('Suporte da TI: 3 respostas novas');
  await expect(aba).not.toContainText('Ana Souza');
});

test('o nome comprido é cortado com reticências, e o aviso não passa de 280 px', async ({
  page,
}) => {
  const aba = await abrirATela(page, {
    estado: {
      porVer: {
        quantas: 1,
        ultima: { ...ANA, quem: 'Maria Aparecida dos Santos Figueiredo de Albuquerque' },
      },
    },
  });
  await esperarOMovimento(page);
  expect((await aba.boundingBox())?.width).toBeLessThanOrEqual(280);
  const cortado = await aba.evaluate((elemento) =>
    [...elemento.querySelectorAll('span')].some(
      (parte) =>
        getComputedStyle(parte).textOverflow === 'ellipsis' &&
        parte.scrollWidth > parte.clientWidth,
    ),
  );
  expect(cortado).toBe(true);
});

test('aberta, a linha da resposta fica no alto, e o painel tem 372 px', async ({ page }) => {
  const painel = await abrirOPainel(page);
  await expect(linha(page)).toHaveAccessibleName(
    'Ana Souza respondeu #1041 · Sem acesso à pasta do Financeiro 09:21',
  );
  expect((await painel.boundingBox())?.width).toBe(372);
  const daLinha = await linha(page).boundingBox();
  const daLarga = await page.getByRole('button', { name: 'Abrir chamado' }).boundingBox();
  expect(daLinha?.y ?? 0).toBeLessThan(daLarga?.y ?? 0);
  await expect(page.getByRole('button', { name: 'Abrir chat 4 não lidas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visualizar chamados 1 nova' })).toBeVisible();
  // O foco continua em "Abrir chamado"; a seta para cima leva à linha.
  await expect(page.getByRole('button', { name: 'Abrir chamado' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(linha(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => chamadasDe(page, 'abrir_tela_maior'))
    .toEqual([{ destino: 'chamado', numero: 1041 }]);
});

test('na tela de 1366, o painel com a linha tem 300 px', async ({ page }) => {
  const painel = await abrirOPainel(page, { tela: { largura: 1366, altura: 768 } });
  expect((await painel.boundingBox())?.width).toBe(300);
});

test('lida com o painel aberto, a linha sai, e o painel fica com 372 px até fechar', async ({
  page,
}) => {
  const painel = await abrirOPainel(page);
  await page.keyboard.press('ArrowUp');
  await expect(linha(page)).toBeFocused();
  await emitir(page, 'estado-mudou', estado({ naoLidas: 4, respostasNovas: 1 }));
  await expect(linha(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir chamado' })).toBeFocused();
  expect((await painel.boundingBox())?.width).toBe(372);
  // "1 nova" fica até a pessoa responder ou marcar como vista, e as não lidas são do chat.
  await expect(page.getByRole('button', { name: 'Visualizar chamados 1 nova' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir chat 4 não lidas' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
  const aba = page.getByRole('button', { name: 'Suporte da TI' });
  await expect(aba).toHaveAccessibleName('Suporte da TI');
  await page.mouse.move(0, JANELA.height - 1);
  await esperarOMovimento(page);
  expect((await aba.boundingBox())?.width).toBe(162);
});

test('o abrir cresce da aba em 220 ms, com o logo aos 60 ms e a cascata até os 340 ms', async ({
  page,
}) => {
  await gravarAsAnimacoes(page);
  const aba = await abrirATela(page);
  await aba.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const [abrir] = await animacoes(page);
  expect(abrir).toMatchObject({ duracao: 220, curva: PADRAO });
  expect(abrir?.quadros[0]).toMatchObject({ width: '162px', height: '34px', borderRadius: '17px' });
  expect(abrir?.quadros[1]).toMatchObject({ width: '293px', borderRadius: '28px' });

  const logo = page.getByRole('img', { name: 'Grafite' }).locator('..');
  await expect(logo).toHaveCSS('animation-delay', '0.06s');
  await expect(logo).toHaveCSS('animation-duration', '0.14s');
  const atrasos = [];
  for (const nome of ['Abrir chamado', 'Abrir chat', 'Visualizar chamados']) {
    atrasos.push(
      await page
        .getByRole('button', { name: nome })
        .evaluate((botao) => getComputedStyle(botao).animationDelay),
    );
  }
  expect(atrasos).toEqual(['0.12s', '0.16s', '0.2s']);

  await esperarOMovimento(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  const fechar = (await animacoes(page)).at(-1);
  expect(fechar).toMatchObject({ duracao: 160, curva: SAIDA });
  expect(fechar?.quadros[1]).toMatchObject({ width: '162px', height: '34px' });
});

test('no entalhe, a ilha cresce com o raio e o encaixe', async ({ page }) => {
  await gravarAsAnimacoes(page);
  const aba = await abrirATela(page, { aparencia: { forma: 'entalhe' } });
  await aba.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const [abrir] = await animacoes(page);
  expect(abrir?.quadros[0]).toMatchObject({
    width: '184px',
    height: '32px',
    borderRadius: '0px 0px 16px 16px',
    '--encaixe': '14px',
  });
  expect(abrir?.quadros[1]).toMatchObject({
    width: '293px',
    borderRadius: '0px 0px 32px 32px',
    '--encaixe': '18px',
  });
});

test('o ponto pulsa só na chegada, e não de novo ao fechar o painel', async ({ page }) => {
  const aba = await abrirComOAviso(page);
  await expect.poll(() => pulsos(page)).toBe(1);
  await aba.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await esperarOMovimento(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(aba).toHaveAccessibleName('Suporte da TI: 1 resposta nova · Ana Souza');
  expect(await pulsos(page)).toBe(0);

  // Uma resposta nova pulsa de novo.
  await emitir(
    page,
    'estado-mudou',
    estado({
      porVer: { quantas: 2, ultima: { ...ANA, numero: 1042, momento: '2026-11-11T12:30:00.000Z' } },
    }),
  );
  await expect(aba).toHaveAccessibleName('Suporte da TI: 2 respostas novas');
  await expect.poll(() => pulsos(page)).toBe(1);
});

test('sem animações no Windows, tudo leva 1 ms, e o ponto fica parado com o anel', async ({
  page,
}) => {
  const aba = await abrirATela(page, {
    aparencia: { movimentoReduzido: true },
    estado: COM_A_RESPOSTA,
  });
  await expect(aba).toHaveAccessibleName('Suporte da TI: 1 resposta nova · Ana Souza');
  expect(await pulsos(page)).toBe(0);
  const anel = await aba.evaluate((elemento) => {
    const ponto = [...elemento.querySelectorAll('span')].find(
      (parte) => getComputedStyle(parte, '::after').content !== 'none',
    );
    return ponto ? getComputedStyle(ponto, '::after').opacity : null;
  });
  expect(anel).toBe('0.45');

  await aba.click();
  const larga = page.getByRole('button', { name: 'Abrir chamado' });
  await expect(larga).toHaveCSS('animation-duration', '0.001s');
  await expect(larga).toHaveCSS('animation-delay', '0s');
});

test.describe('as referências visuais', () => {
  test.skip(
    process.platform !== 'win32',
    'A aba é do Windows, e as referências são gravadas nele.',
  );

  for (const forma of ['pilula', 'entalhe'] as const) {
    test(`a aba fechada com o aviso, na forma ${forma}`, async ({ page }) => {
      await abrirComOAviso(page, { forma });
      await page.mouse.move(0, JANELA.height - 1);
      await esperarOMovimento(page);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`aviso-${forma}.png`, { omitBackground: true });
    });
  }

  for (const [nome, aparencia] of [
    ['painel-com-a-resposta', {}],
    ['ilha-com-a-resposta-no-claro', { forma: 'entalhe', tema: 'claro' }],
    ['painel-com-a-resposta-no-alto-contraste', { tema: 'alto-contraste' }],
    ['painel-com-a-resposta-1366', { tela: { largura: 1366, altura: 768 } }],
  ] as const) {
    test(`o ${nome}`, async ({ page }) => {
      await abrirOPainel(page, aparencia);
      await page.mouse.move(0, JANELA.height - 1);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${nome}.png`, { omitBackground: true });
    });
  }
});
