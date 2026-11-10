// Os aparelhos confiáveis pela API (spec verificacao-em-dois-passos, "Aparelhos esquecidos", e spec
// ajustes-do-sistema, "Seção Conta"; change aparelho-confiavel, design, decisão 5): a conta vê os
// próprios aparelhos, com o prazo que vale para ela e qual é o do navegador atual, e esquece um ou
// todos. Esquecer apaga o aparelho, e a auditoria guarda quem esqueceu, sem o token.
import { aparelhosConfiaveis, type Banco, naOrganizacao } from '@grafite/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  type AparelhoListado,
  apagarCookieDoAparelho,
  aparelhoDaSessao,
  aparelhosDaConta,
  esquecerAparelhosDaConta,
} from '../acesso/aparelhos.ts';
import { exigirAtiva } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

/** De onde vem o prazo que vale: a conta, um perfil ou a organização. */
export const OrigemDoPrazo = z
  .discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('conta') }),
    z.object({ tipo: z.literal('perfil'), nome: z.string() }),
    z.object({ tipo: z.literal('organizacao') }),
  ])
  .meta({ id: 'OrigemDoPrazo' });

/** O prazo da confiança que vale para a conta, em dias, e de onde ele vem. */
export const PrazoDaConfianca = z
  .object({ dias: z.number().int().min(0).max(90), origem: OrigemDoPrazo })
  .meta({ id: 'PrazoDaConfianca' });

const AparelhoConfiavel = z
  .object({
    id: z.uuid(),
    /** O navegador e o sistema, como "Chrome no Windows". */
    dispositivo: z.string(),
    /** Quando o aparelho passou a ser confiável. */
    criadoEm: z.iso.datetime(),
    usadoEm: z.iso.datetime(),
    /** Até quando ele dispensa o código, pelo prazo de agora. */
    valeAte: z.iso.datetime(),
    /** O aparelho do navegador desta sessão. */
    esteAparelho: z.boolean(),
  })
  .meta({ id: 'AparelhoConfiavel' });

const AparelhosDaConta = z
  .object({ prazo: PrazoDaConfianca, aparelhos: z.array(AparelhoConfiavel) })
  .meta({ id: 'AparelhosDaConta' });

/** O aparelho como a própria conta o vê: sem o IP, que só a administração vê. */
const daPropriaConta = ({ ip: _ip, ...aparelho }: AparelhoListado) => ({
  ...aparelho,
  criadoEm: aparelho.criadoEm.toISOString(),
  usadoEm: aparelho.usadoEm.toISOString(),
  valeAte: aparelho.valeAte.toISOString(),
});

export const rotasDosAparelhos: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/conta/aparelhos',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Os aparelhos confiáveis da conta, com o prazo que vale para ela',
        response: { 200: AparelhosDaConta, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const { prazo, aparelhos } = await naOrganizacao(
        banco,
        requisicao.organizacao?.id ?? '',
        async (tx) =>
          aparelhosDaConta(tx, {
            contaId: sessao.contaId,
            momento: agora(),
            acesso: sessao.acesso,
            aparelhoDaSessao: await aparelhoDaSessao(tx, sessao.id),
          }),
      );
      return { prazo, aparelhos: aparelhos.map(daPropriaConta) };
    },
  );

  app.delete(
    '/conta/aparelhos/:id',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Esquecer um aparelho confiável da conta',
        params: z.object({ id: z.uuid({ error: 'Aparelho não encontrado.' }) }),
        response: { 204: z.null(), 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const momento = agora();
      const doNavegador = await naOrganizacao(
        banco,
        requisicao.organizacao?.id ?? '',
        async (tx) => {
          const [apagado] = await tx
            .delete(aparelhosConfiaveis)
            .where(
              and(
                eq(aparelhosConfiaveis.id, requisicao.params.id),
                eq(aparelhosConfiaveis.contaId, sessao.contaId),
              ),
            )
            .returning({
              id: aparelhosConfiaveis.id,
              dispositivo: aparelhosConfiaveis.dispositivo,
            });
          if (!apagado) throw naoEncontrado('Aparelho não encontrado.');
          await registrarNaAuditoria(tx, {
            acao: 'aparelho.esquecido',
            ator: { tipo: 'conta', contaId: sessao.contaId },
            alvo: { tipo: 'aparelho', id: apagado.id },
            dados: { dispositivo: apagado.dispositivo },
            origem: origemDa(requisicao),
            momento,
          });
          return (await aparelhoDaSessao(tx, sessao.id)) === apagado.id;
        },
      );
      // O aparelho deste navegador esquecido: o cookie dele sai também.
      if (doNavegador) apagarCookieDoAparelho(resposta);
      return resposta.code(204).send(null);
    },
  );

  app.delete(
    '/conta/aparelhos',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Esquecer todos os aparelhos confiáveis da conta',
        response: { 204: z.null(), 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const momento = agora();
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const quantos = await esquecerAparelhosDaConta(tx, sessao.contaId);
        await registrarNaAuditoria(tx, {
          acao: 'aparelhos.esquecidos',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'conta', id: sessao.contaId },
          dados: { quantos },
          origem: origemDa(requisicao),
          momento,
        });
      });
      apagarCookieDoAparelho(resposta);
      return resposta.code(204).send(null);
    },
  );
};
