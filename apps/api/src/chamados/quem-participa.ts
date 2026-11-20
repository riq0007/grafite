// Quem participa do chamado pelo chat (spec chamados, "Notificações dos chamados"; change
// chat-com-chamados, design, decisões 4 e 13; tarefa 3.10): a conta da pessoa e, na origem `chat`, a
// de quem o abriu, quando usam o chat, com o módulo Chat ligado. As notificações das ações da TI e o
// "usa o chat" da ficha as leem.
import { contas, type Transacao } from '@grafite/db';
import { type ChamadoParaParticipar, participaDoChamado } from '@grafite/domain';
import { eq, or, sql } from 'drizzle-orm';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import { usaOChatNaConsulta } from '../chat/quem-usa.ts';

export interface ContaQueParticipa {
  id: string;
  pessoaId: string;
  usaOChat: boolean;
}

/** As contas que participam do chamado agora; nenhuma com o Chat desligado. */
export async function contasQueParticipam(
  tx: Transacao,
  chamado: ChamadoParaParticipar,
): Promise<ContaQueParticipa[]> {
  if (!(await ligadoNaTransacao(tx, 'chat'))) return [];
  const linhas = await tx
    .select({
      id: contas.id,
      pessoaId: contas.pessoaId,
      usaOChat: sql<boolean>`${usaOChatNaConsulta(contas.id)}`,
    })
    .from(contas)
    .where(
      or(
        eq(contas.pessoaId, chamado.pessoaId),
        chamado.origem === 'chat' && chamado.abertoPor !== null
          ? eq(contas.id, chamado.abertoPor)
          : undefined,
      ),
    );
  return linhas.filter((conta) => participaDoChamado(conta, chamado));
}
