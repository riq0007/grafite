// A notificação da mensagem do chat (spec chat, "Notificações do chat" e "Silenciar uma conversa";
// change chat-com-chamados, design, decisão 6; tarefa 3.6): a mensagem pede a tarefa
// `chat.notificar` para 10 s depois, na transação dela, e a tarefa notifica pelo domínio quem
// participa da conversa quando ela roda, com o silenciar e a leitura de cada conta. Quem participa
// não é gravado: a conta que saiu do grupo, deixou de usar o chat ou foi desativada nos 10 s fica
// de fora, e a equipe ou o canal arquivado nesse tempo, que sai da lista de quem participa, não
// notifica ninguém.
import {
  anexosDoChat,
  arquivos,
  type Banco,
  conversas,
  leiturasDasConversas,
  mensagensDoChat,
  naOrganizacao,
  notificacoes,
  type Transacao,
} from '@grafite/db';
import { type ConversaQueNotifica, notificacoesDaMensagemDoChat } from '@grafite/domain';
import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa, EnviarTarefa } from '../fila/tarefas.ts';
import { notificar } from '../notificacoes/notificar.ts';
import { lerContas } from './contas.ts';
import { conversasParaParticipar, idsDeQuemParticipa, type LinhaDaConversa } from './conversa.ts';

export const TAREFA_DO_CHAT = 'chat.notificar';

/** Quanto a notificação espera a leitura de quem está com a conversa à vista, em segundos. */
export const ESPERA_DA_NOTIFICACAO = 10;

/**
 * Pede a notificação da mensagem gravada, na transação dela: desfeita a mensagem, a tarefa não
 * entra. Sem a fila, como nos testes que não tratam dela, nada é pedido.
 */
export async function pedirANotificacao(
  tx: Transacao,
  enviar: EnviarTarefa | undefined,
  mensagem: { orgId: string; id: string },
) {
  await enviar?.(
    TAREFA_DO_CHAT,
    { orgId: mensagem.orgId, mensagemId: mensagem.id },
    { tx, depoisDe: ESPERA_DA_NOTIFICACAO },
  );
}

/** A conversa como as notificações a leem. */
const conversaQueNotifica = (linha: LinhaDaConversa): ConversaQueNotifica =>
  linha.tipo === 'direta'
    ? { id: linha.id, tipo: 'direta' }
    : { id: linha.id, tipo: linha.tipo, nome: linha.nome ?? '', avisar: linha.avisar };

/**
 * Notifica a mensagem a quem participa da conversa agora, fora quem escreveu, quem silenciou e quem
 * já a leu, ou já foi notificado dela. A tarefa roda numa transação só: a nova tentativa depois de
 * uma falha não acha nada gravado.
 */
export async function notificarMensagemDoChat(
  banco: Banco,
  { orgId, mensagemId }: { orgId: string; mensagemId: string },
  { agora, enviar }: { agora: Date; enviar?: EnviarTarefa },
): Promise<{ notificadas: number }> {
  return naOrganizacao(banco, orgId, async (tx) => {
    if (!(await ligadoNaTransacao(tx, 'chat'))) return { notificadas: 0 };
    const [mensagem] = await tx
      .select({
        id: mensagensDoChat.id,
        conversaId: mensagensDoChat.conversaId,
        autorConta: mensagensDoChat.autorConta,
        texto: mensagensDoChat.texto,
        criadaEm: mensagensDoChat.criadaEm,
      })
      .from(mensagensDoChat)
      .where(and(eq(mensagensDoChat.id, mensagemId), eq(mensagensDoChat.especie, 'mensagem')));
    if (!mensagem) return { notificadas: 0 };
    const [linha] = await tx.select().from(conversas).where(eq(conversas.id, mensagem.conversaId));
    if (!linha) return { notificadas: 0 };
    // A equipe e o canal sem o aviso não notificam, e o arquivado não tem quem participa.
    if (linha.tipo !== 'direta' && (!linha.avisar || linha.arquivadaEm !== null)) {
      return { notificadas: 0 };
    }
    const montada = (await conversasParaParticipar(tx, [linha])).get(linha.id);
    if (!montada) return { notificadas: 0 };
    const participam = (await idsDeQuemParticipa(tx, montada.conversa)).filter(
      (id) => id !== mensagem.autorConta,
    );
    if (participam.length === 0) return { notificadas: 0 };
    // A tarefa que gravou e caiu antes de a fila a dar como concluída roda de novo: quem já tem a
    // notificação desta mensagem fica de fora. A hora da mensagem limita a leitura pelo índice das
    // notificações da conta.
    const jaNotificadas = await tx
      .select({ contaId: notificacoes.contaId })
      .from(notificacoes)
      .where(
        and(
          inArray(notificacoes.contaId, participam),
          gte(notificacoes.criadaEm, mensagem.criadaEm),
          eq(notificacoes.mensagemDoChatId, mensagem.id),
        ),
      );
    const ja = new Set(jaNotificadas.map(({ contaId }) => contaId));
    const ids = participam.filter((id) => !ja.has(id));
    if (ids.length === 0) return { notificadas: 0 };
    const leituras = await tx
      .select({
        contaId: leiturasDasConversas.contaId,
        silenciada: leiturasDasConversas.silenciada,
        lidaAte: leiturasDasConversas.lidaAte,
      })
      .from(leiturasDasConversas)
      .where(
        and(
          eq(leiturasDasConversas.conversaId, linha.id),
          inArray(leiturasDasConversas.contaId, ids),
        ),
      );
    const leituraDe = new Map(leituras.map((leitura) => [leitura.contaId, leitura]));
    const autor = (await lerContas(tx, [mensagem.autorConta])).get(mensagem.autorConta);
    // A mensagem só com os anexos começa pelo nome do primeiro (tarefa 4.18).
    const anexos = await tx
      .select({ nome: arquivos.nome })
      .from(anexosDoChat)
      .innerJoin(
        arquivos,
        and(eq(arquivos.orgId, anexosDoChat.orgId), eq(arquivos.id, anexosDoChat.arquivoId)),
      )
      .where(and(eq(anexosDoChat.mensagemId, mensagem.id), isNull(arquivos.removidoEm)))
      .orderBy(asc(arquivos.enviadoEm), asc(arquivos.id));
    const novas = notificacoesDaMensagemDoChat(
      conversaQueNotifica(linha),
      {
        id: mensagem.id,
        texto: mensagem.texto,
        anexos: anexos.map(({ nome }) => nome ?? ''),
        autor: { contaId: mensagem.autorConta, nome: autor?.nome ?? '' },
      },
      ids.map((id) => ({
        id,
        silenciada: leituraDe.get(id)?.silenciada ?? false,
        lidaAte: leituraDe.get(id)?.lidaAte ?? null,
      })),
    );
    await notificar(tx, novas, agora, enviar ? { enviar } : {});
    return { notificadas: novas.length };
  });
}

/** A tarefa da notificação de uma mensagem, pedida por ela para 10 s depois. */
export function tarefaDoChat({
  banco,
  agora,
  log,
  enviar,
}: ContextoDasTarefas): DefinicaoDeTarefa<{ orgId: string; mensagemId: string }> {
  return {
    nome: TAREFA_DO_CHAT,
    rotulo: 'Notificação de uma mensagem do chat',
    dados: z.object({ orgId: z.uuid(), mensagemId: z.uuid() }),
    opcoes: { retryLimit: 3, retryDelay: 30, retryBackoff: true, deadLetter: FILA_DAS_FALHAS },
    async trabalho({ orgId, mensagemId }) {
      const { notificadas } = await notificarMensagemDoChat(
        banco,
        { orgId, mensagemId },
        { agora: agora(), enviar },
      );
      if (notificadas > 0)
        log.info({ orgId, mensagemId, notificadas }, 'mensagem do chat notificada');
    },
  };
}
