// A conta da sessão no chat (change chat-com-chamados, design, decisões 3 e 11): a pessoa dela, o
// acesso lido nesta requisição e os grupos ativos de que ela é agora, para a `participacao` e as
// citações. A guarda das rotas já conferiu o `chat.usar`.
import { contas, type Transacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { carregarGrupos } from '../acesso/acesso.ts';
import { sessaoDa } from '../acesso/escopo.ts';
import type { ContaQueLeAsMensagens } from './mensagens.ts';

/** A conta da sessão, com a pessoa, o acesso de agora e os grupos ativos de que ela é. */
export async function contaDaSessao(
  tx: Transacao,
  requisicao: FastifyRequest,
): Promise<ContaQueLeAsMensagens> {
  const { contaId, acesso } = sessaoDa(requisicao);
  const [conta] = await tx
    .select({ pessoaId: contas.pessoaId })
    .from(contas)
    .where(eq(contas.id, contaId));
  return {
    id: contaId,
    pessoaId: conta?.pessoaId ?? '',
    acesso,
    grupos: await carregarGrupos(tx, contaId),
  };
}
