// O mínimo de um consumível num local (spec estoque, "Mínimo do consumível no local"; change
// p4c-estoque, design, decisões 3 e 5): quem movimenta o estoque do local o define, de 0 a 100.000,
// e o momento em que o par ficou abaixo do mínimo segue a mesma regra do lançamento. A linha do
// saldo nasce no primeiro mínimo do par, e o mesmo mínimo de antes não grava nada.
import { consumiveis, saldosDoEstoque, type Transacao } from '@grafite/db';
import { validarMinimo } from '@grafite/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { dadosInvalidos, naoEncontrado } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import type { SaldoDoEstoque } from './esquemas.ts';
import { comoSaldo, type LeitorDoEstoque } from './leitura.ts';

export async function definirMinimo(
  tx: Transacao,
  {
    consumivelId,
    localId,
    minimo,
  }: { consumivelId: string; localId: string; minimo: number | null },
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
): Promise<z.infer<typeof SaldoDoEstoque>> {
  const { acesso, contaId } = sessaoDa(requisicao);
  const recusa = validarMinimo(minimo);
  if (recusa !== null) throw dadosInvalidos({ minimo: recusa });
  if (minimo === null) throw new Error('O mínimo não foi conferido.');
  const arvore = await lerArvore(tx);
  if (!arvore.local(localId)) throw naoEncontrado('Local não encontrado.');
  exigirEm(requisicao, 'estoque.movimentar', localId, arvore);
  const [consumivel] = await tx
    .select({
      id: consumiveis.id,
      codigo: consumiveis.codigo,
      nome: consumiveis.nome,
      tipo: consumiveis.tipo,
      cor: consumiveis.cor,
      situacao: consumiveis.situacao,
    })
    .from(consumiveis)
    .where(eq(consumiveis.id, consumivelId))
    .for('share');
  if (!consumivel) throw naoEncontrado('Consumível não encontrado.');
  const doPar = and(
    eq(saldosDoEstoque.consumivelId, consumivelId),
    eq(saldosDoEstoque.localId, localId),
  );
  // A linha fica travada: o lançamento ao mesmo tempo espera e confere o mínimo novo.
  const [anterior] = await tx.select().from(saldosDoEstoque).where(doPar).for('update');
  const leitor: LeitorDoEstoque = { acesso, arvore };
  if (anterior && anterior.minimo === minimo) return comoSaldo(anterior, consumivel, leitor);
  const quando = sql`${momento.toISOString()}::timestamptz`;
  const [linha] = await tx
    .insert(saldosDoEstoque)
    .values({
      orgId: sql`app.current_org()`,
      consumivelId,
      localId,
      minimo,
      abaixoDesde: minimo > 0 ? momento : null,
      atualizadoEm: momento,
    })
    .onConflictDoUpdate({
      target: [saldosDoEstoque.orgId, saldosDoEstoque.consumivelId, saldosDoEstoque.localId],
      set: {
        minimo: sql`excluded.minimo`,
        abaixoDesde: sql`case when excluded.minimo > 0 and ${saldosDoEstoque.saldo} < excluded.minimo
          then coalesce(${saldosDoEstoque.abaixoDesde}, ${quando}) else null end`,
        atualizadoEm: momento,
      },
    })
    .returning();
  if (!linha) throw new Error('O mínimo não foi gravado.');
  await registrarNaAuditoria(tx, {
    acao: 'estoque.minimo',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'consumivel', id: consumivelId },
    antes: anterior ? { minimo: anterior.minimo } : null,
    depois: { minimo },
    dados: { consumivel: consumivel.codigo, local: arvore.caminho(localId) },
    origem: origemDa(requisicao),
    momento,
    saida: { publico: { permissao: 'estoque.ver', locais: [localId] } },
  });
  return comoSaldo(linha, consumivel, leitor);
}
