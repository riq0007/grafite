// As categorias de fábrica da base de software (spec distribuicao-de-software, "Categorias da base";
// change software-por-pacote, design, decisão 3): a organização nova nasce com as 7, na ordem, com a
// auditoria de quem as garante, o comando que cria a organização. A organização que já tem alguma
// categoria não ganha nenhuma, para não refazer a que a TI removeu.
import { categoriasDeSoftware, type Transacao } from '@grafite/db';
import { CATEGORIAS_DE_SOFTWARE_DE_FABRICA, normalizarTexto } from '@grafite/domain';
import { sql } from 'drizzle-orm';
import { type Ator, registrarNaAuditoria } from '../auditoria.ts';

/** Cria as categorias de fábrica na organização do contexto, se ela não tem nenhuma. */
export async function garantirCategoriasDeFabrica(
  tx: Transacao,
  { ator, momento }: { ator: Ator; momento: Date },
): Promise<number> {
  const [existente] = await tx
    .select({ id: categoriasDeSoftware.id })
    .from(categoriasDeSoftware)
    .limit(1);
  if (existente) return 0;
  const criadas = await tx
    .insert(categoriasDeSoftware)
    .values(
      CATEGORIAS_DE_SOFTWARE_DE_FABRICA.map((nome, posicao) => ({
        orgId: sql`app.current_org()`,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        ordem: posicao + 1,
        criadaEm: momento,
      })),
    )
    .returning();
  for (const linha of criadas.sort((a, b) => a.ordem - b.ordem)) {
    await registrarNaAuditoria(tx, {
      acao: 'categoria-de-software.criada',
      ator,
      alvo: { tipo: 'categoria-de-software', id: linha.id },
      depois: { nome: linha.nome, ordem: linha.ordem },
      momento,
    });
  }
  return criadas.length;
}
