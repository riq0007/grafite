// As contagens no escopo de quem vê (change relacoes-vivas, design, decisão 1): quantos registros a
// conta vê e se o escopo dela recorta o total. O total sem o escopo é contado na mesma consulta só
// para saber se difere, e o número dele nunca sai daqui.
import { ativos, type Transacao } from '@grafite/db';
import { type Acesso, type ArvoreDeLocais, alcance } from '@grafite/domain';
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';

export const ContagemNoEscopo = z
  .object({
    /** Quantos a conta vê. */
    quantos: z.number().int().min(0),
    /** O escopo de quem vê recorta o total: a tela diz "que você vê". */
    recortada: z.boolean(),
  })
  .meta({ id: 'ContagemNoEscopo' });

export type ContagemNoEscopo = z.infer<typeof ContagemNoEscopo>;

/** O alcance de uma permissão, como o domínio o devolve, para quem a tem. */
export type AlcanceDaContagem = 'organizacao' | ReadonlySet<string>;

const quantosOnde = (condicao: SQL) =>
  sql<number>`count(*) filter (where ${condicao})`.mapWith(Number);

/**
 * Várias contagens da mesma tabela numa consulta só, cada uma com a condição dela sobre a comum, no
 * alcance pela coluna do local. O registro sem local só entra pela organização inteira.
 */
export async function contarNoEscopo<Chave extends string>(
  tx: Transacao,
  {
    tabela,
    onde,
    local,
    alcance,
    contagens,
  }: {
    tabela: PgTable;
    onde: SQL | undefined;
    local: PgColumn;
    alcance: AlcanceDaContagem;
    /** A condição de cada contagem; sem ela, a comum basta. */
    contagens: Record<Chave, SQL | undefined>;
  },
): Promise<Record<Chave, ContagemNoEscopo>> {
  const noEscopo =
    alcance === 'organizacao'
      ? undefined
      : alcance.size > 0
        ? inArray(local, [...alcance])
        : sql`false`;
  const chaves = Object.keys(contagens) as Chave[];
  const colunas: Record<string, SQL<number>> = {};
  for (const [posicao, chave] of chaves.entries()) {
    const condicao = and(sql`true`, contagens[chave]) as SQL;
    colunas[`vistos${posicao}`] = quantosOnde(and(condicao, noEscopo) as SQL);
    if (noEscopo) colunas[`total${posicao}`] = quantosOnde(condicao);
  }
  const [linha] = await tx.select(colunas).from(tabela).where(onde);
  return Object.fromEntries(
    chaves.map((chave, posicao) => {
      const vistos = linha?.[`vistos${posicao}`] ?? 0;
      const total = noEscopo ? (linha?.[`total${posicao}`] ?? 0) : vistos;
      return [chave, { quantos: vistos, recortada: vistos < total }];
    }),
  ) as Record<Chave, ContagemNoEscopo>;
}

/**
 * Os ativos que atendem à condição, sem os inativos, como a tabela os mostra ao abrir, no alcance de
 * `ativos.ver`; nulo para quem não vê ativos em nenhum ramo.
 */
export async function ativosNoEscopo(
  tx: Transacao,
  { acesso, arvore }: { acesso: Acesso; arvore: Pick<ArvoreDeLocais, 'ramo'> },
  onde: SQL,
): Promise<ContagemNoEscopo | null> {
  const alcanceDoVer = alcance(acesso, 'ativos.ver', arvore);
  if (alcanceDoVer === null) return null;
  const { ativos: contagem } = await contarNoEscopo(tx, {
    tabela: ativos,
    onde: and(eq(ativos.situacao, 'ativo'), onde),
    local: ativos.localId,
    alcance: alcanceDoVer,
    contagens: { ativos: undefined },
  });
  return contagem;
}
