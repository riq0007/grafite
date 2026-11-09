// Quem aparece na tela entre os avisos (spec componentes-base, "No máximo três avisos na tela";
// design do F1b, decisão 6). A fila do React Aria mostra os três mais novos e pode esconder um
// persistente; esta decide antes, e ela só desenha os que estão na tela.
import { tempos } from '../../tokens/tempos.ts';

export interface AvisoDaFila {
  chave: string;
  /** O crítico e os que pedem decisão: só saem por ação da pessoa, nunca por outro aviso. */
  persistente: boolean;
}

export interface EstadoDaFila {
  /** Os avisos à vista, o mais novo primeiro. */
  naTela: readonly AvisoDaFila[];
  /** Os que esperam vaga, na ordem de chegada. */
  esperando: readonly AvisoDaFila[];
}

/** O novo estado e o que muda na tela: os avisos que aparecem e as chaves dos que somem. */
export interface MudancaDaFila {
  estado: EstadoDaFila;
  entram: AvisoDaFila[];
  saem: string[];
}

export const FILA_VAZIA: EstadoDaFila = { naTela: [], esperando: [] };

/**
 * Um aviso chega. Com vaga, entra em cima. Sem vaga, sai o temporário mais antigo da tela. Se os
 * que estão na tela forem todos persistentes, o novo espera a vez.
 */
export function chegar(
  estado: EstadoDaFila,
  aviso: AvisoDaFila,
  maximo: number = tempos.aviso.maximoNaTela,
): MudancaDaFila {
  if (estado.naTela.length < maximo) {
    return { estado: { ...estado, naTela: [aviso, ...estado.naTela] }, entram: [aviso], saem: [] };
  }
  const maisAntigo = estado.naTela.findLastIndex((naTela) => !naTela.persistente);
  if (maisAntigo < 0) {
    return { estado: { ...estado, esperando: [...estado.esperando, aviso] }, entram: [], saem: [] };
  }
  const sai = estado.naTela[maisAntigo] as AvisoDaFila;
  return {
    estado: {
      ...estado,
      naTela: [aviso, ...estado.naTela.filter((_, indice) => indice !== maisAntigo)],
    },
    entram: [aviso],
    saem: [sai.chave],
  };
}

/**
 * Um aviso sai (tempo, fechar, reconhecer ou adiar). Se estava na tela, o primeiro da espera
 * aparece, em cima; se ainda esperava, só deixa a espera.
 */
export function sair(estado: EstadoDaFila, chave: string): MudancaDaFila {
  if (estado.esperando.some((aviso) => aviso.chave === chave)) {
    return {
      estado: { ...estado, esperando: estado.esperando.filter((aviso) => aviso.chave !== chave) },
      entram: [],
      saem: [],
    };
  }
  if (!estado.naTela.some((aviso) => aviso.chave === chave)) {
    return { estado, entram: [], saem: [] };
  }
  const restantes = estado.naTela.filter((aviso) => aviso.chave !== chave);
  const [proximo, ...esperando] = estado.esperando;
  if (!proximo) return { estado: { naTela: restantes, esperando }, entram: [], saem: [chave] };
  return {
    estado: { naTela: [proximo, ...restantes], esperando },
    entram: [proximo],
    saem: [chave],
  };
}
