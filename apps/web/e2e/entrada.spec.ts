import type { Page, Route } from '@playwright/test';
import { expect, SEM_SESSAO, SESSAO, semRolagemHorizontal, test } from './fixtures.ts';

// Spec tela-de-entrada, com a web compilada e a API simulada.

const entrada = (pagina: Page) => pagina.locator('[data-tela-de-entrada]');
const titulo = (pagina: Page, nome: string) =>
  pagina.getByRole('heading', { level: 1, name: nome, exact: true });

/** A sessão de "Ana Souza" com um passo pendente, o CSRF dela e, enquanto pende, sem acesso. */
const comPendencia = (pendencia: string) => ({
  ...SESSAO,
  sessao: { ...SESSAO.sessao, pendencia, csrf: 'csrf-pendente', acesso: { permissoes: [] } },
});

const problema = (status: number, codigo: string, detalhe: string) => ({
  status,
  contentType: 'application/problem+json',
  body: JSON.stringify({
    type: `urn:grafite:problema:${codigo}`,
    title: 'Título',
    status,
    detail: detalhe,
    codigoDeRastreio: 'R7K2-9QXM',
  }),
});

/** Responde um método do endereço e deixa os outros com as rotas da fixture. */
const noMetodo = (metodo: string, responder: (rota: Route) => Promise<void>) => (rota: Route) =>
  rota.request().method() === metodo ? responder(rota) : rota.fallback();

async function entrarCom(pagina: Page, usuario: string, senha: string) {
  if (usuario) await entrada(pagina).getByLabel('Usuário').fill(usuario);
  const campo = entrada(pagina).getByLabel('Senha', { exact: true });
  await campo.fill(senha);
  await campo.press('Enter');
}

test.describe('sem sessão', () => {
  test.use({ semSessao: true });

  test('a chegada para na tela de entrada, com o nome da organização e o foco no usuário', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-chegada', 'entrada');
    await expect(titulo(page, 'Entrar')).toBeVisible();
    await expect(page.getByText('Empresa de exemplo')).toBeVisible();
    await expect(page.getByLabel('Usuário')).toBeFocused();
    await expect(page.getByRole('banner')).toHaveCount(0);
  });

  test('usuário e senha, depois o código, e a casca', async ({ page }) => {
    await page.route(
      '**/api/sessao',
      noMetodo('POST', (rota) => rota.fulfill({ json: comPendencia('segundo-passo') })),
    );
    await page.route('**/api/sessao/segundo-passo', (rota) => rota.fulfill({ json: SESSAO }));
    await page.goto('/');
    await entrarCom(page, 'ana.souza', 'cavalo bateria grampo');

    const codigo = entrada(page).getByLabel('Código do app');
    await expect(codigo).toBeFocused();
    await codigo.fill('287082');
    const segundoPasso = page.waitForRequest('**/api/sessao/segundo-passo');
    await codigo.press('Enter');
    const pedido = await segundoPasso;
    expect(pedido.postDataJSON()).toEqual({ codigo: '287082', confiar: false });
    expect(pedido.headers()['x-grafite-csrf']).toBe('csrf-pendente');

    await expect(page.locator('html')).toHaveAttribute('data-chegada', 'pronta');
    await expect(page.getByRole('banner').getByRole('button', { name: 'Ana Souza' })).toBeVisible();
    await expect(entrada(page)).toHaveCount(0);
  });

  test('a recusa limpa a senha, e o bloqueio diz quanto falta', async ({ page }) => {
    let tentativas = 0;
    await page.route(
      '**/api/sessao',
      noMetodo('POST', (rota) => {
        tentativas += 1;
        return rota.fulfill(
          tentativas === 1
            ? problema(401, 'credenciais-invalidas', 'Usuário ou senha incorretos.')
            : problema(
                429,
                'entrada-bloqueada',
                'Muitas tentativas com este usuário. Tente de novo em 1 min.',
              ),
        );
      }),
    );
    await page.goto('/');
    await entrarCom(page, 'ana.souza', 'senha errada');
    const mensagem = entrada(page).getByRole('alert');
    await expect(mensagem).toHaveText('Usuário ou senha incorretos.');
    const senha = entrada(page).getByLabel('Senha', { exact: true });
    await expect(senha).toHaveValue('');
    await expect(senha).toBeFocused();

    await entrarCom(page, '', 'outra senha errada');
    await expect(mensagem).toHaveText(
      'Muitas tentativas com este usuário. Tente de novo em 1 min.',
    );
  });
});

test('o endereço desconhecido explica e não mostra os campos', async ({ page }) => {
  await page.route(
    '**/api/sessao',
    noMetodo('GET', (rota) =>
      rota.fulfill(problema(404, 'endereco-desconhecido', 'Endereço desconhecido.')),
    ),
  );
  await page.goto('/');
  await expect(titulo(page, 'Endereço desconhecido')).toBeVisible();
  await expect(
    page.getByText(
      'Este endereço não está ligado a nenhuma organização do Grafite. Confira o endereço com a TI.',
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Usuário')).toHaveCount(0);
});

test('a sessão que vence na seção Dock cobre a casca, e entrar de novo volta ao Dock', async ({
  page,
}) => {
  let consultas = 0;
  await page.route('**/api/sessao', (rota) => {
    const metodo = rota.request().method();
    if (metodo === 'POST') return rota.fulfill({ json: SESSAO });
    if (metodo !== 'GET') return rota.fallback();
    consultas += 1;
    // A primeira consulta dá uma sessão que vence daqui a 3 s; depois, ela já venceu.
    const vencendo = { ...SESSAO.sessao, expiraEm: new Date(Date.now() + 3000).toISOString() };
    return rota.fulfill({ json: consultas === 1 ? { ...SESSAO, sessao: vencendo } : SEM_SESSAO });
  });
  await page.goto('/ajustes/dock');
  await expect(titulo(page, 'Dock')).toBeVisible();

  await expect(page.getByText('Sua sessão terminou. Entre de novo para continuar.')).toBeVisible({
    timeout: 10_000,
  });
  await expect(entrada(page).getByLabel('Usuário')).toHaveValue('ana.souza');
  await expect(titulo(page, 'Dock')).toHaveCount(0);

  await entrarCom(page, '', 'cavalo bateria grampo');
  await expect(titulo(page, 'Dock')).toBeVisible();
  await expect(page).toHaveURL(/\/ajustes\/dock$/);
  await expect(entrada(page)).toHaveCount(0);
});

test('"Sair" encerra a sessão e volta à tela de entrada', async ({ page }) => {
  let saiu = false;
  await page.route('**/api/sessao', (rota) => {
    const metodo = rota.request().method();
    if (metodo === 'DELETE') {
      saiu = true;
      return rota.fulfill({ status: 204 });
    }
    if (metodo === 'GET' && saiu) return rota.fulfill({ json: SEM_SESSAO });
    return rota.fallback();
  });
  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Ana Souza' }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(titulo(page, 'Entrar')).toBeVisible();
  expect(saiu).toBe(true);
  await expect(page.getByRole('banner')).toHaveCount(0);
});

test.describe('no celular', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    semSessao: true,
  });

  test('a entrada cabe na largura, com os campos na largura útil e sem rolagem horizontal', async ({
    page,
  }) => {
    await page.goto('/');
    const campo = entrada(page).getByLabel('Usuário');
    await expect(campo).toBeVisible();
    await semRolagemHorizontal(page);
    const largura = (await campo.boundingBox())?.width ?? 0;
    expect(largura).toBeGreaterThan(390 * 0.7);
  });
});
