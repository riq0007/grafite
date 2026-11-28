import type { Page } from '@playwright/test';
import { EQUIPE, SESSAO_DA_COLABORADORA, simularChat } from './api-do-chat.ts';
import { expect, test } from './fixtures.ts';

// Specs aba-dos-colaboradores ("Chat dentro da aba") e modulo-chat ("Chat na aba"), na web compilada,
// com a aba simulada pela navegação (change aba-dos-colaboradores, tarefa 4.1): o bilhete no
// fragmento de /chat/entrar, a recusa que pede outro uma vez, a página de entrada com a marca da aba,
// o 401 que volta a /chat/entrar, o 403 do alcance como o pedido que falhou e o Esc que ninguém
// consumiu. Cada teste confere que os pedidos do app do chat ficam na lista do alcance da sessão,
// a mesma que o teste da API fixa (`ROTAS_DO_CHAT_DA_ABA`).

// O app do chat não tem a chegada da casca: a espera dela ficaria para sempre.
test.use({ esperarAChegada: false });

/** As rotas que a sessão do chat na aba alcança, depois do /api, como a API as fixa. */
const NO_ALCANCE: readonly RegExp[] = [
  /^GET \/sessao$/,
  /^POST \/sessao\/segundo-passo$/,
  /^GET \/eventos$/,
  /^GET \/pessoas\/[^/]+\/foto\/[^/]+\/[^/]+$/,
  /^GET \/conta\/foto\/[^/]+\/[^/]+$/,
  /^[A-Z]+ \/chat\/.+$/,
];

/** Os pedidos da entrada, que saem antes da sessão do chat na aba e não pedem o alcance. */
const DA_ENTRADA = ['POST /sessao/bilhete', 'POST /sessao'];

/** Os pedidos à API que a página faz, para conferir no fim que todos ficam no alcance. */
function pedidosDaPagina(pagina: Page) {
  const pedidos: string[] = [];
  pagina.on('request', (pedido) => {
    const { pathname } = new URL(pedido.url());
    if (pathname.startsWith('/api/')) pedidos.push(`${pedido.method()} ${pathname.slice(4)}`);
  });
  return {
    pedidos,
    foraDoAlcance: () =>
      pedidos.filter(
        (pedido) => !DA_ENTRADA.includes(pedido) && !NO_ALCANCE.some((rota) => rota.test(pedido)),
      ),
  };
}

const ORGANIZACAO = {
  ...SESSAO_DA_COLABORADORA.organizacao,
  operaOServidor: false,
  modulosDesligados: [],
};

const problema = (status: number, codigo: string, detalhe: string) => ({
  status,
  contentType: 'application/problem+json',
  body: JSON.stringify({
    type: `urn:grafite:problema:${codigo}`,
    title: detalhe,
    status,
    detail: detalhe,
    codigoDeRastreio: 'T5EX-2E2E',
  }),
});

type Pendencia = 'segundo-passo' | 'trocar-senha' | 'cadastrar-dois-passos';

/** A sessão de Fernanda no chat da aba, valendo ou com o passo pendente. */
const naAba = (pendencia: Pendencia | null = null) => ({
  organizacao: SESSAO_DA_COLABORADORA.organizacao,
  sessao: { ...SESSAO_DA_COLABORADORA.sessao, naAba: true, pendencia },
});

/**
 * A aba simulada: o `POST /api/sessao/bilhete` recusa os `recusas` primeiros bilhetes e aceita o
 * seguinte, com o destino e a pendência dados; a entrada com a marca (`POST /api/sessao`) abre o
 * passo do código, e o código, a sessão. A navegação para /chat/entrar sem o fragmento e para
 * /chat/fechar-a-aba é o que a aba intercepta: aqui, ela fica anotada, e a página que a aba não
 * carregaria vem no lugar. Na primeira, com `outroBilhete`, a aba entrega outro bilhete.
 */
async function simularAba(
  pagina: Page,
  {
    recusas = 0,
    destino = { destino: 'chat' } as { destino: 'chat' } | { destino: 'chamado'; numero: number },
    pendencia = null as Pendencia | null,
    outroBilhete = null as string | null,
  } = {},
) {
  let sessao: ReturnType<typeof naAba> | null = null;
  const bilhetes: string[] = [];
  const entradas: unknown[] = [];
  const pelaAba: string[] = [];
  await pagina.route('**/api/sessao', (rota) => {
    const metodo = rota.request().method();
    if (metodo === 'GET') {
      return rota.fulfill({
        json: { ambiente: 'producao', organizacao: ORGANIZACAO, sessao: sessao?.sessao ?? null },
      });
    }
    if (metodo !== 'POST') return rota.fallback();
    entradas.push(rota.request().postDataJSON());
    sessao = naAba('segundo-passo');
    return rota.fulfill({ json: sessao });
  });
  await pagina.route('**/api/sessao/segundo-passo', (rota) => {
    sessao = naAba();
    return rota.fulfill({ json: sessao });
  });
  await pagina.route('**/api/sessao/bilhete', (rota) => {
    const { bilhete } = rota.request().postDataJSON() as { bilhete: string };
    bilhetes.push(bilhete);
    if (bilhetes.length <= recusas) {
      return rota.fulfill(
        problema(
          401,
          'bilhete-recusado',
          'O chat da aba não abriu. Feche e abra o chat de novo pela aba.',
        ),
      );
    }
    sessao = naAba(pendencia);
    return rota.fulfill({ json: { ...sessao, destino } });
  });
  // A primeira página de /chat/entrar é a do teste; as seguintes, sem a busca, são as da aba.
  let paginasDaEntrada = 0;
  await pagina.route(
    (url) => url.pathname === '/chat/entrar' && url.search === '',
    (rota) => {
      if (!rota.request().isNavigationRequest() || paginasDaEntrada++ === 0) return rota.fallback();
      pelaAba.push('/chat/entrar');
      const html = outroBilhete
        ? `<script>location.replace('/chat/entrar?de-novo#${outroBilhete}')</script>`
        : '<p>A aba pede o bilhete.</p>';
      return rota.fulfill({ contentType: 'text/html', body: html });
    },
  );
  await pagina.route('**/chat/fechar-a-aba', (rota) => {
    pelaAba.push('/chat/fechar-a-aba');
    return rota.fulfill({ contentType: 'text/html', body: '<p>A aba fecha a tela maior.</p>' });
  });
  return { bilhetes, entradas, pelaAba };
}

const trilha = (pagina: Page) => pagina.getByRole('navigation', { name: 'Vistas do chat' });
const lista = (pagina: Page) => pagina.getByRole('region', { name: 'Chat' });

test('o bilhete abre o chamado pedido, sem o bilhete no endereço, e sem o "Andamento", os Avisos e o menu da conta', async ({
  page,
}) => {
  const alcance = pedidosDaPagina(page);
  const aba = await simularAba(page, { destino: { destino: 'chamado', numero: 1047 } });
  await simularChat(page);
  await page.goto('/chat/entrar#bilhete-um');

  await expect(page).toHaveURL(/\/chat\/chamados\/1047$/);
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.getByRole('textbox', { name: /^Escrever para Paulo no #1047/ })).toBeVisible();
  // Ela participa do #1047 pela TI, e fora da aba o "Andamento" estaria aqui.
  await expect(page.getByRole('button', { name: 'Andamento' })).toHaveCount(0);
  await expect(trilha(page).getByRole('link')).toHaveText([/^Chat/, /^Equipes/, /^Chamados/]);
  await expect(page.getByRole('button', { name: 'Fernanda Rocha' })).toHaveCount(0);
  expect(aba.bilhetes).toEqual(['bilhete-um']);

  await lista(page).getByRole('link', { name: 'Equipe Financeiro', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/chat/c/${EQUIPE}$`));
  await expect(
    page.getByRole('textbox', { name: 'Escrever uma mensagem em Equipe Financeiro' }),
  ).toBeVisible();
  // O endereço dos avisos, que a aba não tem, leva ao começo do chat.
  await page.evaluate(() => {
    window.history.pushState(null, '', '/chat/avisos');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/chat$/);
  expect(alcance.foraDoAlcance()).toEqual([]);
  expect(aba.pelaAba).toEqual([]);
});

test('o bilhete recusado pede outro à aba uma vez, e o segundo abre o chat', async ({ page }) => {
  const alcance = pedidosDaPagina(page);
  const aba = await simularAba(page, { recusas: 1, outroBilhete: 'bilhete-dois' });
  await simularChat(page);
  await page.goto('/chat/entrar#bilhete-um');

  await expect(page).toHaveURL(/\/chat$/);
  await expect(
    lista(page).getByRole('link', { name: 'Equipe Financeiro', exact: true }),
  ).toBeVisible();
  expect(aba.bilhetes).toEqual(['bilhete-um', 'bilhete-dois']);
  expect(aba.pelaAba).toEqual(['/chat/entrar']);
  expect(alcance.foraDoAlcance()).toEqual([]);
});

test('recusado de novo, o chat da aba mostra o erro, sem pedir o terceiro', async ({ page }) => {
  const aba = await simularAba(page, { recusas: 2, outroBilhete: 'bilhete-dois' });
  await page.goto('/chat/entrar#bilhete-um');

  await expect(page.getByText('O chat da aba não abriu.', { exact: true })).toBeVisible();
  await expect(
    page.getByText('O chat da aba não abriu. Feche e abra o chat de novo pela aba.'),
  ).toBeVisible();
  expect(aba.bilhetes).toEqual(['bilhete-um', 'bilhete-dois']);
  expect(aba.pelaAba).toEqual(['/chat/entrar']);
  expect(new URL(page.url()).hash).toBe('');
});

test('a página de entrada com a marca da aba manda a marca, passa pelo código e abre o chat', async ({
  page,
}) => {
  const alcance = pedidosDaPagina(page);
  const aba = await simularAba(page);
  await simularChat(page);
  await page.goto('/chat/entrar?aba=PC-FIN-09');

  const entrada = page.locator('[data-tela-de-entrada]');
  await entrada.getByLabel('Usuário').fill('fernanda.rocha');
  const senha = entrada.getByLabel('Senha', { exact: true });
  await senha.fill('cavalo bateria grampo');
  await senha.press('Enter');
  const codigo = entrada.getByLabel('Código do app');
  await codigo.fill('123456');
  await codigo.press('Enter');

  await expect(page).toHaveURL(/\/chat$/);
  await expect(
    lista(page).getByRole('link', { name: 'Equipe Financeiro', exact: true }),
  ).toBeVisible();
  expect(aba.entradas).toEqual([
    { usuario: 'fernanda.rocha', senha: 'cavalo bateria grampo', aba: 'PC-FIN-09' },
  ]);
  expect(aba.bilhetes).toEqual([]);
  expect(alcance.foraDoAlcance()).toEqual([]);
});

test('a senha temporária fica no Grafite: o chat da aba abre o Grafite no navegador', async ({
  page,
}) => {
  const alcance = pedidosDaPagina(page);
  await simularAba(page, { pendencia: 'trocar-senha' });
  await page.goto('/chat/entrar#bilhete-um');

  const entrada = page.locator('[data-tela-de-entrada]');
  await expect(entrada.getByRole('heading', { name: 'Troque a senha temporária' })).toBeVisible();
  await expect(entrada.getByLabel('Senha nova')).toHaveCount(0);
  const janela = page.waitForEvent('popup');
  await entrada.getByRole('button', { name: 'Abrir o Grafite no navegador' }).click();
  expect(new URL((await janela).url()).pathname).toBe('/conta');
  expect(alcance.foraDoAlcance()).toEqual([]);
});

test.describe('com o chat da aba aberto', () => {
  test('o 403 do alcance é o pedido que falhou, e o 401 volta à aba pelo /chat/entrar', async ({
    page,
  }) => {
    const aba = await simularAba(page);
    await simularChat(page);
    let resposta = problema(403, 'fora-do-alcance-da-aba', 'Fora do que o chat da aba pode fazer.');
    await page.route(new RegExp(`/api/chat/conversas/${EQUIPE}$`), (rota) =>
      rota.fulfill(resposta),
    );
    await page.goto('/chat/entrar#bilhete-um');
    await lista(page).getByRole('link', { name: 'Equipe Financeiro', exact: true }).click();
    await expect(page.getByText('Fora do que o chat da aba pode fazer.')).toBeVisible();
    await expect(trilha(page)).toBeVisible();
    expect(aba.pelaAba).toEqual([]);

    resposta = problema(401, 'sem-sessao', 'Sua sessão terminou.');
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(page.getByText('A aba pede o bilhete.')).toBeVisible();
    expect(aba.pelaAba).toEqual(['/chat/entrar']);
  });

  test('o Esc que fecha o menu fica no chat; o seguinte fecha a tela maior', async ({ page }) => {
    const aba = await simularAba(page);
    await simularChat(page);
    await page.goto('/chat/entrar#bilhete-um');
    await lista(page).getByRole('link', { name: 'Equipe Financeiro', exact: true }).click();
    const mensagem = page
      .getByRole('region', { name: 'Mensagens' })
      .locator('li[data-escrita]')
      .filter({ hasText: 'Eu vou abrir um chamado agora.' });
    await mensagem.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: /^Ações da mensagem de / });
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByRole('region', { name: 'Mensagens' })).toBeVisible();
    expect(aba.pelaAba).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(page.getByText('A aba fecha a tela maior.')).toBeVisible();
    expect(aba.pelaAba).toEqual(['/chat/fechar-a-aba']);
  });
});

test.describe('com o service worker', () => {
  // Só estas pontas a ponta do chat da aba liberam o service worker, como as da PWA.
  test.use({ serviceWorkers: 'allow' });

  test('o chat da aba não registra o service worker', async ({ page }) => {
    await simularAba(page);
    await simularChat(page);
    await page.goto('/chat/entrar#bilhete-um');
    await expect(
      lista(page).getByRole('link', { name: 'Equipe Financeiro', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      lista(page).getByRole('link', { name: 'Equipe Financeiro', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations())).toHaveLength(0);
  });

  test('com o do Grafite já instalado, o /chat/entrar vem da rede e troca o bilhete', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    const aba = await simularAba(page);
    await simularChat(page);
    const resposta = await page.goto('/chat/entrar#bilhete-um');
    expect(resposta?.fromServiceWorker()).toBe(false);
    await expect(page).toHaveURL(/\/chat$/);
    await expect(
      lista(page).getByRole('link', { name: 'Equipe Financeiro', exact: true }),
    ).toBeVisible();
    expect(aba.bilhetes).toEqual(['bilhete-um']);
  });
});
