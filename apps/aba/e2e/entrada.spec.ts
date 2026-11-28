import { expect, type Page, test } from '@playwright/test';
import {
  type Aparencia,
  abrirATela,
  type Estado,
  esperarOMovimento,
  estado,
  JANELA,
} from './aparencia.ts';
import { chamadasDe, emitir } from './tauri.ts';

// A entrada pela senha (change aba-dos-colaboradores, tarefa 5.7; spec "Pessoa pela senha do AD"):
// o formulário do usuário e da senha, e o do código do app, no painel. A resposta volta pelo estado.

test.use({ viewport: JANELA });

type Formulario = NonNullable<Estado['formulario']>;
const PEDIR_A_SENHA: Formulario = { passo: 'senha', erro: null, esperaAte: null };

async function abrirOFormulario(
  page: Page,
  formulario: Formulario = PEDIR_A_SENHA,
  daAparencia: Partial<Aparencia> = {},
) {
  const aba = await abrirATela(page, {
    estado: { pessoa: null, formulario },
    aparencia: daAparencia,
  });
  await aba.click();
  const painel = page.getByRole('dialog', { name: 'Suporte da TI' });
  await expect(painel).toBeVisible();
  await esperarOMovimento(page);
  return painel;
}

const campo = (page: Page, nome: string) => page.getByRole('textbox', { name: nome });

test('sem sessão, o painel pede o usuário e a senha, com o foco no usuário', async ({ page }) => {
  await abrirOFormulario(page);
  await expect(
    page.getByRole('heading', { name: 'Entre com o seu usuário da empresa' }),
  ).toBeVisible();
  const usuario = campo(page, 'Usuário');
  await expect(usuario).toBeFocused();
  await expect(usuario).toHaveAccessibleDescription('Só o usuário, sem o domínio nem o e-mail.');
  await expect(page.getByLabel('Senha')).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'Abrir chamado' })).toHaveCount(0);

  await usuario.fill('carla.dias');
  // As setas andam no texto, e não pela grade.
  await page.keyboard.press('ArrowLeft');
  await expect(usuario).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Senha')).toBeFocused();
  await page.getByLabel('Senha').fill('aba123');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => chamadasDe(page, 'entrar'))
    .toEqual([{ usuario: 'carla.dias', senha: 'aba123' }]);
  // A senha não fica na tela depois da tentativa.
  await expect(page.getByLabel('Senha')).toHaveValue('');
});

test('a recusa aparece escrita, e o foco vai à senha', async ({ page }) => {
  await abrirOFormulario(page);
  await campo(page, 'Usuário').fill('carla.dias');
  await page.getByLabel('Senha').fill('errada');
  await page.keyboard.press('Enter');
  await emitir(
    page,
    'estado-mudou',
    estado({
      pessoa: null,
      formulario: { ...PEDIR_A_SENHA, erro: 'Usuário ou senha incorretos.' },
    }),
  );
  await expect(page.getByRole('alert')).toHaveText('Usuário ou senha incorretos.');
  await expect(page.getByLabel('Senha')).toBeFocused();
  await expect(page.getByLabel('Senha')).toHaveAttribute('aria-invalid', 'true');
});

test('com as tentativas esgotadas, o "Entrar" espera', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T12:00:00.000Z') });
  await abrirOFormulario(page, {
    passo: 'senha',
    erro: 'Muitas tentativas. Tente de novo em 5 minutos.',
    esperaAte: '2026-11-11T12:05:00.000Z',
  });
  const entrarBotao = page.getByRole('button', { name: 'Entrar' });
  await expect(entrarBotao).toHaveAttribute('aria-disabled', 'true');
  await campo(page, 'Usuário').fill('carla.dias');
  await page.getByLabel('Senha').fill('aba123');
  await entrarBotao.click({ force: true });
  expect(await chamadasDe(page, 'entrar')).toEqual([]);
  await page.clock.fastForward(5 * 60_000);
  await expect(entrarBotao).not.toHaveAttribute('aria-disabled');
});

test('a conta com os dois passos pede o código, que vai ao serviço', async ({ page }) => {
  await abrirOFormulario(page, { passo: 'codigo', erro: null, esperaAte: null });
  await expect(page.getByRole('heading', { name: 'Falta o código do app' })).toBeVisible();
  const codigo = campo(page, 'Código');
  await expect(codigo).toBeFocused();
  await expect(codigo).toHaveAttribute('autocomplete', 'one-time-code');
  await codigo.fill('123456');
  await page.keyboard.press('Enter');
  await expect.poll(() => chamadasDe(page, 'enviar_o_codigo')).toEqual([{ codigo: '123456' }]);
  await page.getByRole('button', { name: 'Voltar ao usuário' }).click();
  await expect.poll(() => chamadasDe(page, 'recomecar_a_entrada')).toHaveLength(1);
});

test('o Esc fecha o painel também no formulário', async ({ page }) => {
  const painel = await abrirOFormulario(page);
  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
});

test('a entrada que dá certo mostra quem está na aba, com "Sair"', async ({ page }) => {
  await abrirOFormulario(page);
  await emitir(
    page,
    'estado-mudou',
    estado({ pessoa: { nome: 'Carla Dias', pelaSenha: true }, formulario: null }),
  );
  await expect(page.getByText('Carla Dias')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir chamado' })).toBeVisible();
});

test.describe('as referências visuais', () => {
  test.skip(
    process.platform !== 'win32',
    'A aba é do Windows, e as referências são gravadas nele.',
  );

  test('o formulário do usuário e da senha', async ({ page }) => {
    await abrirOFormulario(page);
    await page.mouse.move(0, JANELA.height - 1);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('formulario-da-senha.png', { omitBackground: true });
  });

  test('o formulário do código, com a recusa', async ({ page }) => {
    await abrirOFormulario(page, {
      passo: 'codigo',
      erro: 'Código inválido. Confira no app e tente de novo.',
      esperaAte: null,
    });
    await page.mouse.move(0, JANELA.height - 1);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('formulario-do-codigo.png', { omitBackground: true });
  });
});
