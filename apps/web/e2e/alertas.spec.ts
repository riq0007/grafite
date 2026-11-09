import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Specs alertas e modulo-alertas, com a web compilada e a API dos alertas simulada (change
// p3a-regras-e-alertas): a lista dos abertos com o reconhecer, a regra nova do toner e o alerta em
// "O que resolver agora".

const IMPRESSORA = '0199d3a0-0000-7000-8000-0000000000a1';
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });

const ALERTA = {
  id: '0199d3a0-0000-7000-8000-0000000000e1',
  regra: { id: '0199d3a0-0000-7000-8000-0000000000d1', nome: 'Toner em 10% ou menos' },
  condicao: 'toner.nivel',
  severidade: 'critico',
  texto: 'Toner preto em 8%',
  situacao: 'aberto',
  alvo: {
    tipo: 'ativo',
    id: IMPRESSORA,
    nome: 'Impressora do RH',
    patrimonio: 'PAT-00412',
    tipoDoAtivo: {
      id: '0199d3a0-0000-7000-8000-0000000000b1',
      nome: 'Impressora',
      icone: 'impressora',
    },
    imagem: null,
    modelo: null,
  },
  abertoEm: new Date(Date.now() - 32 * 60_000).toISOString(),
  resolvidoEm: null,
  comoTerminou: null,
  reconhecido: null as { nome: string; em: string } | null,
  adiado: null,
  silencio: null,
  permite: { tratar: true },
};

/** A API dos alertas: a lista, o reconhecimento e as regras, guardando o que a tela gravou. */
async function simularAlertas(pagina: Page) {
  const estado = { alerta: { ...ALERTA }, regras: [] as Record<string, unknown>[] };
  await pagina.route('**/api/alertas?*', (rota) =>
    rota.fulfill({ json: { itens: [estado.alerta], total: 1, proximo: null } }),
  );
  await pagina.route(`**/api/alertas/${ALERTA.id}/reconhecimento`, (rota) => {
    const reconhecido = { nome: 'Ana Souza', em: new Date().toISOString() };
    estado.alerta = { ...estado.alerta, reconhecido };
    return rota.fulfill({ json: { reconhecido } });
  });
  await pagina.route('**/api/regras-de-alerta', (rota) => {
    if (rota.request().method() === 'GET') {
      return rota.fulfill({ json: { regras: estado.regras, permite: { cadastrar: true } } });
    }
    const pedido = rota.request().postDataJSON() as Record<string, unknown>;
    const regra = {
      ...pedido,
      id: '0199d3a0-0000-7000-8000-0000000000d9',
      escopo: { tipo: 'organizacao', id: null, nome: null },
      situacao: 'ativa',
      deFabrica: false,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    estado.regras.push(regra);
    return rota.fulfill({ status: 201, json: regra });
  });
  await pagina.route('**/api/regras-de-alerta/0199d3a0-0000-7000-8000-0000000000d9', (rota) =>
    rota.fulfill({ json: estado.regras[0] }),
  );
  return estado;
}

test.describe('os alertas', () => {
  test('a lista dos abertos mostra o alerta, e o reconhecer diz quem reconheceu', async ({
    page,
  }) => {
    await simularAlertas(page);
    await page.goto('/alertas');
    await expect(page.getByRole('heading', { level: 1, name: /Alertas abertos/ })).toContainText(
      '1 aberto',
    );
    const linha = page.getByRole('row', { name: /Impressora do RH/ });
    await expect(linha).toContainText('Toner preto em 8%');
    await expect(linha).toContainText('Crítico');
    await expect(linha).toContainText('32 min');
    await linha.getByRole('button', { name: 'Reconhecer' }).click();
    await expect(avisos(page).getByText('Alerta reconhecido.')).toBeVisible();
    await expect(linha).toContainText('Reconhecido por Ana Souza');
  });

  test('quem administra cadastra a regra do toner, com o limite e a folga', async ({ page }) => {
    const estado = await simularAlertas(page);
    await page.goto('/alertas/regras');
    await page.getByRole('button', { name: 'Nova regra' }).first().click();
    await page.getByRole('textbox', { name: /^Nome/ }).fill('Toner em 20% ou menos');
    await page.getByRole('button', { name: /Condição$/ }).click();
    await page.getByRole('option', { name: 'Nível do toner', exact: true }).click();
    await page.getByRole('textbox', { name: /^Limite/ }).fill('20');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(avisos(page).getByText('Regra salva.')).toBeVisible();
    expect(estado.regras[0]).toMatchObject({
      nome: 'Toner em 20% ou menos',
      condicao: 'toner.nivel',
      parametros: { limite: 20, folga: 5 },
    });
    await expect(
      page.getByRole('heading', { level: 1, name: /Toner em 20% ou menos/ }),
    ).toBeVisible();
  });

  test('o alerta aberto aparece em "O que resolver agora" e abre a ficha do ativo', async ({
    page,
  }) => {
    await simularAlertas(page);
    await page.goto('/');
    const tabela = page.getByRole('grid', { name: 'Ocorrências abertas' });
    await expect(tabela).toContainText('Toner preto em 8%');
    await expect(tabela).toContainText('Impressora do RH');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('1 aberta');
    await tabela.getByText('Toner preto em 8%').click();
    await expect(page).toHaveURL(new RegExp(`/ativos/${IMPRESSORA}$`));
  });
});
