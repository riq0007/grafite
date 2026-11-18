import type { Page } from '@playwright/test';
import { RENATO, simularChamados } from './api-dos-chamados.ts';
import { expect, test } from './fixtures.ts';

// Specs chamados e modulo-chamados (change chamados-da-ti, tarefa 5.8, e revisão da 4.12): o
// cenário "Assumir pela tela de antes", com a web compilada e a API simulada, que confere a versão
// como a API. A tela manda a versão que mostra, a recusa vai no aviso crítico com a frase da API, e
// a tela relê o quadro sem esperar o evento. Pela tela relida, o assumir manda a versão nova e passa.

const ENDERECO = '/chamados/quem-esta-com-o-que';

const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });
const coluna = (pagina: Page, nome: string) =>
  pagina.getByRole('region', { name: nome, exact: true });
const quadradoNa = (pagina: Page, nomeDaColuna: string, numero: number) =>
  coluna(pagina, nomeDaColuna).getByRole('article', { name: new RegExp(`^#${numero} `) });
const previaDo = (pagina: Page, numero: number) =>
  pagina.getByRole('group', { name: `Prévia do #${numero}`, exact: true });

/**
 * O mouse para no quadrado, a prévia abre, e o clique é no "Assumir" dela. As colunas rolam até o
 * quadrado antes: a rolagem que chega depois do movimento cancela a espera da prévia (decisão 22).
 */
async function assumirPelaPrevia(
  pagina: Page,
  quadrado: ReturnType<typeof quadradoNa>,
  numero: number,
) {
  await quadrado.scrollIntoViewIfNeeded();
  await quadrado.hover();
  await previaDo(pagina, numero).getByRole('button', { name: 'Assumir' }).click();
}

test('Assumir pela tela de antes: a recusa avisa e relê, e o assumir pela tela relida passa', async ({
  page,
}) => {
  const chamados = await simularChamados(page);
  await page.goto(ENDERECO);
  await expect(quadradoNa(page, 'Sem responsável', 1038)).toBeVisible();

  // Diego passa o #1038 a Renato, e a tela de Ana, aberta antes, ainda o mostra na triagem.
  chamados.passar(1038, RENATO);
  await assumirPelaPrevia(page, quadradoNa(page, 'Sem responsável', 1038), 1038);

  const recusa = 'O chamado #1038 mudou. Confira antes de assumir.';
  await expect(
    avisos(page).locator('[data-situacao="critico"]').filter({ hasText: recusa }),
  ).toBeVisible();
  expect(chamados.pedidos).toEqual([{ acao: 'assumir', numero: 1038, corpo: { versao: 1 } }]);
  // A tela relê sem o evento: o #1038 está com Renato, e continua com ele.
  await expect(quadradoNa(page, 'Renato Alves', 1038)).toBeVisible();
  await expect(quadradoNa(page, 'Sem responsável', 1038)).toHaveCount(0);
  expect(chamados.responsavelDo(1038)).toEqual(RENATO);

  // Pela tela relida, o assumir manda a versão que o passar de Diego deixou, e a API o aceita.
  await assumirPelaPrevia(page, quadradoNa(page, 'Renato Alves', 1038), 1038);
  await expect(
    avisos(page).locator('[data-situacao="sucesso"]').filter({ hasText: 'Você assumiu o #1038.' }),
  ).toBeVisible();
  expect(chamados.pedidos.at(-1)).toEqual({ acao: 'assumir', numero: 1038, corpo: { versao: 2 } });
  await expect(quadradoNa(page, 'Ana Souza', 1038)).toBeVisible();
});
