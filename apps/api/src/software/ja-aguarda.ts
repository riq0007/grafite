// A máquina que já aguarda o pacote (spec distribuicao-de-software, "Distribuição às máquinas" e
// "Tentar de novo e tirar da fila"; change software-por-pacote, design, decisões 10 e 11): a
// distribuição em que cada máquina aguarda ou instala cada pacote, para a classe "já aguarda" do
// assistente, a recusa do "Tentar de novo", a `aguardaNoutra` e o "JÁ NA FILA" da ficha.
import {
  distribuicoes,
  maquinasDasDistribuicoes,
  type QUANDOS_DA_DISTRIBUICAO,
  type Transacao,
} from '@grafite/db';
import { and, desc, eq, inArray } from 'drizzle-orm';

/** A outra distribuição, como a tela a escreve: o id, o envio e o quando. */
export interface OutraDistribuicao {
  id: string;
  criadaEm: string;
  quando: {
    chave: (typeof QUANDOS_DA_DISTRIBUICAO)[number];
    aPartirDe: string | null;
    fuso: string | null;
  };
}

/** A chave do mapa do `ondeJaAguardam`: a máquina e o pacote. */
export const naFilaDe = (ativoId: string, pacoteId: string) => `${ativoId}:${pacoteId}`;

/**
 * A distribuição em que cada máquina aguarda ou instala cada pacote, a mais nova quando há mais de
 * uma, pela chave do `naFilaDe`. A que falhou, a concluída e a tirada da fila não contam. Sem os
 * pacotes, vale qualquer um.
 */
export async function ondeJaAguardam(
  tx: Transacao,
  { ativoIds, pacoteIds }: { ativoIds: readonly string[]; pacoteIds?: readonly string[] },
): Promise<Map<string, OutraDistribuicao>> {
  const resultado = new Map<string, OutraDistribuicao>();
  if (ativoIds.length === 0) return resultado;
  const linhas = await tx
    .select({
      ativoId: maquinasDasDistribuicoes.ativoId,
      pacoteId: distribuicoes.pacoteId,
      id: distribuicoes.id,
      criadaEm: distribuicoes.criadaEm,
      quando: distribuicoes.quando,
      aPartirDe: distribuicoes.aPartirDe,
      fuso: distribuicoes.fuso,
    })
    .from(maquinasDasDistribuicoes)
    .innerJoin(distribuicoes, eq(distribuicoes.id, maquinasDasDistribuicoes.distribuicaoId))
    .where(
      and(
        inArray(maquinasDasDistribuicoes.ativoId, [...ativoIds]),
        pacoteIds ? inArray(distribuicoes.pacoteId, [...pacoteIds]) : undefined,
        inArray(maquinasDasDistribuicoes.situacao, ['aguardando', 'em-andamento']),
      ),
    )
    .orderBy(desc(distribuicoes.criadaEm), desc(distribuicoes.id));
  for (const linha of linhas) {
    const chave = naFilaDe(linha.ativoId, linha.pacoteId);
    if (resultado.has(chave)) continue;
    resultado.set(chave, {
      id: linha.id,
      criadaEm: linha.criadaEm.toISOString(),
      quando: {
        chave: linha.quando,
        aPartirDe: linha.aPartirDe?.toISOString() ?? null,
        fuso: linha.fuso,
      },
    });
  }
  return resultado;
}
