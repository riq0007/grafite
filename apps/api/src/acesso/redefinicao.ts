// A redefinição do acesso de uma conta (specs contas-de-acesso e administracao-de-pessoas), pelo
// comando no servidor ou pela administração: senha temporária nova, todas as sessões encerradas, a
// contagem de tentativas zerada e, se pedido, os dois passos removidos. A senha só chega aqui em hash.
import { contas, type Transacao, tentativasDeEntrada } from '@grafite/db';
import { eq } from 'drizzle-orm';
import {
  type Ator,
  type EventoDeAuditoria,
  registrarNaAuditoria,
  visaoDaConta,
} from '../auditoria.ts';
import { saidaDaConta } from '../eventos/pessoas.ts';
import type { ContaComCredenciais } from './credenciais.ts';
import { apagarDoisPassos } from './dois-passos.ts';
import { encerrarSessoesDaConta } from './encerramento.ts';

/** Zera as recusas seguidas do usuário e o bloqueio da entrada. */
export async function zerarTentativas(tx: Transacao, usuario: string, momento: Date) {
  await tx
    .update(tentativasDeEntrada)
    .set({ falhasSeguidas: 0, bloqueadaAte: null, atualizadaEm: momento })
    .where(eq(tentativasDeEntrada.usuario, usuario));
}

export async function redefinirConta(
  tx: Transacao,
  {
    conta,
    hashSenha,
    removerDoisPassos,
    ator,
    origem,
    momento,
  }: {
    conta: ContaComCredenciais;
    hashSenha: string;
    removerDoisPassos: boolean;
    ator: Ator;
    origem?: EventoDeAuditoria['origem'];
    momento: Date;
  },
) {
  const sessoesEncerradas = await encerrarSessoesDaConta(tx, {
    contaId: conta.id,
    motivo: 'redefinicao',
    momento,
    ator,
    origem,
  });
  const doisPassosRemovidos = removerDoisPassos ? await apagarDoisPassos(tx, conta.id) : false;
  await zerarTentativas(tx, conta.usuario, momento);
  const [depois] = await tx
    .update(contas)
    .set({ hashSenha, senhaTemporaria: true, atualizadaEm: momento })
    .where(eq(contas.id, conta.id))
    .returning();
  await registrarNaAuditoria(tx, {
    acao: 'acesso.redefinido',
    ator,
    alvo: { tipo: 'conta', id: conta.id },
    antes: visaoDaConta(conta),
    depois: depois ? visaoDaConta(depois) : null,
    dados: { doisPassosRemovidos, sessoesEncerradas },
    origem,
    momento,
    saida: await saidaDaConta(tx, conta.id),
  });
  return { sessoesEncerradas, doisPassosRemovidos };
}
