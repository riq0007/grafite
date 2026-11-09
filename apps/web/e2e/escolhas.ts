// As escolhas da biblioteca na ponta a ponta, como o usuário as faz: a de local abre o painel pelo
// campo, filtra pelo nome e escolhe pelo caminho completo (spec componentes-base, "Escolha de local
// em árvore").
import { expect, type Locator, type Page } from '@playwright/test';

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * O campo da escolha de local: o botão cujo nome é o rótulo seguido do caminho escolhido, ou de
 * "Escolha um local".
 */
export const campoDeLocal = (dentro: Page | Locator, campo: string, valor?: string) =>
  dentro.getByRole('button', {
    name: valor === undefined ? new RegExp(`^${escapar(campo)} `) : `${campo} ${valor}`,
    exact: valor !== undefined,
  });

/** Escolhe o local pelo caminho: abre o painel, filtra pelo último nome dele e escolhe. */
export async function escolherLocal(
  pagina: Page,
  campo: string,
  caminho: string,
  dentro: Page | Locator = pagina,
) {
  await campoDeLocal(dentro, campo).click();
  const painel = pagina.getByRole('dialog', { name: campo, exact: true });
  await painel
    .getByRole('searchbox', { name: 'Filtrar' })
    .fill(caminho.split(' › ').at(-1) ?? caminho);
  await painel.getByRole('option', { name: caminho, exact: true }).click();
  await expect(painel).toHaveCount(0);
  await expect(campoDeLocal(dentro, campo, caminho)).toBeVisible();
}

/** Escolhe o escopo "Num local" na gaveta da atribuição, pelo segmento. */
export async function escolherEscopoNumLocal(gaveta: Locator) {
  await gaveta.getByText('Num local', { exact: true }).click();
  await expect(gaveta.getByRole('radio', { name: 'Num local' })).toBeChecked();
}

/**
 * Atribui um perfil pela gaveta: o perfil nos rádios, o escopo no segmentado e, num local, o local
 * pela árvore. Devolve a gaveta, para quem testa conferir o resultado antes de confirmar.
 */
export async function preencherAtribuicao(
  pagina: Page,
  titulo: string,
  perfil: string,
  local?: string,
) {
  const gaveta = pagina.getByRole('dialog', { name: titulo });
  // O rádio fica sob a bolinha desenhada: o clique vai ao rótulo, como o do usuário.
  await gaveta.getByText(perfil, { exact: true }).click();
  await expect(
    gaveta.getByRole('radio', { name: new RegExp(`^${escapar(perfil)}`) }),
  ).toBeChecked();
  if (local) {
    await escolherEscopoNumLocal(gaveta);
    await escolherLocal(pagina, 'Local', local, gaveta);
  }
  return gaveta;
}
