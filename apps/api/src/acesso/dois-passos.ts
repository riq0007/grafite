// A conferência de um código da verificação em dois passos (spec verificacao-em-dois-passos): o do
// app, que não vale de novo num passo já usado, ou um de recuperação, de uso único. Serve à entrada,
// à desativação e à geração de códigos novos. A verificação que acaba fecha o cofre da conta.
import { codigosDeRecuperacao, doisPassos, sessoes, type Transacao } from '@grafite/db';
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { type Ator, type EventoDeAuditoria, registrarNaAuditoria } from '../auditoria.ts';
import { esquecerAparelhosDaConta } from './aparelhos.ts';
import { decifrarChaveDoApp } from './cifra.ts';
import { hashDoCodigo, pareceCodigoDeRecuperacao } from './codigos.ts';
import { conferirCodigoDoApp } from './totp.ts';

export interface ConferenciaDoCodigo {
  aceito: boolean;
  /** Depois de um código de recuperação aceito: quantos ainda servem. */
  restantes?: number;
}

export async function conferirCodigoDaConta(
  tx: Transacao,
  {
    contaId,
    codigo,
    momento,
    chaveDoisPassos,
    ator,
    origem,
  }: {
    contaId: string;
    codigo: string;
    momento: Date;
    chaveDoisPassos: Buffer;
    ator: Ator;
    origem: EventoDeAuditoria['origem'];
  },
): Promise<ConferenciaDoCodigo> {
  if (pareceCodigoDeRecuperacao(codigo)) {
    const [usado] = await tx
      .update(codigosDeRecuperacao)
      .set({ usadoEm: momento })
      .where(
        and(
          eq(codigosDeRecuperacao.contaId, contaId),
          eq(codigosDeRecuperacao.hash, hashDoCodigo(codigo)),
          isNull(codigosDeRecuperacao.usadoEm),
        ),
      )
      .returning({ id: codigosDeRecuperacao.id });
    if (!usado) return { aceito: false };
    const [contagem] = await tx
      .select({ restantes: count() })
      .from(codigosDeRecuperacao)
      .where(and(eq(codigosDeRecuperacao.contaId, contaId), isNull(codigosDeRecuperacao.usadoEm)));
    const restantes = contagem?.restantes ?? 0;
    await registrarNaAuditoria(tx, {
      acao: 'codigo-de-recuperacao.usado',
      ator,
      alvo: { tipo: 'conta', id: contaId },
      dados: { restantes },
      origem,
      momento,
    });
    return { aceito: true, restantes };
  }
  const [linha] = await tx
    .select()
    .from(doisPassos)
    .where(and(eq(doisPassos.contaId, contaId), isNotNull(doisPassos.ativadoEm)));
  if (!linha) return { aceito: false };
  const chave = decifrarChaveDoApp(linha.segredoCifrado, chaveDoisPassos, contaId);
  const passo = conferirCodigoDoApp(chave, codigo, momento.getTime(), linha.ultimoPasso);
  if (passo === null) return { aceito: false };
  await tx.update(doisPassos).set({ ultimoPasso: passo }).where(eq(doisPassos.id, linha.id));
  return { aceito: true };
}

/**
 * Fecha o cofre em todas as sessões da conta (design do P6, decisão 4): desativar, remover ou
 * cadastrar de novo a verificação termina a liberação, na mesma transação.
 */
export async function fecharOCofreDaConta(tx: Transacao, contaId: string) {
  await tx
    .update(sessoes)
    .set({ cofreLiberadoAte: null })
    .where(and(eq(sessoes.contaId, contaId), isNotNull(sessoes.cofreLiberadoAte)));
}

/** Apaga a chave do app e os códigos de recuperação da conta; diz se havia a verificação. */
export async function apagarDoisPassos(tx: Transacao, contaId: string): Promise<boolean> {
  await fecharOCofreDaConta(tx, contaId);
  // Sem os dois passos, nenhum aparelho dispensa o código (change aparelho-confiavel).
  await esquecerAparelhosDaConta(tx, contaId);
  const removidos = await tx
    .delete(doisPassos)
    .where(eq(doisPassos.contaId, contaId))
    .returning({ id: doisPassos.id });
  await tx.delete(codigosDeRecuperacao).where(eq(codigosDeRecuperacao.contaId, contaId));
  return removidos.length > 0;
}
