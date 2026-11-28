import type { Page } from '@playwright/test';

/** O que um comando do lado nativo responde na ponta a ponta. */
export type ComandosSimulados = Record<string, unknown>;

/**
 * O lado nativo simulado na página, antes dela carregar: o `window.__TAURI_INTERNALS__`, por onde o
 * `@tauri-apps/api` chama os comandos. Cada comando responde o que o teste deu; o que nenhum teste
 * deu falha, como um pedido sem simulação.
 */
export async function simularOTauri(pagina: Page, comandos: ComandosSimulados = {}) {
  await pagina.addInitScript((respostas) => {
    let seguinte = 1;
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        metadata: { currentWindow: { label: 'aba' }, currentWebview: { label: 'aba' } },
        transformCallback: () => seguinte++,
        invoke: async (comando: string) => {
          if (comando in respostas) return respostas[comando];
          throw new Error(`O teste não simulou o comando ${comando}.`);
        },
      },
    });
  }, comandos);
}
