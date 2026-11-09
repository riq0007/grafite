import { randomUUID } from 'node:crypto';
import type { components } from '@grafite/api-client';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Specs notificacoes e ajustes-do-sistema (Notificações e Tabelas), com a web compilada. As
// notificações vêm da API simulada, e a que chega pelo evento vira aviso (change
// p3b-notificacoes-no-servidor).

type Notificacao = components['schemas']['NotificacaoNaLista'];

const ALERTA_DO_TONER = '0199d3a0-0000-7000-8000-0000000000a7';

/** Uma notificação como a API a lista, gravada agora. */
const notificacao = (dados: Partial<Notificacao> = {}): Notificacao => ({
  id: randomUUID(),
  severidade: 'critico',
  titulo: 'Black Toner Cartridge em 8%',
  descricao: 'HP LaserJet M404 · PAT-00412',
  origem: 'Alertas',
  destino: null,
  criadaEm: new Date().toISOString(),
  lida: false,
  alerta: {
    id: ALERTA_DO_TONER,
    situacao: 'aberto',
    reconhecido: null,
    adiado: null,
    permite: { tratar: true },
  },
  ...dados,
});

/**
 * A API das notificações: a lista com os filtros, as leituras e o reconhecimento do alerta,
 * guardando o que a tela pediu.
 */
async function simularNotificacoes(pagina: Page) {
  const estado = {
    itens: [] as Notificacao[],
    severidadesPedidas: [] as Array<string | null>,
    reconhecidos: [] as string[],
  };
  const naoLidas = () => estado.itens.filter(({ lida }) => !lida).length;
  await pagina.route('**/api/notificacoes**', (rota) => {
    const pedido = rota.request();
    const { pathname, searchParams } = new URL(pedido.url());
    if (pedido.method() === 'GET' && pathname === '/api/notificacoes') {
      const severidade = searchParams.get('severidade');
      const soNaoLidas = searchParams.get('naoLidas') === 'true';
      estado.severidadesPedidas.push(severidade);
      const itens = estado.itens.filter(
        (item) => (!severidade || item.severidade === severidade) && (!soNaoLidas || !item.lida),
      );
      return rota.fulfill({ json: { itens, naoLidas: naoLidas(), proximo: null } });
    }
    if (pedido.method() === 'POST' && pathname === '/api/notificacoes/leitura') {
      const lidas = naoLidas();
      estado.itens = estado.itens.map((item) => ({ ...item, lida: true }));
      return rota.fulfill({ json: { lidas } });
    }
    const leitura = pathname.match(/^\/api\/notificacoes\/([^/]+)\/leitura$/);
    if (pedido.method() === 'POST' && leitura) {
      estado.itens = estado.itens.map((item) =>
        item.id === leitura[1] ? { ...item, lida: true } : item,
      );
      return rota.fulfill({ status: 204 });
    }
    return rota.fallback();
  });
  await pagina.route(`**/api/alertas/${ALERTA_DO_TONER}/reconhecimento`, (rota) => {
    const reconhecido = { nome: 'Ana Souza', em: new Date().toISOString() };
    estado.reconhecidos.push(ALERTA_DO_TONER);
    estado.itens = estado.itens.map((item) =>
      item.alerta?.id === ALERTA_DO_TONER
        ? { ...item, alerta: { ...item.alerta, reconhecido } }
        : item,
    );
    return rota.fulfill({ json: { reconhecido } });
  });
  return estado;
}

const sino = (pagina: Page) =>
  pagina.getByRole('banner').getByRole('button', { name: /^Notificações/ });
const central = (pagina: Page) => pagina.getByRole('dialog', { name: 'Notificações' });
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });

/** Escolhe um segmento clicando no rótulo, como o usuário. */
const escolher = (pagina: Page, grupo: string, opcao: string) =>
  pagina
    .getByRole('radiogroup', { name: grupo })
    .locator('label')
    .filter({ hasText: opcao })
    .click();

test('o sino mostra que não há não lidas, e a central abre vazia e devolve o foco ao sino', async ({
  page,
}) => {
  await page.goto('/');
  await expect(sino(page)).toHaveAccessibleName('Notificações, nenhuma não lida');
  await sino(page).click();
  await expect(central(page).getByText('Nenhuma notificação.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(central(page)).toHaveCount(0);
  await expect(sino(page)).toBeFocused();
});

test('o aviso de exemplo fica 10 s na tela, pelo relógio, e não entra na central', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/ajustes/notificacoes');
  await escolher(page, 'Tempo do aviso', '10 s');
  await page.getByRole('button', { name: 'Mostrar aviso de exemplo' }).click();
  const exemplo = avisos(page).getByText('Aviso de exemplo');
  await expect(exemplo).toBeVisible();
  await expect(avisos(page)).toContainText('Some em 10 s');

  // Longe dos 6 s de fábrica e dos 20 s: ainda na tela depois de 8,5 s, fora dela antes de 12 s.
  await page.clock.fastForward(8_500);
  await expect(exemplo).toBeVisible();
  await page.clock.fastForward(3_000);
  await expect(exemplo).toHaveCount(0);

  await expect(sino(page)).toHaveAccessibleName('Notificações, nenhuma não lida');
});

test('a notificação que chega pelo evento vira aviso, e "Reconhecer" trata o alerta', async ({
  page,
  servidor,
}) => {
  const api = await simularNotificacoes(page);
  await page.goto('/');
  await expect(sino(page)).toHaveAccessibleName('Notificações, nenhuma não lida');

  api.itens.unshift(notificacao());
  servidor.eventos.push({ tipo: 'notificacoes.mudaram' });
  const aviso = avisos(page).getByRole('alertdialog').filter({ hasText: 'Black Toner' });
  await expect(aviso).toContainText('Crítico');
  await expect(aviso).toContainText('HP LaserJet M404 · PAT-00412');
  await expect(aviso.getByRole('button', { name: 'Adiar 15 min' })).toBeVisible();
  await expect(sino(page)).toHaveAccessibleName('Notificações, 1 não lida');

  await aviso.getByRole('button', { name: 'Reconhecer' }).click();
  await expect(avisos(page)).toContainText('Alerta reconhecido.');
  await expect(aviso).toHaveCount(0);
  expect(api.reconhecidos).toEqual([ALERTA_DO_TONER]);
  // Reconhecer também lê a notificação.
  await expect(sino(page)).toHaveAccessibleName('Notificações, nenhuma não lida');
});

test('a central lê as notificações da API, filtra pela severidade e marca todas como lidas', async ({
  page,
}) => {
  const api = await simularNotificacoes(page);
  api.itens.push(
    notificacao(),
    notificacao({
      severidade: 'atencao',
      titulo: 'Coletor sem contato',
      descricao: 'Coletor do Galpão',
      alerta: null,
    }),
    notificacao({
      severidade: 'info',
      titulo: 'Backup concluído',
      descricao: null,
      lida: true,
      alerta: null,
    }),
  );
  await page.goto('/');
  await expect(sino(page)).toHaveAccessibleName('Notificações, 2 não lidas');
  // As que já estavam gravadas quando a aplicação abriu não viram aviso.
  await expect(avisos(page).getByRole('alertdialog')).toHaveCount(0);

  await sino(page).click();
  const gaveta = central(page);
  await expect(gaveta.getByText('Backup concluído')).toBeVisible();
  await expect(gaveta.getByText('Coletor sem contato')).toBeVisible();

  await escolher(page, 'Severidade', 'Crítico');
  await expect(gaveta.getByText('Coletor sem contato')).toHaveCount(0);
  await expect(gaveta.getByText('Black Toner Cartridge em 8%')).toBeVisible();
  // O filtro é do servidor: a central pediu só as críticas.
  expect(api.severidadesPedidas).toContain('critico');

  await gaveta.getByRole('button', { name: 'Marcar todas como lidas' }).click();
  await expect(gaveta.getByRole('button', { name: 'Marcar todas como lidas' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(sino(page)).toHaveAccessibleName('Notificações, nenhuma não lida');
});

test('com o Foco ligado pela central, só o Crítico vira aviso, e o resto fica no sino', async ({
  page,
  servidor,
}) => {
  const api = await simularNotificacoes(page);
  await page.goto('/');
  await sino(page).click();
  await central(page).locator('label').filter({ hasText: 'Modo Foco' }).click();
  await expect(central(page).getByRole('switch', { name: 'Modo Foco' })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(sino(page)).toHaveAccessibleName('Notificações, nenhuma não lida, Foco ligado');
  await expect(sino(page)).toContainText('Foco');
  await expect
    .poll(() => servidor.preferenciasDaConta)
    .toMatchObject({ notificacoes: { foco: true } });

  api.itens.unshift(
    notificacao({ severidade: 'info', titulo: 'Backup concluído', descricao: null, alerta: null }),
    notificacao({
      severidade: 'atencao',
      titulo: 'Coletor sem contato',
      descricao: 'Coletor do Galpão',
      alerta: null,
    }),
  );
  servidor.eventos.push({ tipo: 'notificacoes.mudaram' });
  await expect(sino(page)).toHaveAccessibleName('Notificações, 2 não lidas, Foco ligado');
  await expect(avisos(page).getByRole('alertdialog')).toHaveCount(0);

  api.itens.unshift(notificacao());
  servidor.eventos.push({ tipo: 'notificacoes.mudaram' });
  await expect(
    avisos(page).getByRole('alertdialog').filter({ hasText: 'Black Toner' }),
  ).toBeVisible();
  await expect(sino(page)).toHaveAccessibleName('Notificações, 3 não lidas, Foco ligado');
  await expect(avisos(page).getByRole('alertdialog')).toHaveCount(1);
});

test('a tabela de exemplo fica sem linhas alternadas e sem miniaturas', async ({ page }) => {
  await page.goto('/ajustes/tabelas');
  const exemplo = page.getByRole('grid', { name: 'Tabela de exemplo' });
  await expect(exemplo.getByRole('columnheader').first()).toHaveText('Imagem');

  await page.locator('label').filter({ hasText: 'Linhas alternadas' }).click();
  await page.locator('label').filter({ hasText: 'Miniaturas' }).click();
  await expect(page.getByRole('switch', { name: 'Miniaturas' })).not.toBeChecked();

  const [primeira, segunda] = await exemplo
    .getByRole('row')
    .filter({ hasText: 'EXEMPLO' })
    .evaluateAll((linhas) =>
      linhas.slice(0, 2).map((linha) => getComputedStyle(linha).backgroundColor),
    );
  expect(primeira).toBe(segunda);
  await expect(exemplo.getByRole('columnheader')).toHaveText([
    'Equipamento',
    'Patrimônio',
    'Local',
  ]);
});

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('o sino fica à vista na barra', async ({ page }) => {
    await page.goto('/');
    await expect(sino(page)).toBeVisible();
  });
});

// O e-mail e o celular nos Ajustes (change p3c-email-e-push): os canais que o servidor diz, o
// e-mail de teste e o aparelho inscrito por um PushManager simulado na página.
type Canais = components['schemas']['CanaisDaConta'];

const CANAIS_LIGADOS: Canais = {
  email: { situacao: 'ligado', endereco: 'ana.souza@empresa.com.br' },
  push: { situacao: 'ligado', chavePublica: `B${'A'.repeat(86)}`, aparelhos: [] },
};

const porEmail = (pagina: Page) => pagina.getByRole('group', { name: 'Por e-mail', exact: true });
const noCelular = (pagina: Page) => pagina.getByRole('group', { name: 'No celular', exact: true });

/** Os canais da conta pela API simulada, com os aparelhos que a tela inscreve e tira. */
async function simularCanais(pagina: Page, canais: Canais = CANAIS_LIGADOS) {
  const estado = { canais: structuredClone(canais), testes: 0 };
  await pagina.route('**/api/conta/canais', (rota) => rota.fulfill({ json: estado.canais }));
  await pagina.route('**/api/conta/canais/email/teste', (rota) => {
    estado.testes += 1;
    return rota.fulfill({ json: { endereco: estado.canais.email.endereco } });
  });
  await pagina.route('**/api/conta/push', (rota) => {
    const corpo = rota.request().postDataJSON() as { endpoint: string; aparelho: string };
    const aparelho = {
      id: '0199d3a0-0000-7000-8000-0000000000f1',
      aparelho: corpo.aparelho,
      endpoint: corpo.endpoint,
      criadaEm: new Date().toISOString(),
      ultimoEnvioEm: null,
    };
    estado.canais.push.aparelhos = [aparelho];
    return rota.fulfill({ status: 201, json: aparelho });
  });
  await pagina.route('**/api/conta/push/*', (rota) => {
    estado.canais.push.aparelhos = [];
    return rota.fulfill({ status: 204 });
  });
  return estado;
}

/** Um navegador com push: a permissão e a inscrição do service worker, simuladas na página. */
async function navegadorComPush(pagina: Page) {
  await pagina.addInitScript(() => {
    let permissao: NotificationPermission = 'default';
    let inscrita = false;
    const janela = window as unknown as { __inscricaoCancelada?: boolean };
    janela.__inscricaoCancelada = false;
    Object.defineProperty(Notification, 'permission', { get: () => permissao });
    Notification.requestPermission = async () => {
      permissao = 'granted';
      return permissao;
    };
    const endpoint = 'https://fcm.googleapis.com/fcm/send/aparelho-do-e2e';
    const inscricao = () => ({
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: `B${'C'.repeat(86)}`, auth: 'D'.repeat(22) } }),
      unsubscribe: async () => {
        inscrita = false;
        janela.__inscricaoCancelada = true;
        return true;
      },
    });
    const registro = {
      pushManager: {
        subscribe: async () => {
          inscrita = true;
          return inscricao();
        },
        getSubscription: async () => (inscrita ? inscricao() : null),
      },
    };
    navigator.serviceWorker.getRegistration = (async () =>
      registro) as unknown as ServiceWorkerContainer['getRegistration'];
  });
}

test.describe('o e-mail e o celular nos Ajustes', () => {
  test('o e-mail da pessoa, com o crítico na hora, e o e-mail de teste', async ({ page }) => {
    const api = await simularCanais(page);
    await page.goto('/ajustes/notificacoes');
    await expect(porEmail(page)).toContainText(
      'As notificações vão para ana.souza@empresa.com.br.',
    );
    await expect(porEmail(page).getByRole('switch', { name: /Crítico na hora/ })).toBeChecked();
    await porEmail(page).getByRole('button', { name: 'Mandar um e-mail de teste' }).click();
    await expect(avisos(page)).toContainText(
      'E-mail de teste enviado para ana.souza@empresa.com.br.',
    );
    expect(api.testes).toBe(1);
  });

  test('a pessoa sem e-mail vê o motivo, com os ajustes do e-mail desligados', async ({ page }) => {
    await simularCanais(page, {
      ...CANAIS_LIGADOS,
      email: { situacao: 'sem-email', endereco: null },
    });
    await page.goto('/ajustes/notificacoes');
    await expect(porEmail(page)).toContainText(
      'A pessoa da sua conta não tem e-mail. Peça à administração para cadastrar o seu e-mail.',
    );
    await expect(porEmail(page).getByRole('switch', { name: /Crítico na hora/ })).toBeDisabled();
  });

  test('o servidor sem os canais diz isso nos dois grupos', async ({ page }) => {
    await page.goto('/ajustes/notificacoes');
    await expect(porEmail(page)).toContainText(
      'O envio de e-mail não está configurado neste servidor.',
    );
    await expect(noCelular(page)).toContainText(
      'Os avisos no celular não estão configurados neste servidor.',
    );
  });

  test('recebe neste aparelho, que aparece como "Este aparelho", e o tira', async ({ page }) => {
    await navegadorComPush(page);
    await simularCanais(page);
    await page.goto('/ajustes/notificacoes');
    await noCelular(page).getByRole('button', { name: 'Receber neste aparelho' }).click();
    const lista = noCelular(page).getByRole('list', { name: 'Aparelhos que recebem os avisos' });
    await expect(lista).toContainText('Este aparelho');
    await expect(lista).toContainText('Chrome no Windows');
    await expect(
      noCelular(page).getByRole('button', { name: 'Mandar um aviso de teste' }),
    ).toBeVisible();
    await lista.getByRole('button', { name: 'Tirar' }).click();
    await expect(lista).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { __inscricaoCancelada?: boolean }).__inscricaoCancelada,
      ),
    ).toBe(true);
  });
});
