import { expect, type Page, test } from '@playwright/test';
import { type Aparencia, aparencia } from './aparencia.ts';
import { chamadasDe, emitir, simularOTauri } from './tauri.ts';

// A tela maior (change aba-dos-colaboradores, tarefa 5.6; spec "Tela maior da aba"; m08): a moldura,
// com a trilha e o "Esc volta", e a frase das duas opções que ainda não têm conteúdo, com "Abrir no
// chat". No chat, o corpo é o lugar do webview, que a moldura informa ao lado nativo.

const JANELA_DA_TELA_MAIOR = { width: 760, height: 560 };
test.use({ viewport: JANELA_DA_TELA_MAIOR });

interface Tela {
  destino: string;
  numero?: number;
}

async function abrirATelaMaior(page: Page, tela: Tela, mudanca: Partial<Aparencia> = {}) {
  await simularOTauri(page, {
    aparencia: aparencia(mudanca),
    tela_maior: tela,
    informar_forma: null,
    informar_corpo: null,
    fechar_tela_maior: null,
    abrir_tela_maior: null,
  });
  await page.goto('/maior.html');
  const moldura = page.getByRole('main');
  await expect(moldura).toBeVisible();
  return moldura;
}

const trilha = (page: Page) => page.getByRole('navigation', { name: 'Trilha' });

test('"Abrir chamado" mostra a trilha, o "Esc volta" e a frase, com o foco em "Abrir no chat"', async ({
  page,
}) => {
  await abrirATelaMaior(page, { destino: 'abrir-chamado' });
  await expect(trilha(page).getByRole('listitem')).toHaveText(['Aba', 'Abrir chamado']);
  await expect(trilha(page).getByText('Abrir chamado')).toHaveAttribute('aria-current', 'location');
  await expect(page.getByText('Esc volta')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Abrir chamado pela aba chega numa versão seguinte' }),
  ).toBeVisible();
  const noChat = page.getByRole('button', { name: 'Abrir no chat' });
  await expect(noChat).toBeFocused();
  await expect(page).toHaveTitle('Abrir chamado · Suporte da TI');
  // Sem o chat, o corpo não tem o lugar do webview.
  await expect.poll(() => chamadasDe(page, 'informar_corpo')).toEqual([{ retangulo: null }]);

  await noChat.click();
  await expect
    .poll(() => chamadasDe(page, 'abrir_tela_maior'))
    .toEqual([{ destino: 'abrir-chat' }]);
});

test('"Visualizar chamados" diz que a lista chega numa versão seguinte', async ({ page }) => {
  await abrirATelaMaior(page, { destino: 'visualizar-chamados' });
  await expect(trilha(page).getByRole('listitem')).toHaveText(['Aba', 'Visualizar chamados']);
  await expect(
    page.getByRole('heading', { name: 'A lista dos chamados pela aba chega numa versão seguinte' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir no chat' })).toBeVisible();
});

test('o Esc e o voltar fecham a tela maior', async ({ page }) => {
  await abrirATelaMaior(page, { destino: 'abrir-chamado' });
  await page.keyboard.press('Escape');
  await expect.poll(() => chamadasDe(page, 'fechar_tela_maior')).toHaveLength(1);
  const voltar = page.getByRole('button', { name: 'Voltar à aba' });
  await expect(voltar).toHaveAttribute('aria-keyshortcuts', 'Escape');
  await voltar.click();
  await expect.poll(() => chamadasDe(page, 'fechar_tela_maior')).toHaveLength(2);
});

test('no chat, o corpo é o lugar do webview, informado ao lado nativo', async ({ page }) => {
  const moldura = await abrirATelaMaior(page, { destino: 'abrir-chat' });
  await expect(trilha(page).getByRole('listitem')).toHaveText(['Aba', 'Abrir chat']);
  await expect(page.getByRole('heading')).toHaveCount(0);
  const lugar = page.locator('[data-chat]');
  const caixa = await lugar.boundingBox();
  await expect
    .poll(async () => (await chamadasDe(page, 'informar_corpo')).at(-1))
    .toEqual({
      retangulo: {
        x: Math.round(caixa?.x ?? 0),
        y: Math.round(caixa?.y ?? 0),
        largura: Math.round(caixa?.width ?? 0),
        altura: Math.round(caixa?.height ?? 0),
      },
    });
  // O lugar fica dentro da moldura, longe dos cantos redondos.
  const daMoldura = await moldura.boundingBox();
  expect((caixa?.x ?? 0) - (daMoldura?.x ?? 0)).toBeGreaterThanOrEqual(6);
  expect(
    (daMoldura?.y ?? 0) + (daMoldura?.height ?? 0) - ((caixa?.y ?? 0) + (caixa?.height ?? 0)),
  ).toBeGreaterThanOrEqual(6);
  // A moldura é a forma: fora dela, o clique passa.
  await expect
    .poll(async () => (await chamadasDe(page, 'informar_forma')).at(-1))
    .toMatchObject({ retangulos: [{ raioDeCima: 18, raioDeBaixo: 18 }] });
});

test('a linha da resposta abre o chamado no chat, e a trilha leva o número', async ({ page }) => {
  await abrirATelaMaior(page, { destino: 'chamado', numero: 1041 });
  await expect(trilha(page).getByRole('listitem')).toHaveText(['Aba', 'Abrir chat', '#1041']);
});

test('"Abrir no chat" leva ao chat na mesma tela maior', async ({ page }) => {
  await abrirATelaMaior(page, { destino: 'abrir-chamado' });
  await emitir(page, 'tela-maior-mudou', { destino: 'abrir-chat' });
  await expect(trilha(page).getByRole('listitem')).toHaveText(['Aba', 'Abrir chat']);
  await expect(page.getByRole('button', { name: 'Abrir no chat' })).toHaveCount(0);
  await expect
    .poll(async () => (await chamadasDe(page, 'informar_corpo')).at(-1))
    .toMatchObject({ retangulo: { largura: expect.any(Number) } });
});

test('o corpo segue o tema do Windows nos temas do Grafite', async ({ page }) => {
  await abrirATelaMaior(page, { destino: 'abrir-chamado' }, { tema: 'claro' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'papel');
  await emitir(page, 'aparencia-mudou', aparencia({ tema: 'escuro' }));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'grafite');
  await emitir(page, 'aparencia-mudou', aparencia({ tema: 'alto-contraste' }));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'alto-contraste');
});

test.describe('as referências visuais', () => {
  test.skip(
    process.platform !== 'win32',
    'A aba é do Windows, e as referências são gravadas nele.',
  );

  for (const tema of ['escuro', 'claro', 'alto-contraste'] as const) {
    test(`"Abrir chamado" no tema ${tema}`, async ({ page }) => {
      if (tema === 'alto-contraste') await page.emulateMedia({ forcedColors: 'active' });
      await abrirATelaMaior(page, { destino: 'abrir-chamado' }, { tema });
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`tela-maior-${tema}.png`, { omitBackground: true });
    });
  }

  test('o chat, com o lugar do webview vazio', async ({ page }) => {
    await abrirATelaMaior(page, { destino: 'chamado', numero: 1041 });
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('tela-maior-chat.png', { omitBackground: true });
  });
});
