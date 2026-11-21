// As reações, a leitura e o silenciar (spec chat, "Reações", "Não lidas" e "Silenciar uma
// conversa"; change chat-com-chamados, design, decisões 4, 5 e 6; tarefa 3.3). A reação vai e volta
// com a mensagem travada, para o teto de 10 textos valer com duas ao mesmo tempo; a leitura só anda
// para a frente e marca as notificações da conversa até a mensagem lida; o silenciar fica na leitura
// da conta. O `chat.mudou` da reação vai a quem participa, e o da leitura e do silenciar, à conta.
import {
  type Banco,
  leiturasDasConversas,
  mensagensDoChat,
  naOrganizacao,
  reacoesDasMensagens,
} from '@grafite/db';
import { assuntoDaConversa, conferirReacao, mensagemDaRecusaDaEscrita } from '@grafite/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { lerConversaDaConta, publicoDaConversa } from '../chat/conversa.ts';
import { MensagemDoChat, mensagemNaoEncontrada, mensagensParaAConta } from '../chat/mensagens.ts';
import { contaDaSessao } from '../chat/sessao.ts';
import { registrarEvento } from '../eventos/saida.ts';
import { marcarLidasDoAssunto } from '../notificacoes/leitura.ts';
import { conflito, dadosInvalidos, ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { travar } from '../travas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const ParametrosDaConversa = z.object({ id: z.uuid({ error: 'Conversa não encontrada.' }) });

const ParametrosDaMensagem = z.object({
  id: z.uuid({ error: 'A mensagem não foi encontrada.' }),
});

const LeituraDaConversa = z
  .object({
    /** A última mensagem lida, que só anda para a frente. */
    lidaAte: z.uuid(),
  })
  .meta({ id: 'LeituraDaConversa' });

const SilencioDaConversa = z.object({ silenciada: z.boolean() }).meta({ id: 'SilencioDaConversa' });

const PROBLEMAS = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
} as const;

/** As colunas da leitura de cada conta, para o `on conflict`. */
const DA_LEITURA = [
  leiturasDasConversas.orgId,
  leiturasDasConversas.contaId,
  leiturasDasConversas.conversaId,
];

export const rotasDaLeituraDoChat: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.post(
    '/chat/mensagens/:id/reacoes',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Dá a reação à mensagem, ou a tira, se a conta já deu a mesma',
        params: ParametrosDaMensagem,
        body: z.object({ texto: z.string().max(400, { error: 'Use até 20 caracteres.' }) }),
        response: { 200: MensagemDoChat, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        const id = requisicao.params.id.toLowerCase();
        // A trava da mensagem vem antes de ler as reações dela: o décimo texto entra uma vez só.
        await travar(tx, `mensagem:${id}`);
        const [mensagem] = await tx
          .select()
          .from(mensagensDoChat)
          .where(eq(mensagensDoChat.id, id));
        if (mensagem?.especie !== 'mensagem') throw mensagemNaoEncontrada();
        const { linha, participacao } = await lerConversaDaConta(
          tx,
          conta,
          mensagem.conversaId,
        ).catch((erro: unknown) => {
          throw erro instanceof ProblemaDaApi && erro.dados.status === 404
            ? mensagemNaoEncontrada()
            : erro;
        });
        // Quem só lê reage, como no canal de avisos; a arquivada não muda mais.
        if (
          participacao.participa &&
          !participacao.escreve &&
          participacao.recusa.motivo === 'arquivada'
        ) {
          throw conflito(mensagemDaRecusaDaEscrita(participacao.recusa));
        }
        const daMensagem = await tx
          .select({ texto: reacoesDasMensagens.texto, contaId: reacoesDasMensagens.contaId })
          .from(reacoesDasMensagens)
          .where(eq(reacoesDasMensagens.mensagemId, mensagem.id));
        const conferida = conferirReacao(
          requisicao.body.texto,
          daMensagem.map(({ texto }) => texto),
        );
        if (!conferida.ok) throw dadosInvalidos({ texto: conferida.erro });
        const minha = daMensagem.some(
          ({ texto, contaId }) => texto === conferida.texto && contaId === conta.id,
        );
        if (minha) {
          await tx
            .delete(reacoesDasMensagens)
            .where(
              and(
                eq(reacoesDasMensagens.mensagemId, mensagem.id),
                eq(reacoesDasMensagens.contaId, conta.id),
                eq(reacoesDasMensagens.texto, conferida.texto),
              ),
            );
        } else {
          await tx.insert(reacoesDasMensagens).values({
            orgId: mensagem.orgId,
            mensagemId: mensagem.id,
            contaId: conta.id,
            texto: conferida.texto,
            criadaEm: momento,
          });
        }
        await registrarEvento(tx, {
          tipo: 'chat.mudou',
          alvo: { tipo: 'conversa', id: linha.id },
          publico: publicoDaConversa(linha),
        });
        const [lida] = await mensagensParaAConta(tx, conta, linha.id, [mensagem], momento);
        if (!lida) throw new Error('A mensagem não foi lida.');
        return lida;
      });
    },
  );

  app.post(
    '/chat/conversas/:id/leitura',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Marca a conversa como lida até a mensagem, com as notificações dela',
        params: ParametrosDaConversa,
        body: z.object({ ate: z.uuid({ error: 'A mensagem não está nesta conversa.' }) }),
        response: { 200: LeituraDaConversa, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        const { linha } = await lerConversaDaConta(tx, conta, requisicao.params.id);
        const [mensagem] = await tx
          .select({ id: mensagensDoChat.id })
          .from(mensagensDoChat)
          .where(
            and(
              eq(mensagensDoChat.id, requisicao.body.ate),
              eq(mensagensDoChat.conversaId, linha.id),
            ),
          );
        if (!mensagem) throw dadosInvalidos({ ate: 'A mensagem não está nesta conversa.' });
        // Só anda para a frente: a linha muda só com a mensagem depois da lida.
        const [andou] = await tx
          .insert(leiturasDasConversas)
          .values({
            orgId: linha.orgId,
            conversaId: linha.id,
            contaId: conta.id,
            lidaAte: mensagem.id,
          })
          .onConflictDoUpdate({
            target: DA_LEITURA,
            set: { lidaAte: sql`excluded.lida_ate` },
            setWhere: sql`${leiturasDasConversas.lidaAte} is null or ${leiturasDasConversas.lidaAte} < excluded.lida_ate`,
          })
          .returning({ lidaAte: leiturasDasConversas.lidaAte });
        if (andou) {
          await registrarEvento(tx, {
            tipo: 'chat.mudou',
            alvo: { tipo: 'conversa', id: linha.id },
            publico: { contas: [conta.id] },
          });
        }
        const [leitura] = andou
          ? [andou]
          : await tx
              .select({ lidaAte: leiturasDasConversas.lidaAte })
              .from(leiturasDasConversas)
              .where(
                and(
                  eq(leiturasDasConversas.conversaId, linha.id),
                  eq(leiturasDasConversas.contaId, conta.id),
                ),
              );
        const lidaAte = leitura?.lidaAte ?? mensagem.id;
        // A notificação que chegou depois da leitura que já andou também fica lida na próxima.
        await marcarLidasDoAssunto(tx, {
          contaId: conta.id,
          assunto: assuntoDaConversa(linha.id),
          ateMensagemDoChat: lidaAte,
          momento,
        });
        return { lidaAte };
      });
    },
  );

  app.put(
    '/chat/conversas/:id/silenciada',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Silencia a conversa para a conta, ou volta a ouvi-la',
        params: ParametrosDaConversa,
        body: SilencioDaConversa,
        response: { 200: SilencioDaConversa, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        const { linha } = await lerConversaDaConta(tx, conta, requisicao.params.id);
        const { silenciada } = requisicao.body;
        // Voltar a ouvir só muda a linha que já existe e está silenciada: sem ela, nada muda, e
        // nem a linha nem o aviso nascem.
        const [mudou] = silenciada
          ? await tx
              .insert(leiturasDasConversas)
              .values({ orgId: linha.orgId, conversaId: linha.id, contaId: conta.id, silenciada })
              .onConflictDoUpdate({
                target: DA_LEITURA,
                set: { silenciada },
                setWhere: sql`not ${leiturasDasConversas.silenciada}`,
              })
              .returning({ id: leiturasDasConversas.id })
          : await tx
              .update(leiturasDasConversas)
              .set({ silenciada })
              .where(
                and(
                  eq(leiturasDasConversas.conversaId, linha.id),
                  eq(leiturasDasConversas.contaId, conta.id),
                  eq(leiturasDasConversas.silenciada, true),
                ),
              )
              .returning({ id: leiturasDasConversas.id });
        if (mudou) {
          await registrarEvento(tx, {
            tipo: 'chat.mudou',
            alvo: { tipo: 'conversa', id: linha.id },
            publico: { contas: [conta.id] },
          });
        }
        return { silenciada };
      }),
  );
};
