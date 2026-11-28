import { useDoNativo } from './doNativo.ts';
import { type EstadoDaAba, lerEstado, ouvirEstado } from './nativo.ts';

/** O estado sem o lado nativo responder: nada por ler, ninguém pela senha e o atalho livre. */
export const ESTADO_DE_FABRICA: EstadoDaAba = {
  naoLidas: 0,
  respostasNovas: 0,
  pessoa: null,
  atalhoOcupado: false,
};

export function useEstado(): EstadoDaAba {
  return useDoNativo(lerEstado, ouvirEstado, ESTADO_DE_FABRICA) ?? ESTADO_DE_FABRICA;
}

/** O selo de "Abrir chat": as não lidas do chat, como "4 não lidas". */
export function seloDasNaoLidas(naoLidas: number): string | null {
  if (naoLidas <= 0) return null;
  return naoLidas === 1 ? '1 não lida' : `${naoLidas} não lidas`;
}

/** O selo de "Visualizar chamados": as respostas novas, como "1 nova". */
export function seloDasNovas(novas: number): string | null {
  if (novas <= 0) return null;
  return novas === 1 ? '1 nova' : `${novas} novas`;
}
