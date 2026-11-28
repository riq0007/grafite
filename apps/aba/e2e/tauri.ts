import type { Page } from '@playwright/test';

/** O que um comando do lado nativo responde na ponta a ponta. */
export type ComandosSimulados = Record<string, unknown>;

interface Simulacao {
  chamadas: Array<{ comando: string; args: unknown }>;
  emitir: (evento: string, payload: unknown) => void;
}

/**
 * O lado nativo simulado na página, antes dela carregar: o `window.__TAURI_INTERNALS__`, por onde o
 * `@tauri-apps/api` chama os comandos e ouve os eventos. Cada comando responde o que o teste deu; o
 * que nenhum teste deu falha, como um pedido sem simulação. Os eventos chegam pelo `emitir`, e as
 * chamadas ficam guardadas para o `chamadasDe`.
 */
export async function simularOTauri(pagina: Page, comandos: ComandosSimulados = {}) {
  await pagina.addInitScript((respostas) => {
    let seguinte = 1;
    const funcoes = new Map<number, (dado: unknown) => void>();
    const ouvintes = new Map<string, number[]>();
    const chamadas: Simulacao['chamadas'] = [];
    const deixarDeOuvir = (evento: string, id: number) => {
      ouvintes.set(
        evento,
        (ouvintes.get(evento) ?? []).filter((outro) => outro !== id),
      );
    };
    Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', {
      value: { unregisterListener: deixarDeOuvir },
    });
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        metadata: { currentWindow: { label: 'aba' }, currentWebview: { label: 'aba' } },
        transformCallback: (funcao: (dado: unknown) => void) => {
          const id = seguinte++;
          funcoes.set(id, funcao);
          return id;
        },
        unregisterCallback: (id: number) => funcoes.delete(id),
        invoke: async (comando: string, args: Record<string, unknown> = {}) => {
          chamadas.push({ comando, args });
          if (comando === 'plugin:event|listen') {
            const evento = String(args.event);
            const id = Number(args.handler);
            ouvintes.set(evento, [...(ouvintes.get(evento) ?? []), id]);
            return id;
          }
          if (comando === 'plugin:event|unlisten') {
            deixarDeOuvir(String(args.event), Number(args.eventId));
            return null;
          }
          if (comando in respostas) return respostas[comando];
          throw new Error(`O teste não simulou o comando ${comando}.`);
        },
      },
    });
    const simulacao: Simulacao = {
      chamadas,
      emitir: (evento, payload) => {
        for (const id of ouvintes.get(evento) ?? [])
          funcoes.get(id)?.({ event: evento, id, payload });
      },
    };
    Object.defineProperty(window, '__simulacaoDoTauri', { value: simulacao });
  }, comandos);
}

type JanelaSimulada = Window & { __simulacaoDoTauri: Simulacao };

/** Um evento do lado nativo chegando à tela, como o `emit` do Rust. */
export async function emitir(pagina: Page, evento: string, payload: unknown) {
  await pagina.evaluate(
    ({ evento, payload }) =>
      (window as unknown as JanelaSimulada).__simulacaoDoTauri.emitir(evento, payload),
    { evento, payload },
  );
}

/** Os argumentos de cada chamada de um comando, na ordem. */
export async function chamadasDe(pagina: Page, comando: string): Promise<unknown[]> {
  return pagina.evaluate(
    (comando) =>
      (window as unknown as JanelaSimulada).__simulacaoDoTauri.chamadas
        .filter((chamada) => chamada.comando === comando)
        .map((chamada) => chamada.args),
    comando,
  );
}
