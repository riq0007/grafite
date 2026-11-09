// As mudanças numa camada das preferências (merge patch, RFC 7396): a sincronia das preferências da
// conta e o rascunho dos padrões da organização juntam, normalizam e contam as mudanças do mesmo
// jeito, campo a campo.
import {
  type AjustesDasPreferencias,
  aplicarMudanca,
  lerAjustes,
  type MudancaDasPreferencias,
  PADRAO_DE_FABRICA,
  type SecaoDePreferencias,
} from '@grafite/domain';

type Campos = Record<string, unknown>;

const SECOES = Object.keys(PADRAO_DE_FABRICA) as SecaoDePreferencias[];

/** Cada campo da seção tirado da camada, como "Restaurar padrões" pede. */
export const camposNulos = (secao: SecaoDePreferencias): Campos =>
  Object.fromEntries(Object.keys(PADRAO_DE_FABRICA[secao]).map((campo) => [campo, null]));

/** Junta duas mudanças: a segunda vale por cima da primeira, campo a campo. */
export function juntar(
  primeira: MudancaDasPreferencias,
  segunda: MudancaDasPreferencias,
): MudancaDasPreferencias {
  const juntas: Record<string, Campos | null> = { ...(primeira as Record<string, Campos | null>) };
  for (const [secao, campos] of Object.entries(segunda as Record<string, Campos | null>)) {
    const anteriores = juntas[secao];
    juntas[secao] =
      campos === null
        ? null
        : {
            ...(anteriores === null ? camposNulos(secao as SecaoDePreferencias) : anteriores),
            ...campos,
          };
  }
  return juntas as MudancaDasPreferencias;
}

/**
 * Uma mudança pronta para a API: o valor fora do intervalo vai preso ao limite, e o desconhecido,
 * como um fuso que o navegador não reconhece, tira o ajuste da camada, para valer o de baixo.
 */
export function normalizar(secao: SecaoDePreferencias, mudanca: Campos): Campos {
  const normalizada: Campos = {};
  for (const [campo, valor] of Object.entries(mudanca)) {
    if (valor === undefined) continue;
    const lida = lerAjustes({ [secao]: { [campo]: valor } }) as Record<string, Campos | undefined>;
    normalizada[campo] = lida[secao]?.[campo] ?? null;
  }
  return normalizada;
}

/** Quantos ajustes a mudança muda na camada, sem contar o que já estava assim. */
export function contarMudancas(
  camada: AjustesDasPreferencias,
  mudanca: MudancaDasPreferencias,
): number {
  const antes = camada as Record<string, Campos | undefined>;
  const depois = aplicarMudanca(camada, mudanca) as Record<string, Campos | undefined>;
  let quantas = 0;
  for (const secao of SECOES) {
    for (const campo of Object.keys(PADRAO_DE_FABRICA[secao])) {
      if (JSON.stringify(antes[secao]?.[campo]) !== JSON.stringify(depois[secao]?.[campo])) {
        quantas++;
      }
    }
  }
  return quantas;
}
