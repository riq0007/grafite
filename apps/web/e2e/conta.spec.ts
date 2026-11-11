import type { Page } from '@playwright/test';
import { expect, semRolagemHorizontal, test } from './fixtures.ts';

// Spec ajustes-do-sistema, "Seção Conta", com a web compilada e a API simulada.

const CONTA = {
  usuario: 'ana.souza',
  nome: 'Ana Souza',
  email: 'ana.souza@exemplo.com.br',
  doisPassos: {
    situacao: 'ativa',
    exigida: true,
    exigidaPor: { conta: false, perfis: ['Administrador'] },
    codigosRestantes: 10,
  },
};

const SESSOES = [
  {
    id: '0199a6e0-0000-7000-8000-000000000001',
    dispositivo: 'Chrome no Windows',
    ip: '10.0.0.5',
    criadaEm: '2026-10-01T12:00:00.000Z',
    ultimoUsoEm: '2026-10-01T13:30:00.000Z',
    atual: true,
  },
  {
    id: '0199a6e0-0000-7000-8000-000000000002',
    dispositivo: 'Safari no iPhone',
    ip: null,
    criadaEm: '2026-09-30T22:15:00.000Z',
    ultimoUsoEm: '2026-10-01T11:05:00.000Z',
    atual: false,
  },
];

const titulo = (pagina: Page, nome: string) =>
  pagina.getByRole('heading', { level: 1, name: nome, exact: true });
const parte = (pagina: Page, nome: string) => pagina.getByRole('region', { name: nome });

async function simularAConta(pagina: Page) {
  await pagina.route('**/api/conta', (rota) => rota.fulfill({ json: CONTA }));
  await pagina.route('**/api/conta/sessoes', (rota) => rota.fulfill({ json: SESSOES }));
  await pagina.route('**/api/conta/aparelhos', (rota) =>
    rota.fulfill({ json: { prazo: { dias: 30, origem: { tipo: 'organizacao' } }, aparelhos: [] } }),
  );
}

test.beforeEach(({ page }) => simularAConta(page));

test('a seção Conta mostra os dados, a verificação em dois passos e as sessões', async ({
  page,
}) => {
  await page.goto('/ajustes/conta');
  await expect(titulo(page, 'Conta')).toBeVisible();
  await expect(parte(page, 'Dados da conta').getByText('ana.souza@exemplo.com.br')).toBeVisible();
  await expect(
    parte(page, 'Verificação em dois passos').getByText('Exigida pelo perfil Administrador'),
  ).toBeVisible();
  await expect(
    parte(page, 'Verificação em dois passos').getByText('Restam 10 códigos de recuperação.'),
  ).toBeVisible();
  await expect(
    parte(page, 'Aparelhos confiáveis').getByText('Nenhum aparelho confiável.'),
  ).toBeVisible();
  await expect(parte(page, 'Sessões').getByText('Esta sessão')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restaurar padrões' })).toHaveCount(0);
});

test('"sessoes" na busca abre a seção Conta com o foco nas sessões', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('sessoes');
  const busca = page.getByRole('dialog', { name: 'Busca' });
  await expect(busca.getByRole('option', { name: 'Sessões' })).toContainText('Ajustes › Conta');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/ajustes\/conta\?foco=sessoes$/);
  await expect(
    parte(page, 'Sessões').getByRole('button', { name: 'Encerrar', exact: true }),
  ).toBeFocused();
});

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a seção Conta cabe na largura, sem rolagem horizontal', async ({ page }) => {
    await page.goto('/ajustes/conta');
    await expect(parte(page, 'Sessões').getByText('Safari no iPhone')).toBeVisible();
    await semRolagemHorizontal(page);
  });
});
