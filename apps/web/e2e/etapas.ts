// O cadastro do ativo em etapas e a ficha em cartões nas pontas a ponta (spec cadastro-de-ativos,
// "Cadastro do ativo em etapas" e "Aba Dados em cartões"; changes cadastro-em-etapas e
// ficha-em-cartoes): a lista das etapas, a etapa aberta pelo nome, o modelo procurado na etapa dele
// e o cartão da ficha aberto pela lista, como o usuário faz.
// O expect vem direto do Playwright, como nas escolhas: a ponta a ponta da pilha também os usa.
import { expect, type Page } from '@playwright/test';

/** A lista das etapas do cadastro. */
export const listaDasEtapas = (pagina: Page) =>
  pagina.getByRole('navigation', { name: 'Etapas do cadastro' });

/** A etapa pelo nome, como "Rede": o nome dela vem numerado, como "5 · Rede". */
export const etapa = (pagina: Page, nome: string) =>
  listaDasEtapas(pagina).getByRole('button', { name: new RegExp(`^\\d+ · ${nome}$`) });

/** O nome da etapa aberta, no painel. */
export const etapaAberta = (pagina: Page, nome: string) =>
  pagina.getByRole('heading', { level: 2, name: nome, exact: true });

/** Abre a etapa pela lista e espera o nome dela no painel. */
export async function abrirEtapa(pagina: Page, nome: string) {
  await etapa(pagina, nome).click();
  await expect(etapaAberta(pagina, nome)).toBeVisible();
}

/** Escolhe o modelo pela busca da etapa Modelo. */
export async function escolherModelo(pagina: Page, texto: string, opcao: string) {
  await abrirEtapa(pagina, 'Modelo');
  await pagina.getByRole('combobox', { name: 'Modelo' }).fill(texto);
  await pagina.getByRole('option', { name: opcao, exact: true }).click();
}

/** A lista dos cartões da aba Dados da ficha do ativo (change ficha-em-cartoes). */
export const listaDosCartoes = (pagina: Page) =>
  pagina.getByRole('navigation', { name: 'Grupos da ficha' });

/** O cartão da ficha pelo nome, como "Rede": sem a numeração das etapas. */
export const cartao = (pagina: Page, nome: string) =>
  listaDosCartoes(pagina).getByRole('button', { name: nome, exact: true });

/** Abre o cartão da ficha pela lista e espera o nome dele no painel, como a etapa. */
export async function abrirCartao(pagina: Page, nome: string) {
  await cartao(pagina, nome).click();
  await expect(etapaAberta(pagina, nome)).toBeVisible();
}
