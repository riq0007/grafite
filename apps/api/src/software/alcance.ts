// O alcance da distribuição (spec distribuicao-de-software, "Histórico das distribuições"; change
// software-por-pacote, design, decisão 16): a distribuição mostra e conta só as máquinas dos locais
// em que a conta tem `software.distribuir`, pelo local de hoje do ativo de cada uma, como a base, a
// matriz e a prévia já fazem. A máquina sem local só entra pela organização.
import { ativos, distribuicoes, maquinasDasDistribuicoes, type Transacao } from '@grafite/db';
import { type Acesso, type ArvoreDeLocais, alcance } from '@grafite/domain';
import { and, eq, exists, inArray, type SQL, sql } from 'drizzle-orm';

/** A organização inteira, ou os locais em que a conta distribui, com os de baixo. */
export type AlcanceDaDistribuicao = 'organizacao' | ReadonlySet<string>;

/** O alcance do `software.distribuir`; `null` quando a conta não distribui em lugar nenhum. */
export const alcanceDaDistribuicao = (
  acesso: Acesso,
  arvore: Pick<ArvoreDeLocais, 'ramo'>,
): AlcanceDaDistribuicao | null => alcance(acesso, 'software.distribuir', arvore);

/** O ativo da máquina da distribuição. */
export const doAtivoDaMaquina = and(
  eq(ativos.orgId, maquinasDasDistribuicoes.orgId),
  eq(ativos.id, maquinasDasDistribuicoes.ativoId),
);

/** O local do ativo está no alcance. */
export const noAlcance = (escopo: AlcanceDaDistribuicao, localId: string | null) =>
  escopo === 'organizacao' || (localId !== null && escopo.has(localId));

/** A máquina no alcance, como condição sobre `ativos`; nenhuma condição para a organização. */
export const maquinaNoAlcance = (escopo: AlcanceDaDistribuicao): SQL | undefined =>
  escopo === 'organizacao' ? undefined : inArray(ativos.localId, [...escopo]);

/**
 * A distribuição com alguma máquina no alcance, como condição sobre `distribuicoes`: vai no SQL para
 * o limite das mais novas valer depois dela.
 */
export function comMaquinaNoAlcance(tx: Transacao, escopo: AlcanceDaDistribuicao) {
  const daMaquina = maquinaNoAlcance(escopo);
  if (!daMaquina) return undefined;
  return exists(
    tx
      .select({ um: sql`1` })
      .from(maquinasDasDistribuicoes)
      .innerJoin(ativos, doAtivoDaMaquina)
      .where(and(eq(maquinasDasDistribuicoes.distribuicaoId, distribuicoes.id), daMaquina)),
  );
}
