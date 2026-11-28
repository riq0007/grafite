import { useDoNativo } from './doNativo.ts';
import { type EstadoDaAba, lerEstado, ouvirEstado } from './nativo.ts';

/** O aviso da aba fechada: o resumo, quem respondeu (com uma só) e a chegada, que faz o ponto pulsar. */
export interface AvisoDaResposta {
  resumo: string;
  quem: string | null;
  chegada: string;
}

/** O estado sem o lado nativo responder: nada por ler, ninguém pela senha e o atalho livre. */
export const ESTADO_DE_FABRICA: EstadoDaAba = {
  naoLidas: 0,
  respostasNovas: 0,
  porVer: null,
  pessoa: null,
  atalhoOcupado: false,
};

export function useEstado(): EstadoDaAba {
  return useDoNativo(lerEstado, ouvirEstado, ESTADO_DE_FABRICA) ?? ESTADO_DE_FABRICA;
}

/**
 * O aviso conta os chamados com resposta por ver, e não as mensagens: com um, "1 resposta nova",
 * com o nome de quem respondeu por último; com mais, "3 respostas novas".
 */
export function avisoDaResposta(porVer: EstadoDaAba['porVer']): AvisoDaResposta | null {
  if (!porVer || porVer.quantas <= 0) return null;
  const { quantas, ultima } = porVer;
  return {
    resumo: quantas === 1 ? '1 resposta nova' : `${quantas} respostas novas`,
    quem: quantas === 1 ? (ultima?.quem ?? null) : null,
    chegada: ultima ? `${ultima.numero} ${ultima.momento}` : String(quantas),
  };
}

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** A hora da resposta, como "09:21". */
export function horaDa(momento: string): string {
  const data = new Date(momento);
  return Number.isNaN(data.getTime()) ? '' : HORA.format(data);
}

/** O selo de "Abrir chat": as não lidas do chat, como "4 não lidas". */
export function seloDasNaoLidas(naoLidas: number | null): string | null {
  if (!naoLidas || naoLidas <= 0) return null;
  return naoLidas === 1 ? '1 não lida' : `${naoLidas} não lidas`;
}

/** O selo de "Visualizar chamados": as respostas novas, como "1 nova". */
export function seloDasNovas(novas: number | null): string | null {
  if (!novas || novas <= 0) return null;
  return novas === 1 ? '1 nova' : `${novas} novas`;
}
