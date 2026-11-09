// O resumo diário por e-mail (spec notificacoes, "Resumo diário por e-mail"; change
// p3c-email-e-push, design, decisão 5). A `resumos-por-email`, agendada às 8h de São Paulo, põe uma
// `enviar-resumos` por organização, com a chave do dia; cada uma põe uma `enviar-resumo` por conta
// ativa com o resumo ligado, a pessoa com e-mail e alguma notificação para resumir. O resumo leva
// as não lidas que não foram por e-mail, as 50 mais novas e quantas mais há, e marca todas.
import {
  type Banco,
  contas,
  naOrganizacao,
  notificacoes,
  organizacoes,
  pessoas,
} from '@grafite/db';
import {
  emailDoResumo,
  ITENS_DO_RESUMO,
  type NotificacaoParaMensagem,
  recebeResumo,
  resolverPreferencias,
} from '@grafite/domain';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { FalhaDoEmail } from '../canais/email.ts';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from '../fila/tarefas.ts';
import { origemDaOrganizacao } from './entrega.ts';

export const TAREFA_DOS_RESUMOS_DO_DIA = 'resumos-por-email';
export const TAREFA_DOS_RESUMOS = 'enviar-resumos';
export const TAREFA_DO_RESUMO = 'enviar-resumo';

/** O fuso do horário do resumo, o mesmo das outras tarefas agendadas. */
const FUSO_DO_RESUMO = 'America/Sao_Paulo';
const DIA = 24 * 60 * 60;

/** Cinco novas tentativas, a partir de 1 min, dobrando até 1 h; depois, a lista das falhas. */
const TENTATIVAS = {
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 60 * 60,
  deadLetter: FILA_DAS_FALHAS,
} as const;

/** A data em São Paulo, como "2026-10-14": a chave do dia do resumo. */
const diaEmSaoPaulo = (momento: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_DO_RESUMO }).format(momento);

/** As organizações ativas, pela consulta que atravessa organizações só para as tarefas. */
async function organizacoesAtivas(banco: Banco): Promise<string[]> {
  const { rows } = await banco.execute<{ id: string }>(
    sql`select id from app.organizacoes_para_tarefas() as t(id)`,
  );
  return rows.map((linha) => linha.id);
}

/** As notificações para o resumo: não lidas e sem a marca do e-mail. */
const paraResumir = (contaId: string) =>
  and(eq(notificacoes.contaId, contaId), isNull(notificacoes.lidaEm), isNull(notificacoes.emailEm));

export function tarefasDoResumo({
  banco,
  agora,
  log,
  enviar,
  canais = {},
}: ContextoDasTarefas): DefinicaoDeTarefa[] {
  const { carteiro, origemDosLinks } = canais;
  const servidor = { email: Boolean(carteiro), push: false };

  const doDia: DefinicaoDeTarefa<unknown> = {
    nome: TAREFA_DOS_RESUMOS_DO_DIA,
    rotulo: 'Distribuição do resumo diário por e-mail',
    rotina: {
      nome: 'Resumo diário por e-mail',
      descricao: 'Manda a cada conta o resumo das notificações do dia anterior.',
    },
    dados: z.unknown(),
    agenda: { cron: '0 8 * * *', fuso: FUSO_DO_RESUMO },
    opcoes: { deadLetter: FILA_DAS_FALHAS },
    async trabalho() {
      if (!carteiro) return;
      const dia = diaEmSaoPaulo(agora());
      for (const orgId of await organizacoesAtivas(banco)) {
        await enviar(
          TAREFA_DOS_RESUMOS,
          { orgId },
          { chaveUnica: `${orgId}:${dia}`, unicaPor: DIA },
        );
      }
    },
  };

  const daOrganizacao: DefinicaoDeTarefa<{ orgId: string }> = {
    nome: TAREFA_DOS_RESUMOS,
    rotulo: 'Resumos por e-mail de uma organização',
    dados: z.object({ orgId: z.uuid() }),
    opcoes: TENTATIVAS,
    async trabalho({ orgId }) {
      if (!carteiro) return;
      const dia = diaEmSaoPaulo(agora());
      const receberao = await naOrganizacao(banco, orgId, async (tx) => {
        const comPendentes = (
          await tx
            .selectDistinct({ contaId: notificacoes.contaId })
            .from(notificacoes)
            .where(and(isNull(notificacoes.lidaEm), isNull(notificacoes.emailEm)))
        ).map(({ contaId }) => contaId);
        if (comPendentes.length === 0) return [];
        const [organizacao] = await tx
          .select({ preferencias: organizacoes.preferencias })
          .from(organizacoes);
        const lidas = await tx
          .select({
            id: contas.id,
            situacao: contas.situacao,
            preferencias: contas.preferencias,
            email: pessoas.email,
          })
          .from(contas)
          .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
          .where(inArray(contas.id, comPendentes));
        return lidas
          .filter(
            (conta) =>
              conta.situacao === 'ativa' &&
              recebeResumo(
                {
                  email: conta.email,
                  aparelhos: 0,
                  preferencias: resolverPreferencias(organizacao?.preferencias, conta.preferencias)
                    .notificacoes,
                },
                servidor,
              ),
          )
          .map(({ id }) => id);
      });
      for (const contaId of receberao) {
        await enviar(
          TAREFA_DO_RESUMO,
          { orgId, contaId },
          { chaveUnica: `resumo:${contaId}:${dia}`, unicaPor: DIA },
        );
      }
    },
  };

  const daConta: DefinicaoDeTarefa<{ orgId: string; contaId: string }> = {
    nome: TAREFA_DO_RESUMO,
    rotulo: 'Resumo por e-mail de uma conta',
    dados: z.object({ orgId: z.uuid(), contaId: z.uuid() }),
    opcoes: TENTATIVAS,
    async trabalho({ orgId, contaId }) {
      if (!carteiro) return;
      const paraEnviar = await naOrganizacao(banco, orgId, async (tx) => {
        const [conta] = await tx
          .select({
            situacao: contas.situacao,
            preferencias: contas.preferencias,
            email: pessoas.email,
          })
          .from(contas)
          .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
          .where(eq(contas.id, contaId));
        const [organizacao] = await tx
          .select({ nome: organizacoes.nome, preferencias: organizacoes.preferencias })
          .from(organizacoes);
        if (conta?.situacao !== 'ativa' || !conta.email) return null;
        const preferencias = resolverPreferencias(organizacao?.preferencias, conta.preferencias);
        const destino = {
          email: conta.email,
          aparelhos: 0,
          preferencias: preferencias.notificacoes,
        };
        if (!recebeResumo(destino, servidor)) return null;
        const pendentes = await tx
          .select({
            id: notificacoes.id,
            severidade: notificacoes.severidade,
            titulo: notificacoes.titulo,
            descricao: notificacoes.descricao,
            origem: notificacoes.origem,
            destino: notificacoes.destino,
            criadaEm: notificacoes.criadaEm,
          })
          .from(notificacoes)
          .where(paraResumir(contaId))
          .orderBy(desc(notificacoes.criadaEm), desc(notificacoes.id));
        if (pendentes.length === 0) return null;
        const fuso =
          preferencias.regiao.fuso === 'sistema' ? FUSO_DO_RESUMO : preferencias.regiao.fuso;
        return {
          para: conta.email,
          ids: pendentes.map(({ id }) => id),
          mensagem: emailDoResumo(
            pendentes.slice(0, ITENS_DO_RESUMO) as NotificacaoParaMensagem[],
            pendentes.length,
            {
              organizacao: organizacao?.nome ?? '',
              origem: await origemDaOrganizacao(tx, origemDosLinks),
              fuso,
            },
          ),
        };
      });
      if (!paraEnviar) return;
      try {
        await carteiro.enviar({ para: paraEnviar.para, ...paraEnviar.mensagem });
      } catch (erro) {
        if (erro instanceof FalhaDoEmail) {
          log.warn({ orgId, contaId, detalhe: erro.detalhe }, erro.message);
        }
        throw erro;
      }
      // As do resumo contam como enviadas, também as que só entraram na conta das "mais".
      await naOrganizacao(banco, orgId, (tx) =>
        tx
          .update(notificacoes)
          .set({ emailEm: agora() })
          .where(inArray(notificacoes.id, paraEnviar.ids)),
      );
    },
  };

  return [doDia, daOrganizacao, daConta] as DefinicaoDeTarefa[];
}
