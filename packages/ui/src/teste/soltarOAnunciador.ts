// Utilitário dos testes da web: o anunciador do React Aria, a região viva que lê os avisos para o
// leitor de tela, fica no documento de um teste para o outro. Fora de um `act`, o primeiro anúncio
// de cada arquivo espera 100 ms antes de escrever: se o arquivo termina nesse meio-tempo, o timer
// dispara depois de o ambiente sair, sem o `document`, e o Vitest reprova a suíte pelo erro solto.
// Fica fora do `anunciador.ts`, que o catálogo importa no navegador.
import { destroyAnnouncer } from 'react-aria/private/live-announcer/LiveAnnouncer';

/** Tira o anunciador do React Aria do documento: o anúncio que ainda espera não tem onde escrever. */
export function soltarOAnunciador(): void {
  try {
    destroyAnnouncer();
  } catch {
    // Um teste esvaziou o corpo e o nó do anunciador já saiu dele: o anúncio pendente confere se
    // o nó está no documento antes de escrever, e não escreve.
  }
}
