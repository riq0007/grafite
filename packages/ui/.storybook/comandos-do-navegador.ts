// Comandos que os testes do catálogo pedem ao Playwright, fora da página (Vitest em modo navegador).
import type { BrowserCommand } from 'vitest/node';

/**
 * Tira o cursor real do navegador de cima da página. As histórias usam eventos de ponteiro
 * sintéticos; com o cursor real parado sobre a história, o Chromium atualiza o hover dele
 * depois de renderizar, disparando `pointerover` de verdade. No CI isso chegava logo depois do
 * hover sintético, e o React Aria o encerrava. Fora da janela, não há elemento sob o cursor.
 */
export const tirarPonteiroDaPagina: BrowserCommand<[]> = async ({ page }) => {
  await page.mouse.move(-1, -1);
};

/**
 * Põe o cursor real do navegador sobre o elemento da história, no meio dele ou no ponto dado, a
 * partir do canto de cima à esquerda. O `:hover` do CSS só liga com o cursor de verdade: os eventos
 * de ponteiro sintéticos das histórias não o ligam.
 */
export const porPonteiroSobre: BrowserCommand<
  [seletor: string, ponto?: { x: number; y: number }]
> = async ({ iframe }, seletor, ponto) => {
  await iframe.locator(seletor).hover({ position: ponto });
};

/** Aperta uma tecla de verdade, como a que rola a área em foco ou a que liga o `:focus-visible`. */
export const apertarTecla: BrowserCommand<[tecla: string]> = async ({ page }, tecla) => {
  await page.keyboard.press(tecla);
};
