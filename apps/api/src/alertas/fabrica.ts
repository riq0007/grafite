// As regras de fábrica de uma organização (spec alertas, "Regras de fábrica"; change
// p3a-regras-e-alertas, design, decisão 4): cria só as que faltam, pela chave, sem tocar nas que
// existem, com a auditoria de quem as garante: o comando que cria a organização ou a avaliação dos
// alertas, nas organizações que já existiam. A regra cujo nome outra regra da organização já usa
// não é criada, e as demais seguem.
import { regrasDeAlerta, type Transacao } from '@grafite/db';
import { normalizarTexto, REGRAS_DE_FABRICA } from '@grafite/domain';
import { isNotNull, sql } from 'drizzle-orm';
import { type Ator, registrarNaAuditoria } from '../auditoria.ts';
import { visaoDaRegra } from './regras.ts';

/** Cria as regras de fábrica que faltam na organização do contexto e diz quantas criou. */
export async function garantirRegrasDeFabrica(
  tx: Transacao,
  { ator, momento }: { ator: Ator; momento: Date },
): Promise<number> {
  const existentes = new Set(
    (
      await tx
        .select({ fabrica: regrasDeAlerta.fabrica })
        .from(regrasDeAlerta)
        .where(isNotNull(regrasDeAlerta.fabrica))
    ).map((regra) => regra.fabrica),
  );
  const faltam = REGRAS_DE_FABRICA.filter(({ chave }) => !existentes.has(chave));
  if (faltam.length === 0) return 0;
  const criadas = await tx
    .insert(regrasDeAlerta)
    .values(
      faltam.map(({ chave, dados }) => ({
        orgId: sql`app.current_org()`,
        nome: dados.nome,
        nomeNormalizado: normalizarTexto(dados.nome),
        condicao: dados.condicao,
        parametros: dados.parametros,
        duracao: dados.duracao,
        severidade: dados.severidade,
        escopo: dados.escopo.tipo,
        escopoId: dados.escopo.id,
        fabrica: chave,
        criadoEm: momento,
        atualizadoEm: momento,
      })),
    )
    .onConflictDoNothing()
    .returning();
  for (const linha of criadas) {
    await registrarNaAuditoria(tx, {
      acao: 'regra-de-alerta.criada',
      ator,
      alvo: { tipo: 'regra-de-alerta', id: linha.id },
      depois: visaoDaRegra(linha),
      momento,
      saida: {
        publico: { permissao: 'alertas.ver' },
        alvo: { tipo: 'regra-de-alerta', id: linha.id },
      },
    });
  }
  return criadas.length;
}
