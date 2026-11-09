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
