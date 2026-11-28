import { expect, type Page, test } from '@playwright/test';
import {
  type Aparencia,
  abrirATela,
  type Estado,
  estado,
  JANELA,
  ultimaForma,
} from './aparencia.ts';
import { chamadasDe, emitir } from './tauri.ts';

// O painel aberto e o teclado (change aba-dos-colaboradores, tarefa 5.4; spec "Aba aberta" e "Aba
// pelo teclado"): o painel 2+1 com o logo e os números, o "Sair" da entrada pela senha, as setas, o
// Enter e o Esc dentro dele.

test.use({ viewport: JANELA });

async function abrirOPainel(
  page: Page,
  mudanca: { aparencia?: Partial<Aparencia>; estado?: Partial<Estado> } = {},
) {
  const aba = await abrirATela(page, mudanca);
  await aba.click();
  const painel = page.getByRole('dialog', { name: 'Suporte da TI' });
  await expect(painel).toBeVisible();
  return painel;
}

const opcao = (page: Page, nome: string | RegExp) => page.getByRole('button', { name: nome });

test('o painel abre com o logo e a grade 2+1, com 293 px de largura e o foco em "Abrir chamado"', async ({
  page,
}) => {
  const painel = await abrirOPainel(page);
  await expect(page.getByRole('button', { name: 'Suporte da TI' })).toHaveCount(0);
  await expect(painel.getByRole('img', { name: 'Grafite' })).toBeVisible();
  const larga = opcao(page, 'Abrir chamado');
  await expect(larga).toBeFocused();
  await expect(opcao(page, 'Abrir chat')).toBeVisible();
  await expect(opcao(page, 'Visualizar chamados')).toBeVisible();

  const caixa = await painel.boundingBox();
  expect(caixa?.width).toBe(293);
  expect(caixa?.y).toBe(8);
  expect((await larga.boundingBox())?.width).toBe(262);
  expect((await opcao(page, 'Abrir chat').boundingBox())?.height).toBe(108);
  // O painel é a forma: o clique passa fora dele.
  await expect
    .poll(() => ultimaForma(page))
    .toMatchObject({
      y: 8,
      largura: 293,
      raioDeCima: 28,
      raioDeBaixo: 28,
    });
});

test('os números: as não lidas do chat e as respostas novas dos chamados', async ({ page }) => {
  await abrirOPainel(page, { estado: { naoLidas: 4, respostasNovas: 1 } });
  await expect(opcao(page, 'Abrir chat 4 não lidas')).toBeVisible();
  await expect(opcao(page, 'Visualizar chamados 1 nova')).toBeVisible();

  await emitir(page, 'estado-mudou', estado({ naoLidas: 1, respostasNovas: 2 }));
  await expect(opcao(page, 'Abrir chat 1 não lida')).toBeVisible();
  await expect(opcao(page, 'Visualizar chamados 2 novas')).toBeVisible();

  await emitir(page, 'estado-mudou', estado());
  await expect(opcao(page, /^Abrir chat$/)).toBeVisible();
  await expect(opcao(page, /^Visualizar chamados$/)).toBeVisible();
});

test('pelo atalho: o foco em "Abrir chamado", as setas andam pela grade e o Enter escolhe', async ({
  page,
}) => {
  await abrirATela(page);
  await emitir(page, 'atalho', null);
  const larga = opcao(page, 'Abrir chamado');
  await expect(larga).toBeFocused();
  // O anel do foco aparece também no foco dado pelo atalho.
  await expect(larga).toHaveCSS('box-shadow', /rgb\(244, 251, 255\) 0px 0px 0px 5px/);

  await page.keyboard.press('ArrowDown');
  await expect(opcao(page, 'Abrir chat')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(opcao(page, 'Visualizar chamados')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(opcao(page, 'Visualizar chamados')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(larga).toBeFocused();
  await page.keyboard.press('End');
  await expect(opcao(page, 'Visualizar chamados')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(larga).toBeFocused();

  // O Tab dá a volta nas três.
  await page.keyboard.press('Shift+Tab');
  await expect(opcao(page, 'Visualizar chamados')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(larga).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => chamadasDe(page, 'abrir_tela_maior'))
    .toEqual([{ destino: 'abrir-chat' }]);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press(' ');
  await expect
    .poll(() => chamadasDe(page, 'abrir_tela_maior'))
    .toEqual([{ destino: 'abrir-chat' }, { destino: 'abrir-chamado' }]);
});

test('o atalho com o painel aberto leva o foco de volta a "Abrir chamado"', async ({ page }) => {
  await abrirOPainel(page);
  await page.keyboard.press('ArrowDown');
  await expect(opcao(page, 'Abrir chat')).toBeFocused();
  await emitir(page, 'atalho', null);
  await expect(opcao(page, 'Abrir chamado')).toBeFocused();
});

test('o Esc fecha o painel, devolve o foco à janela de antes e volta à forma da aba fechada', async ({
  page,
}) => {
  const painel = await abrirOPainel(page);
  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
  const aba = page.getByRole('button', { name: 'Suporte da TI' });
  await expect(aba).toBeFocused();
  await expect.poll(() => chamadasDe(page, 'devolver_o_foco')).toHaveLength(1);
  await expect.poll(() => ultimaForma(page)).toMatchObject({ largura: 162, altura: 34 });
});

test('outra janela com o foco, ou o clique fora, fecha o painel', async ({ page }) => {
  const painel = await abrirOPainel(page);
  await emitir(page, 'fechar-o-painel', null);
  await expect(painel).toBeHidden();
  await expect(page.getByRole('button', { name: 'Suporte da TI' })).toBeVisible();
  expect(await chamadasDe(page, 'devolver_o_foco')).toEqual([]);
});

test('na entrada pela senha, o painel mostra quem está na aba, com "Sair"', async ({ page }) => {
  await abrirOPainel(page, { estado: { pessoa: { nome: 'Carla Dias', pelaSenha: true } } });
  await expect(page.getByText('Carla Dias')).toBeVisible();
  const botaoSair = opcao(page, 'Sair');
  await page.keyboard.press('End');
  await expect(botaoSair).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(opcao(page, 'Abrir chamado')).toBeFocused();
  await botaoSair.click();
  await expect.poll(() => chamadasDe(page, 'sair')).toHaveLength(1);
});

test('pelo Windows, o painel não mostra o "Sair"', async ({ page }) => {
  await abrirOPainel(page);
  await expect(page.getByText('Fernanda Rocha')).toHaveCount(0);
  await expect(opcao(page, 'Sair')).toHaveCount(0);
});

test('com o atalho em outro programa, o painel diz', async ({ page }) => {
  await abrirOPainel(page, { estado: { atalhoOcupado: true } });
  await expect(page.getByText('O atalho Ctrl+Alt+T está com outro programa.')).toBeVisible();
});

test('na tela de 1366, o painel tem 225 px de largura, com as opções de 96 px', async ({
  page,
}) => {
  const painel = await abrirOPainel(page, { aparencia: { tela: { largura: 1366, altura: 768 } } });
  const caixa = await painel.boundingBox();
  expect(caixa?.width).toBe(225);
  // 247 com o fio de 1,5 px; na tela de escala 1, ele arredonda para 1 px.
  expect(Math.abs((caixa?.height ?? 0) - 247)).toBeLessThanOrEqual(1);
  expect(caixa?.y).toBe(36);
  expect((await opcao(page, 'Abrir chamado').boundingBox())?.width).toBe(198);
  expect((await opcao(page, 'Abrir chat').boundingBox())?.width).toBe(96);
});

test('no entalhe, o painel é a ilha presa à borda de cima', async ({ page }) => {
  const painel = await abrirOPainel(page, { aparencia: { forma: 'entalhe' } });
  const caixa = await painel.boundingBox();
  expect(caixa?.y).toBe(0);
  expect(caixa?.width).toBe(293);
  await expect
    .poll(() => ultimaForma(page))
    .toMatchObject({
      y: 0,
      largura: 293,
      raioDeCima: 0,
      raioDeBaixo: 32,
    });
});

test.describe('as referências visuais', () => {
  test.skip(
    process.platform !== 'win32',
    'A aba é do Windows, e as referências são gravadas nele.',
  );

  for (const tema of ['escuro', 'claro', 'alto-contraste'] as const) {
    test(`o painel aberto no tema ${tema}`, async ({ page }) => {
      await abrirOPainel(page, { aparencia: { tema }, estado: { naoLidas: 4, respostasNovas: 1 } });
      await page.mouse.move(0, JANELA.height - 1);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`painel-${tema}.png`, { omitBackground: true });
    });
  }

  test('a ilha do entalhe aberta, pelo teclado', async ({ page }) => {
    await abrirATela(page, { aparencia: { forma: 'entalhe' } });
    await emitir(page, 'atalho', null);
    await expect(opcao(page, 'Abrir chamado')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(opcao(page, 'Abrir chat')).toBeFocused();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('ilha-pelo-teclado.png', { omitBackground: true });
  });

  test('o painel na tela de 1366, com o "Sair"', async ({ page }) => {
    await abrirOPainel(page, {
      aparencia: { tela: { largura: 1366, altura: 768 } },
      estado: { pessoa: { nome: 'Carla Dias', pelaSenha: true } },
    });
    await page.mouse.move(0, JANELA.height - 1);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('painel-1366-pela-senha.png', { omitBackground: true });
  });
});
