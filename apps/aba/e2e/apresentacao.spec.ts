import { expect, type Page, test } from '@playwright/test';
import {
  abrirATela,
  animacoes,
  aparencia,
  type Estado,
  esperarOMovimento,
  estado,
  gravarAsAnimacoes,
  JANELA,
} from './aparencia.ts';
import { chamadasDe, emitir, simularOTauri } from './tauri.ts';

// A apresentação (change aba-dos-colaboradores, tarefa 5.7; spec "Aba durante uma apresentação";
// m10): com um programa em tela cheia, a aba vira a linha de 96×4 na borda, sem abrir pelo clique
// nem avisar; ao sair, com respostas que chegaram durante ela, diz a hora por 1 minuto.

test.use({ viewport: JANELA, timezoneId: 'America/Sao_Paulo' });

const ANA = {
  quem: 'Ana Souza',
  numero: 1041,
  titulo: 'Sem acesso à pasta do Financeiro',
  momento: '2026-11-11T12:21:00.000Z',
};
const COM_A_RESPOSTA: Partial<Estado> = { porVer: { quantas: 1, ultima: ANA }, respostasNovas: 1 };

async function abrirApresentando(page: Page, doEstado: Partial<Estado> = {}) {
  await simularOTauri(page, {
    aparencia: aparencia({ apresentacao: true }),
    estado: estado(doEstado),
    informar_forma: null,
    abrir_tela_maior: null,
    devolver_o_foco: null,
    sair: null,
    tela_maior: null,
  });
  await page.goto('/');
  const linha = page.locator('[data-linha]');
  await expect(linha).toBeVisible();
  return linha;
}

test('em apresentação, a aba é a linha de 96×4 na borda, sem aviso e sem clique', async ({
  page,
}) => {
  const linha = await abrirApresentando(page, COM_A_RESPOSTA);
  const caixa = await linha.boundingBox();
  expect(caixa).toMatchObject({ y: 0, width: 96, height: 4 });
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByText('resposta nova')).toHaveCount(0);
  // A forma é vazia: o clique na linha passa para a janela de baixo.
  await expect
    .poll(async () => (await chamadasDe(page, 'informar_forma')).at(-1))
    .toEqual({
      retangulos: [],
    });
});

test('o atalho segue abrindo o painel, e o Esc volta à linha', async ({ page }) => {
  await abrirApresentando(page);
  await emitir(page, 'atalho', null);
  const painel = page.getByRole('dialog', { name: 'Suporte da TI' });
  await expect(painel).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir chamado' })).toBeFocused();
  await expect
    .poll(async () => (await chamadasDe(page, 'informar_forma')).at(-1))
    .toMatchObject({
      retangulos: [{ largura: 293 }],
    });
  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
  await expect(page.locator('[data-linha]')).toBeVisible();
});

test('ao sair, a resposta que chegou durante ela diz a hora por 1 minuto, e depois quem respondeu', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-11T12:34:00.000Z') });
  await abrirApresentando(page);
  await emitir(page, 'estado-mudou', estado(COM_A_RESPOSTA));
  await expect(page.getByText('resposta nova')).toHaveCount(0);

  await emitir(page, 'aparencia-mudou', aparencia());
  const aba = page.getByRole('button', { name: /^Suporte da TI/ });
  await expect(aba).toHaveAccessibleName('Suporte da TI: 1 resposta nova · chegou às 09:21');
  await page.clock.fastForward(60_000);
  await expect(aba).toHaveAccessibleName('Suporte da TI: 1 resposta nova · Ana Souza');
});

test('com mais de uma, diz a hora da última', async ({ page }) => {
  await abrirApresentando(page);
  await emitir(
    page,
    'estado-mudou',
    estado({ porVer: { quantas: 3, ultima: { ...ANA, momento: '2026-11-11T12:30:00.000Z' } } }),
  );
  await emitir(page, 'aparencia-mudou', aparencia());
  await expect(page.getByRole('button', { name: /^Suporte da TI/ })).toHaveAccessibleName(
    'Suporte da TI: 3 respostas novas · a última às 09:30',
  );
});

test('a resposta de antes da apresentação volta com o aviso de sempre', async ({ page }) => {
  await abrirApresentando(page, COM_A_RESPOSTA);
  await emitir(page, 'aparencia-mudou', aparencia());
  await expect(page.getByRole('button', { name: /^Suporte da TI/ })).toHaveAccessibleName(
    'Suporte da TI: 1 resposta nova · Ana Souza',
  );
});

test('a aba encolhe para a linha em 160 ms e volta dela em 220 ms', async ({ page }) => {
  await gravarAsAnimacoes(page);
  const aba = await abrirATela(page);
  await expect(aba).toBeVisible();
  await emitir(page, 'aparencia-mudou', aparencia({ apresentacao: true }));
  await expect(page.locator('[data-linha]')).toBeVisible();
  const encolher = (await animacoes(page)).at(-1);
  expect(encolher).toMatchObject({ duracao: 160 });
  expect(encolher?.quadros[0]).toMatchObject({ width: '162px', height: '34px' });
  expect(encolher?.quadros[1]).toMatchObject({ width: '96px', height: '4px' });

  await esperarOMovimento(page);
  await emitir(page, 'aparencia-mudou', aparencia());
  await expect(page.getByRole('button', { name: 'Suporte da TI' })).toBeVisible();
  const voltar = (await animacoes(page)).at(-1);
  expect(voltar).toMatchObject({ duracao: 220 });
  expect(voltar?.quadros[0]).toMatchObject({ width: '96px', height: '4px' });
  expect(voltar?.quadros[1]).toMatchObject({ width: '162px', height: '34px' });
});

test.describe('as referências visuais', () => {
  test.skip(
    process.platform !== 'win32',
    'A aba é do Windows, e as referências são gravadas nele.',
  );

  test('a linha da apresentação', async ({ page }) => {
    await abrirApresentando(page, COM_A_RESPOSTA);
    await expect(page).toHaveScreenshot('linha-da-apresentacao.png', {
      omitBackground: true,
      clip: { x: 160, y: 0, width: 120, height: 24 },
    });
  });
});
