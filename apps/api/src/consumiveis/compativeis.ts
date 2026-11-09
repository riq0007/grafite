// Os consumíveis compatíveis de um modelo (spec consumiveis, "Compatibilidade com os modelos" e
// "Quem vê e quem edita os consumíveis"; change p4b-consumiveis, design, decisão 5): os ativos que
// têm o modelo, na ordem do domínio, só com o código, o nome, o tipo, a cor e o rendimento, como
// referência do modelo. Eles só existem nos modelos dos tipos que ligam a capacidade, e a ficha do
// ativo só os traz com o Operação ligado. Na ficha do ativo, cada um traz o saldo somado nos locais
// em que a conta vê o estoque (change p4c-estoque, design, decisão 6).
import {
  CORES_DE_CONSUMIVEL_NO_BANCO,
  consumiveis,
  consumiveisDosModelos,
  organizacoes,
  saldosDoEstoque,
  TIPOS_DE_CONSUMIVEL_NO_BANCO,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import { ordenarConsumiveis } from '@grafite/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { localEm } from '../estoque/leitura.ts';

/** A capacidade que dá aos modelos do tipo os consumíveis compatíveis. */
export const CAPACIDADE_DOS_CONSUMIVEIS = 'consumiveis.compatibilidade';

export const ConsumivelCompativel = z
  .object({
    id: z.uuid(),
    codigo: z.string(),
    nome: z.string().nullable(),
    tipo: z.enum(TIPOS_DE_CONSUMIVEL_NO_BANCO),
    cor: z.enum(CORES_DE_CONSUMIVEL_NO_BANCO).nullable(),
    rendimento: z.number().int().nullable(),
    /** O saldo somado nos locais em que a conta vê o estoque; nulo sem `estoque.ver`. */
    saldo: z.number().int().nullable(),
  })
  .meta({ id: 'ConsumivelCompativel' });

export type ConsumivelCompativel = z.infer<typeof ConsumivelCompativel>;

/** Onde a conta vê o estoque: a organização inteira, os locais do ramo, ou nada. */
export type AlcanceDoEstoque = 'organizacao' | ReadonlySet<string> | null;

/** O saldo de cada consumível, somado nos locais do alcance. */
async function saldosNoAlcance(
  tx: Transacao,
  consumivelIds: readonly string[],
  estoque: 'organizacao' | ReadonlySet<string>,
): Promise<Map<string, number>> {
  if (consumivelIds.length === 0) return new Map();
  const linhas = await tx
    .select({
      consumivelId: saldosDoEstoque.consumivelId,
      saldo: sql<number>`sum(${saldosDoEstoque.saldo})::int`,
    })
    .from(saldosDoEstoque)
    .where(
      and(
        inArray(saldosDoEstoque.consumivelId, [...consumivelIds]),
        estoque === 'organizacao' ? undefined : localEm(saldosDoEstoque.localId, [...estoque]),
      ),
    )
    .groupBy(saldosDoEstoque.consumivelId);
  return new Map(linhas.map(({ consumivelId, saldo }) => [consumivelId, saldo]));
}

/** Os consumíveis ativos que têm o modelo, pelo tipo e pelo código, com o saldo do alcance. */
export async function compativeisDoModelo(
  tx: Transacao,
  modeloId: string,
  estoque: AlcanceDoEstoque = null,
): Promise<ConsumivelCompativel[]> {
  const linhas = await tx
    .select({
      id: consumiveis.id,
      codigo: consumiveis.codigo,
      nome: consumiveis.nome,
      tipo: consumiveis.tipo,
      cor: consumiveis.cor,
      rendimento: consumiveis.rendimento,
    })
    .from(consumiveisDosModelos)
    .innerJoin(consumiveis, eq(consumiveis.id, consumiveisDosModelos.consumivelId))
    .where(and(eq(consumiveisDosModelos.modeloId, modeloId), eq(consumiveis.situacao, 'ativo')));
  const saldos =
    estoque === null
      ? null
      : await saldosNoAlcance(
          tx,
          linhas.map(({ id }) => id),
          estoque,
        );
  return ordenarConsumiveis(
    linhas.map((linha) => ({ ...linha, saldo: saldos ? (saldos.get(linha.id) ?? 0) : null })),
  );
}

/** O tipo liga a capacidade dos consumíveis compatíveis. */
export async function tipoComCompativeis(tx: Transacao, tipoId: string): Promise<boolean> {
  const [tipo] = await tx
    .select({ capacidades: tiposDeAtivo.capacidades })
    .from(tiposDeAtivo)
    .where(eq(tiposDeAtivo.id, tipoId));
  return tipo?.capacidades.includes(CAPACIDADE_DOS_CONSUMIVEIS) ?? false;
}

/**
 * Os compatíveis do modelo do ativo, para o cartão da ficha: nulo quando o tipo não liga a
 * capacidade ou o Operação está desligado, e vazio no ativo sem modelo.
 */
export async function compativeisDoAtivo(
  tx: Transacao,
  { tipoId, modeloId }: { tipoId: string; modeloId: string | null },
  estoque: AlcanceDoEstoque,
): Promise<ConsumivelCompativel[] | null> {
  if (!(await tipoComCompativeis(tx, tipoId))) return null;
  const [organizacao] = await tx
    .select({ desligados: organizacoes.modulosDesligados })
    .from(organizacoes)
    .where(eq(organizacoes.id, sql`app.current_org()`));
  if (!organizacao || organizacao.desligados.includes('operacao')) return null;
  return modeloId ? compativeisDoModelo(tx, modeloId, estoque) : [];
}
