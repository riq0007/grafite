import type { Page } from '@playwright/test';
import { simularAdministracao } from './api-da-administracao.ts';
import { expect, test } from './fixtures.ts';

// Specs estrutura-da-casca, tela-de-entrada e modulo-administracao do F2d · Operação: o aviso do
// ambiente de teste e a tela de backup, com a web compilada e a API simulada.

const titulo = (pagina: Page, nome: string) =>
  pagina.getByRole('heading', { level: 1, name: nome });
const secoes = (pagina: Page) =>
  pagina.getByRole('navigation', { name: 'Seções da Administração' });
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });

const DESTINO = 'D:\\Backups\\Grafite';

const ESTADO = {
  configurado: true,
  agenda: {
    horario: '02:00',
    diaDoTeste: 0,
    janela: { inicio: '00:00', fim: '06:00' },
    teste: 'semanal',
  },
  proximoBackup: '2026-10-08T05:00:00.000Z',
  backups: [
    {
      id: '0199a6e0-0000-7000-8000-0000000000b1',
      iniciadoEm: '2026-10-07T05:00:00.000Z',
      terminadoEm: '2026-10-07T05:04:00.000Z',
      situacao: 'feito',
      pedidoPor: 'agenda',
      tamanho: 52428800,
      destinos: [{ destino: DESTINO, situacao: 'gravado', erro: null }],
      erro: null,
    },
  ],
  ultimoTeste: null,
};

/** A API da tela de backup: o estado, o pedido do backup e a agenda, com a janela de 00:00 a 06:00. */
async function simularBackup(pagina: Page) {
  const pedidos = { backups: 0, agendas: [] as unknown[] };
  let estado = structuredClone(ESTADO);
  await pagina.route('**/api/operacao/backups', (rota) => rota.fulfill({ json: estado }));
  await pagina.route('**/api/operacao/backups/pedidos', (rota) => {
    pedidos.backups += 1;
    return rota.fulfill({ status: 202, json: { jaNaFila: false } });
  });
  await pagina.route('**/api/operacao/agenda', (rota) => {
    const corpo = rota.request().postDataJSON() as { horario: string; diaDoTeste: number };
    pedidos.agendas.push(corpo);
    if (corpo.horario > estado.agenda.janela.fim) {
      return rota.fulfill({
        status: 400,
        contentType: 'application/problem+json',
        json: {
          type: 'urn:grafite:problema:dados-invalidos',
          title: 'Dados inválidos',
          status: 400,
          detail: 'Confira os campos indicados.',
          codigoDeRastreio: 'R7K2-9QXM',
          campos: { horario: 'Escolha um horário entre 00:00 e 06:00.' },
        },
      });
    }
    estado = {
      ...estado,
      agenda: { ...estado.agenda, ...corpo },
      proximoBackup: '2026-10-08T06:30:00.000Z',
    };
    return rota.fulfill({ json: estado });
  });
  return pedidos;
}

test.describe('no ambiente de teste', () => {
  test.use({ ambiente: 'teste' });

  test('a barra mostra "Ambiente de teste" antes da busca', async ({ page }) => {
    await page.goto('/');
    const barra = page.getByRole('banner');
    const aviso = barra.getByText('Ambiente de teste');
    await expect(aviso).toBeVisible();
    const antes = await aviso.evaluate(
      (elemento) =>
        elemento.compareDocumentPosition(document.querySelector('[aria-label="Buscar"]') as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(antes).toBeTruthy();
  });
});

test.describe('na entrada do ambiente de teste', () => {
  test.use({ ambiente: 'teste', semSessao: true });

  test('o aviso vem acima do usuário e da senha', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Ambiente de teste')).toBeVisible();
    await expect(
      page.getByText(
        'Os dados são uma cópia da produção. O que mudar aqui não vai para a produção.',
      ),
    ).toBeVisible();
    await expect(page.getByLabel('Usuário')).toBeFocused();
  });
});

test.describe('na produção', () => {
  test('a barra não mostra o aviso do ambiente', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner').getByRole('button', { name: 'Buscar' })).toBeVisible();
    await expect(page.getByRole('banner').getByText('Ambiente de teste')).toHaveCount(0);
  });
});

test.describe('numa organização que não opera o servidor', () => {
  test('a Administração não tem Backup, e o endereço dele leva à primeira seção', async ({
    page,
  }) => {
    await simularAdministracao(page);
    await page.goto('/administracao/backup');
    await expect(page).toHaveURL(/\/administracao\/pessoas$/);
    await expect(titulo(page, 'Pessoas')).toBeVisible();
    await expect(secoes(page).getByRole('link', { name: 'Backup' })).toHaveCount(0);
  });
});

test.describe('na organização que opera o servidor', () => {
  test.use({ operaOServidor: true });

  test('pede um backup, vê a recusa fora da janela e muda o horário', async ({ page }) => {
    const pedidos = await simularBackup(page);
    await page.goto('/administracao/backup');
    await expect(titulo(page, 'Backup')).toBeVisible();
    await expect(secoes(page).getByRole('link').last()).toHaveText('Backup');
    await expect(page.getByRole('list', { name: 'Backups' })).toContainText(`${DESTINO}: gravado`);

    await page.getByRole('button', { name: 'Fazer backup agora' }).click();
    await expect(avisos(page)).toContainText('Backup na fila.');

    const horario = page.getByRole('textbox', { name: 'Horário do backup' });
    await horario.fill('14:00');
    await page.getByRole('button', { name: 'Salvar horário' }).click();
    await expect(page.getByText('Escolha um horário entre 00:00 e 06:00.')).toBeVisible();

    await horario.fill('03:30');
    await page.getByRole('button', { name: 'Salvar horário' }).click();
    await expect(avisos(page)).toContainText('Horário do backup salvo.');
    await expect(page.getByText('Escolha um horário entre 00:00 e 06:00.')).toHaveCount(0);

    expect(pedidos.backups).toBe(1);
    expect(pedidos.agendas).toEqual([
      { horario: '14:00', diaDoTeste: 0 },
      { horario: '03:30', diaDoTeste: 0 },
    ]);
  });
});
