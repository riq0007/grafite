import { expect, type Page, test } from '@playwright/test';
import {
  type Aparencia,
  abrirATela,
  corDoToken,
  type Estado,
  esperarOMovimento,
  estado,
  JANELA,
} from './aparencia.ts';
import { chamadasDe, emitir } from './tauri.ts';

// Sem conexão (change aba-dos-colaboradores, tarefa 5.7; spec "Aba sem conexão" e "Pessoa pelo
// usuário do Windows"; m09): o tom neutro, sem vermelho, amarelo ou pulso, "Sem conexão" escrito,
// o motivo, o que precisa de rede indisponível e o contato de reserva da configuração.

test.use({ viewport: JANELA, timezoneId: 'America/Sao_Paulo' });

const REDE_CAIDA = { motivo: 'Sem conexão com o Grafite.' };
const ANA = {
  quem: 'Ana Souza',
  numero: 1041,
  titulo: 'Sem acesso à pasta do Financeiro',
  momento: '2026-11-11T12:21:00.000Z',
};
const SEM_CONEXAO: Partial<Estado> = {
  semConexao: REDE_CAIDA,
  naoLidas: 4,
  respostasNovas: 1,
  porVer: { quantas: 1, ultima: ANA },
};

async function abrirOPainel(
  page: Page,
  doEstado: Partial<Estado> = SEM_CONEXAO,
  daAparencia: Partial<Aparencia> = {},
) {
  const aba = await abrirATela(page, { estado: doEstado, aparencia: daAparencia });
  await aba.click();
  const painel = page.getByRole('dialog', { name: 'Suporte da TI' });
  await expect(painel).toBeVisible();
  await esperarOMovimento(page);
  return painel;
}

test('fechada, a aba fica no tom neutro e diz "Sem conexão", sem o aviso nem o ponto', async ({
  page,
}) => {
  const aba = await abrirATela(page, { estado: SEM_CONEXAO });
  await expect(aba).toHaveAccessibleName('Suporte da TI: Sem conexão');
  await expect(aba).not.toContainText('resposta nova');
  await expect(aba).toHaveCSS(
    'background-color',
    await corDoToken(page, '--cor-aba-flutuante-neutro'),
  );
  await expect(aba).toHaveCSS(
    'border-top-color',
    await corDoToken(page, '--cor-aba-flutuante-neutro-contorno'),
  );
  const pulsos = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animacao) => (animacao.effect as KeyframeEffect).pseudoElement === '::after')
        .length,
  );
  expect(pulsos).toBe(0);
});

test('aberta: o motivo, o chat e a linha indisponíveis, sem os números, e o contato', async ({
  page,
}) => {
  const painel = await abrirOPainel(page);
  expect((await painel.boundingBox())?.width).toBe(372);
  await expect(page.getByRole('status')).toHaveText('Sem conexão com o Grafite.');

  const chat = page.getByRole('button', { name: /^Abrir chat/ });
  await expect(chat).toHaveAccessibleName('Abrir chat precisa de conexão');
  await expect(chat).toHaveAttribute('aria-disabled', 'true');
  await chat.click({ force: true });
  const linha = page.getByRole('button', { name: /^Ana Souza respondeu/ });
  await expect(linha).toHaveAttribute('aria-disabled', 'true');
  await expect(linha).toContainText('precisa de conexão');
  await linha.click({ force: true });
  expect(await chamadasDe(page, 'abrir_tela_maior')).toEqual([]);

  await expect(page.getByRole('button', { name: 'Visualizar chamados' })).toHaveAccessibleName(
    'Visualizar chamados',
  );
  await expect(page.getByText('Urgente? Fale com a TI')).toBeVisible();
  await expect(page.getByText('Ramal 2000, das 8h às 18h')).toBeVisible();

  // "Abrir chamado" segue: a tela maior diz que a abertura chega numa versão seguinte.
  await page.getByRole('button', { name: 'Abrir chamado' }).click();
  await expect
    .poll(() => chamadasDe(page, 'abrir_tela_maior'))
    .toEqual([{ destino: 'abrir-chamado' }]);
});

test('as setas passam pelo que está indisponível, para o motivo ser lido', async ({ page }) => {
  await abrirOPainel(page);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: /^Abrir chat/ })).toBeFocused();
});

test('sem a configuração guardada, a de fábrica não tem o contato', async ({ page }) => {
  await abrirOPainel(page, SEM_CONEXAO, { contato: null });
  await expect(page.getByText('Urgente? Fale com a TI')).toHaveCount(0);
});

test('a pessoa recusada fica sem conexão, com o motivo', async ({ page }) => {
  await abrirOPainel(page, {
    semConexao: { motivo: 'Entre no Windows com o seu usuário da empresa para usar a aba.' },
    pessoa: null,
  });
  await expect(page.getByRole('status')).toHaveText(
    'Entre no Windows com o seu usuário da empresa para usar a aba.',
  );
  await expect(page.getByText('Ramal 2000, das 8h às 18h')).toBeVisible();
});

test('na tela de 1366, o painel sem conexão tem 300 px', async ({ page }) => {
  const painel = await abrirOPainel(page, SEM_CONEXAO, { tela: { largura: 1366, altura: 768 } });
  expect((await painel.boundingBox())?.width).toBe(300);
});

test('a rede volta, e a aba volta ao azul, com as não lidas e as respostas', async ({ page }) => {
  const aba = await abrirATela(page, { estado: SEM_CONEXAO });
  await expect(aba).toHaveAccessibleName('Suporte da TI: Sem conexão');
  await emitir(page, 'estado-mudou', estado({ ...SEM_CONEXAO, semConexao: null }));
  await expect(aba).toHaveAccessibleName('Suporte da TI: 1 resposta nova · Ana Souza');
  await esperarOMovimento(page);
  await expect(aba).toHaveCSS(
    'background-color',
    await corDoToken(page, '--cor-aba-flutuante-fundo'),
  );
});

test.describe('as referências visuais', () => {
  test.skip(
    process.platform !== 'win32',
    'A aba é do Windows, e as referências são gravadas nele.',
  );

  for (const forma of ['pilula', 'entalhe'] as const) {
    test(`a aba fechada sem conexão, na forma ${forma}`, async ({ page }) => {
      await abrirATela(page, { estado: SEM_CONEXAO, aparencia: { forma } });
      await page.mouse.move(0, JANELA.height - 1);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`sem-conexao-${forma}.png`, { omitBackground: true });
    });
  }

  for (const tema of ['escuro', 'alto-contraste'] as const) {
    test(`o painel sem conexão no tema ${tema}`, async ({ page }) => {
      await abrirOPainel(page, SEM_CONEXAO, { tema });
      await page.mouse.move(0, JANELA.height - 1);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`painel-sem-conexao-${tema}.png`, {
        omitBackground: true,
      });
    });
  }
});
