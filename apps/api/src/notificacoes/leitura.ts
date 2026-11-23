// As notificações lidas pelo assunto (spec chat, "Não lidas"; spec chamados, "Resposta nova"; change
// chat-com-chamados, design, decisões 5 e 6): ler a conversa marca como lidas as notificações da
// conta com o assunto dela até a mensagem lida, e o sino da conta é avisado.
import { notificacoes, type Transacao } from '@grafite/db';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { registrarEvento } from '../eventos/saida.ts';

/**
 * Marca como lidas as notificações não lidas da conta com o assunto dado; com a mensagem do chat,
 * só as das mensagens até ela, pelo id, que é o `uuidv7()` e ordena. Devolve quantas marcou.
 */
export async function marcarLidasDoAssunto(
  tx: Transacao,
  {
    contaId,
    assunto,
    ateMensagemDoChat,
    momento,
  }: { contaId: string; assunto: string; ateMensagemDoChat?: string; momento: Date },
): Promise<number> {
  const lidas = await tx
    .update(notificacoes)
    .set({ lidaEm: momento })
    .where(
      and(
        eq(notificacoes.contaId, contaId),
        eq(notificacoes.assunto, assunto),
        isNull(notificacoes.lidaEm),
        ateMensagemDoChat === undefined
          ? undefined
          : lte(notificacoes.mensagemDoChatId, ateMensagemDoChat),
      ),
    )
    .returning({ id: notificacoes.id });
  if (lidas.length > 0) {
    await registrarEvento(tx, {
      tipo: 'notificacoes.mudaram',
      alvo: null,
      publico: { contas: [contaId] },
    });
  }
  return lidas.length;
}
