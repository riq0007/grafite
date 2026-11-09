// A entrega das notificações pelos canais de fora (spec notificacoes, "E-mail do crítico na hora",
// "Push por severidade" e "Aparelhos do push"; change p3c-email-e-push, design, decisões 2 a 4, 6 e
// 7). O `notificar` põe a `entregar-notificacoes` na fila, na transação dele; ela roda depois da
// confirmação, decide os canais de cada notificação pelas preferências da conta e põe um envio por
// destino, com a chave única dele. Cada envio tem as próprias tentativas: a falha de um não refaz
// os outros, e a marca da notificação segura o envio repetido por uma nova tentativa.
import {
  contas,
  enderecosDeAcesso,
  inscricoesDePush,
  naOrganizacao,
  notificacoes,
  organizacoes,
  pessoas,
  type Transacao,
} from '@grafite/db';
import {
  canaisNaHora,
  conteudoDoPush,
  emailDoCritico,
  type NotificacaoParaMensagem,
  resolverPreferencias,
} from '@grafite/domain';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { FalhaDoEmail } from '../canais/email.ts';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa, EnviarTarefa } from '../fila/tarefas.ts';

export const TAREFA_DA_ENTREGA = 'entregar-notificacoes';
export const TAREFA_DO_EMAIL = 'enviar-email';
export const TAREFA_DO_PUSH = 'enviar-push';

/** Quantas notificações cada entrega decide. */
const LOTE_DA_ENTREGA = 500;

/** Cinco novas tentativas, a partir de 1 min, dobrando até 1 h; depois, a lista das falhas. */
const TENTATIVAS = {
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 60 * 60,
  deadLetter: FILA_DAS_FALHAS,
} as const;

/** Põe a entrega das notificações gravadas na fila, na transação delas, em lotes. */
export async function pedirEntrega(
  tx: Transacao,
  enviar: EnviarTarefa,
  orgId: string,
  ids: readonly string[],
): Promise<void> {
  for (let inicio = 0; inicio < ids.length; inicio += LOTE_DA_ENTREGA) {
    await enviar(
      TAREFA_DA_ENTREGA,
      { orgId, ids: ids.slice(inicio, inicio + LOTE_DA_ENTREGA) },
      { tx },
    );
  }
}

/**
 * A origem dos endereços nos e-mails: a da configuração, no desenvolvimento e nos testes, ou o
 * endereço de acesso mais antigo da organização, em https.
 */
export async function origemDaOrganizacao(tx: Transacao, configurada?: string): Promise<string> {
  if (configurada) return configurada;
  const [endereco] = await tx
    .select({ endereco: enderecosDeAcesso.endereco })
    .from(enderecosDeAcesso)
    .orderBy(asc(enderecosDeAcesso.criadoEm), asc(enderecosDeAcesso.id))
    .limit(1);
  return `https://${endereco?.endereco ?? 'localhost'}`;
}

/** A notificação, com o que os canais mostram dela. */
const MENSAGEM = {
  id: notificacoes.id,
  severidade: notificacoes.severidade,
  titulo: notificacoes.titulo,
  descricao: notificacoes.descricao,
  origem: notificacoes.origem,
  destino: notificacoes.destino,
  criadaEm: notificacoes.criadaEm,
};

export function tarefasDaEntrega({
  banco,
  agora,
  log,
  enviar,
  canais = {},
}: ContextoDasTarefas): DefinicaoDeTarefa[] {
  const { carteiro, entregador, origemDosLinks } = canais;
  const servidor = { email: Boolean(carteiro), push: Boolean(entregador) };

  const entrega: DefinicaoDeTarefa<{ orgId: string; ids: string[] }> = {
    nome: TAREFA_DA_ENTREGA,
    rotulo: 'Entrega das notificações',
    dados: z.object({ orgId: z.uuid(), ids: z.array(z.uuid()).min(1).max(LOTE_DA_ENTREGA) }),
    opcoes: TENTATIVAS,
    async trabalho({ orgId, ids }) {
      await naOrganizacao(banco, orgId, async (tx) => {
        const lidas = await tx
          .select({
            id: notificacoes.id,
            contaId: notificacoes.contaId,
            severidade: notificacoes.severidade,
            emailEm: notificacoes.emailEm,
          })
          .from(notificacoes)
          .where(and(inArray(notificacoes.id, ids), isNull(notificacoes.pushEm)));
        if (lidas.length === 0) return;
        const contaIds = [...new Set(lidas.map(({ contaId }) => contaId))];
        const [organizacao] = await tx
          .select({ preferencias: organizacoes.preferencias })
          .from(organizacoes);
        const dasContas = new Map(
          (
            await tx
              .select({
                id: contas.id,
                situacao: contas.situacao,
                preferencias: contas.preferencias,
                email: pessoas.email,
              })
              .from(contas)
              .innerJoin(
                pessoas,
                and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)),
              )
              .where(inArray(contas.id, contaIds))
          ).map((conta) => [conta.id, conta]),
        );
        const aparelhos = servidor.push
          ? await tx
              .select({ id: inscricoesDePush.id, contaId: inscricoesDePush.contaId })
              .from(inscricoesDePush)
              .where(inArray(inscricoesDePush.contaId, contaIds))
          : [];
        for (const notificacao of lidas) {
          const conta = dasContas.get(notificacao.contaId);
          if (conta?.situacao !== 'ativa') continue;
          const daConta = aparelhos.filter(({ contaId }) => contaId === notificacao.contaId);
          const preferencias = resolverPreferencias(
            organizacao?.preferencias,
            conta.preferencias,
          ).notificacoes;
          const canaisDela = canaisNaHora(
            notificacao.severidade,
            { email: conta.email, aparelhos: daConta.length, preferencias },
            servidor,
          );
          if (canaisDela.email && notificacao.emailEm === null) {
            await enviar(
              TAREFA_DO_EMAIL,
              { orgId, notificacaoId: notificacao.id },
              { tx, chaveUnica: `email:${notificacao.id}` },
            );
          }
          if (canaisDela.push) {
            for (const aparelho of daConta) {
              await enviar(
                TAREFA_DO_PUSH,
                { orgId, notificacaoId: notificacao.id, inscricaoId: aparelho.id },
                { tx, chaveUnica: `push:${notificacao.id}:${aparelho.id}` },
              );
            }
          }
        }
        // A entrega decidida não se repete: a marca do push segura a nova tentativa dela.
        await tx
          .update(notificacoes)
          .set({ pushEm: agora() })
          .where(
            inArray(
              notificacoes.id,
              lidas.map(({ id }) => id),
            ),
          );
      });
    },
  };

  const email: DefinicaoDeTarefa<{ orgId: string; notificacaoId: string }> = {
    nome: TAREFA_DO_EMAIL,
    rotulo: 'Envio do e-mail de uma notificação',
    dados: z.object({ orgId: z.uuid(), notificacaoId: z.uuid() }),
    opcoes: TENTATIVAS,
    async trabalho({ orgId, notificacaoId }) {
      if (!carteiro) return;
      const paraEnviar = await naOrganizacao(banco, orgId, async (tx) => {
        const [linha] = await tx
          .select({ ...MENSAGEM, emailEm: notificacoes.emailEm, para: pessoas.email })
          .from(notificacoes)
          .innerJoin(
            contas,
            and(eq(contas.orgId, notificacoes.orgId), eq(contas.id, notificacoes.contaId)),
          )
          .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
          .where(eq(notificacoes.id, notificacaoId));
        if (!linha || linha.emailEm !== null || !linha.para) return null;
        const [organizacao] = await tx.select({ nome: organizacoes.nome }).from(organizacoes);
        return {
          para: linha.para,
          mensagem: emailDoCritico(linha as NotificacaoParaMensagem, {
            organizacao: organizacao?.nome ?? '',
            origem: await origemDaOrganizacao(tx, origemDosLinks),
          }),
        };
      });
      if (!paraEnviar) return;
      try {
        await carteiro.enviar({ para: paraEnviar.para, ...paraEnviar.mensagem });
      } catch (erro) {
        if (erro instanceof FalhaDoEmail) {
          log.warn({ orgId, notificacaoId, detalhe: erro.detalhe }, erro.message);
        }
        throw erro;
      }
      await naOrganizacao(banco, orgId, (tx) =>
        tx.update(notificacoes).set({ emailEm: agora() }).where(eq(notificacoes.id, notificacaoId)),
      );
    },
  };

  const push: DefinicaoDeTarefa<{ orgId: string; notificacaoId: string; inscricaoId: string }> = {
    nome: TAREFA_DO_PUSH,
    rotulo: 'Envio do push de uma notificação',
    dados: z.object({ orgId: z.uuid(), notificacaoId: z.uuid(), inscricaoId: z.uuid() }),
    opcoes: TENTATIVAS,
    async trabalho({ orgId, notificacaoId, inscricaoId }) {
      if (!entregador) return;
      const paraEnviar = await naOrganizacao(banco, orgId, async (tx) => {
        const [linha] = await tx
          .select({
            ...MENSAGEM,
            endpoint: inscricoesDePush.endpoint,
            p256dh: inscricoesDePush.p256dh,
            auth: inscricoesDePush.auth,
          })
          .from(notificacoes)
          .innerJoin(
            inscricoesDePush,
            and(
              eq(inscricoesDePush.orgId, notificacoes.orgId),
              eq(inscricoesDePush.contaId, notificacoes.contaId),
            ),
          )
          .where(and(eq(notificacoes.id, notificacaoId), eq(inscricoesDePush.id, inscricaoId)));
        return linha ?? null;
      });
      // O aparelho que saiu da conta, ou a notificação apagada, não recebem.
      if (!paraEnviar) return;
      const { endpoint, p256dh, auth, ...notificacao } = paraEnviar;
      const resultado = await entregador.enviar(
        { endpoint, p256dh, auth },
        conteudoDoPush(notificacao as NotificacaoParaMensagem),
      );
      await naOrganizacao(banco, orgId, (tx) =>
        resultado === 'expirada'
          ? tx.delete(inscricoesDePush).where(eq(inscricoesDePush.id, inscricaoId))
          : tx
              .update(inscricoesDePush)
              .set({ ultimoEnvioEm: agora() })
              .where(eq(inscricoesDePush.id, inscricaoId)),
      );
    },
  };

  return [entrega, email, push] as DefinicaoDeTarefa[];
}
