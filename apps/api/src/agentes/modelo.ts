import { modelos, type Transacao } from '@grafite/db';
import { type InventarioDoAgente, normalizarTexto } from '@grafite/domain';
import { and, asc, eq } from 'drizzle-orm';
import { registrarNaAuditoria } from '../auditoria.ts';

/** Aproveita o catálogo, sem reativar modelos nem criar nomes fora dos limites dele. */
export async function modeloDoInventario(
  tx: Transacao,
  {
    orgId,
    tipo,
    inventario,
    momento,
    autor,
    ip,
  }: {
    orgId: string;
    tipo: { id: string; nome: string };
    inventario: InventarioDoAgente;
    momento: Date;
    autor: string;
    ip: string;
  },
) {
  let fabricante = inventario.fabricante;
  const nome = inventario.modelo;
  if (!fabricante || !nome || fabricante.length > 60 || nome.length > 80) return undefined;
  const fabricanteNormalizado = normalizarTexto(fabricante);
  const nomeNormalizado = normalizarTexto(nome);
  const [grafia] = await tx
    .select({ fabricante: modelos.fabricante })
    .from(modelos)
    .where(eq(modelos.fabricanteNormalizado, fabricanteNormalizado))
    .orderBy(asc(modelos.criadoEm), asc(modelos.id))
    .limit(1);
  fabricante = grafia?.fabricante ?? fabricante;
  const [novo] = await tx
    .insert(modelos)
    .values({
      orgId,
      tipoId: tipo.id,
      fabricante,
      fabricanteNormalizado,
      nome,
      nomeNormalizado,
      busca: normalizarTexto(`${fabricante} ${nome}`),
      criadoEm: momento,
      atualizadoEm: momento,
    })
    .onConflictDoNothing({
      target: [
        modelos.orgId,
        modelos.tipoId,
        modelos.fabricanteNormalizado,
        modelos.nomeNormalizado,
      ],
    })
    .returning();
  if (novo) {
    await registrarNaAuditoria(tx, {
      acao: 'modelo.criado',
      ator: { tipo: 'sistema', descricao: autor },
      alvo: { tipo: 'modelo', id: novo.id },
      depois: { tipo: tipo.nome, fabricante, nome, situacao: 'ativo' },
      origem: { ip },
      momento,
    });
    return novo.id;
  }
  const [existente] = await tx
    .select()
    .from(modelos)
    .where(
      and(
        eq(modelos.tipoId, tipo.id),
        eq(modelos.fabricanteNormalizado, fabricanteNormalizado),
        eq(modelos.nomeNormalizado, nomeNormalizado),
      ),
    )
    .for('share');
  return existente?.situacao === 'ativo' ? existente.id : undefined;
}
