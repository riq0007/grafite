import assert from 'node:assert/strict';
import { expect, semRolagemHorizontal, test } from './fixtures.ts';

test('configura o cadastro dos computadores e mostra IP e último contato', async ({
  page,
}, info) => {
  const tipo = '0199d3a0-0000-7000-8000-00000000b001';
  const local = '0199d3a0-0000-7000-8000-00000000d001';
  const unidade = '0199d3a0-0000-7000-8000-00000000d002';
  await page.route('**/api/locais', (rota) =>
    rota.fulfill({
      json: {
        locais: [
          { id: unidade, paiId: null, nome: 'Matriz', tipo: 'unidade', situacao: 'ativo' },
          {
            id: local,
            paiId: unidade,
            nome: 'Entrada de equipamentos',
            tipo: 'sala',
            situacao: 'ativo',
          },
        ],
      },
    }),
  );
  let configuracao: { tipoId: string | null; localId: string | null } = {
    tipoId: null,
    localId: null,
  };
  const corpos: unknown[] = [];
  await page.route('**/api/agentes', (rota) =>
    rota.fulfill({
      json: {
        endereco: null,
        agentes: [
          {
            id: '0199d3a0-0000-7000-8000-00000000a001',
            deviceid: 'ESTACAO-01-2026-11-03-00-00-00',
            nome: 'ESTACAO-01',
            versao: '1.21',
            serie: 'SERIE-DE-EXEMPLO',
            sistema: 'Windows 11 Pro',
            ip: '10.0.8.43',
            ativo: null,
            pendenciaCadastro: { motivo: 'parcial', campos: [] },
            ligadoAMao: false,
            ultimoContato: new Date().toISOString(),
            ultimoInventario: null,
            situacao: { tipo: 'neutra', texto: 'Sem inventário' },
          },
        ],
      },
    }),
  );
  await page.route('**/api/agentes/cadastro', async (rota) => {
    if (rota.request().method() === 'PUT') {
      configuracao = rota.request().postDataJSON();
      corpos.push(configuracao);
      await rota.fulfill({ status: 204 });
    } else
      await rota.fulfill({
        json: {
          ...configuracao,
          tipos: [{ id: tipo, nome: 'Computador' }],
          locais: [{ id: local, nome: 'Entrada de equipamentos' }],
        },
      });
  });
  await page.goto('/administracao/agentes');
  await expect(page.getByRole('grid', { name: 'Agentes' }).getByText('10.0.8.43')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Último contato' })).toBeVisible();
  await expect(page.getByText('Aguardando inventário completo')).toBeVisible();
  const campoTipo = page.getByRole('button', { name: /Tipo para novos computadores/ });
  const campoLocal = page.getByRole('button', { name: /Local de entrada/ });
  const [caixaTipo, caixaLocal] = await Promise.all([
    campoTipo.boundingBox(),
    campoLocal.boundingBox(),
  ]);
  assert(caixaTipo && caixaLocal, 'Os dois seletores devem estar visíveis.');
  expect(caixaTipo.x + caixaTipo.width).toBeLessThan(caixaLocal.x);
  await expect(page.getByRole('button', { name: 'Ligar ESTACAO-01 a um ativo' })).toBeInViewport({
    ratio: 0.95,
  });
  await page.getByRole('button', { name: /Tipo para novos computadores/ }).click();
  await page.getByRole('option', { name: 'Computador', exact: true }).click();
  await page.getByRole('button', { name: /Local de entrada/ }).click();
  await expect(page.getByRole('treegrid', { name: 'Local de entrada' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Filtrar' }).fill('Entrada');
  await page.getByRole('option', { name: 'Matriz › Entrada de equipamentos' }).click();
  await page.getByRole('button', { name: 'Salvar cadastro automático' }).click();
  await expect.poll(() => corpos).toEqual([{ tipoId: tipo, localId: local }]);
  await expect(page.getByText('Configuração do cadastro salva.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Tipo para novos computadores/ })).toContainText(
    'Computador',
  );
  await expect(page.getByRole('button', { name: /Local de entrada/ })).toContainText(
    'Matriz › Entrada de equipamentos',
  );
  await campoLocal.click();
  await page.getByRole('button', { name: 'Remover local' }).click();
  await page.getByRole('button', { name: 'Salvar cadastro automático' }).click();
  await expect.poll(() => corpos.at(-1)).toEqual({ tipoId: tipo, localId: null });
  await semRolagemHorizontal(page);
  await page.screenshot({ path: info.outputPath('cadastro-dos-computadores.png'), fullPage: true });
});

test('orienta como habilitar o cadastro quando não há tipo elegível', async ({ page }) => {
  await page.route('**/api/agentes', (rota) =>
    rota.fulfill({ json: { endereco: null, agentes: [] } }),
  );
  await page.route('**/api/agentes/cadastro', (rota) =>
    rota.fulfill({ json: { tipoId: null, localId: null, tipos: [], locais: [] } }),
  );
  await page.goto('/administracao/agentes');
  await expect(page.getByRole('link', { name: 'Tipos de ativo' })).toHaveAttribute(
    'href',
    '/gestao/catalogo/tipos',
  );
  await expect(page.getByText(/aguarde o próximo inventário/)).toBeVisible();
});
