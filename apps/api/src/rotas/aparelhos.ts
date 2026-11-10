// Os aparelhos confiáveis pela API (spec verificacao-em-dois-passos, "Aparelhos esquecidos", e spec
// ajustes-do-sistema, "Seção Conta"; change aparelho-confiavel, design, decisão 5): a conta vê os
// próprios aparelhos, com o prazo que vale para ela e qual é o do navegador atual, e esquece um ou
// todos. Esquecer apaga o aparelho, e a auditoria guarda quem esqueceu, sem o token.
import {
  aparelhosConfiaveis,
  type Banco,
  contas,
  naOrganizacao,
  politicaDeEntrada,
  type Transacao,
} from '@grafite/db';
import { MENSAGENS_DA_CONFIANCA, PRAZO_DA_CONFIANCA } from '@grafite/domain';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  type AparelhoListado,
  apagarCookieDoAparelho,
  aparelhoDaSessao,
  aparelhosDaConta,
  esquecerAparelhosDaConta,
  prazoDaConta,
} from '../acesso/aparelhos.ts';
import { exigirAtiva, sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { CUIDE_DA_SUA, contaDeOutraPessoa } from './contas.ts';
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

/** O aparelho como a administração o vê: com o IP, e sem o "Este aparelho", que é da própria conta. */
const AparelhoNaAdministracao = AparelhoConfiavel.omit({ esteAparelho: true })
  .extend({ ip: z.string().nullable() })
  .meta({ id: 'AparelhoNaAdministracao' });

/** O prazo que vale para a conta e o próprio dela: `null` segue os perfis e a organização. */
const PrazoDaConta = z
  .object({ prazo: PrazoDaConfianca, diasDaConta: z.number().int().min(0).max(90).nullable() })
  .meta({ id: 'PrazoDaConta' });

const AparelhosDaContaNaAdministracao = PrazoDaConta.extend({
  aparelhos: z.array(AparelhoNaAdministracao),
}).meta({ id: 'AparelhosDaContaNaAdministracao' });

/** Os dias de um prazo, de 0 a 90, com a recusa da spec em todo erro. */
export const DiasDeConfianca = z
  .number({ error: MENSAGENS_DA_CONFIANCA.prazo })
  .int({ error: MENSAGENS_DA_CONFIANCA.prazo })
  .min(PRAZO_DA_CONFIANCA.minimo, { error: MENSAGENS_DA_CONFIANCA.prazo })
  .max(PRAZO_DA_CONFIANCA.maximo, { error: MENSAGENS_DA_CONFIANCA.prazo });

const PedidoDePrazo = z
  .object({ dias: DiasDeConfianca.nullable() })
  .meta({ id: 'PedidoDePrazoDaConfianca' });

const PoliticaDeEntrada = z
  .object({ diasDeConfianca: DiasDeConfianca })
  .meta({ id: 'PoliticaDeEntrada' });

const ParametrosDaConta = z.object({ id: z.uuid({ error: 'Conta não encontrada.' }) });

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

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

  // A administração (spec administracao-de-pessoas, "Aparelhos confiáveis pela administração"): a
  // conta de outra pessoa, com `contas.administrar` no local dela; a própria conta é recusada.

  app.get(
    '/contas/:id/aparelhos',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary: 'Os aparelhos confiáveis de outra conta, com o prazo que vale para ela',
        params: ParametrosDaConta,
        response: { 200: AparelhosDaContaNaAdministracao, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const { conta } = await contaDeOutraPessoa(
          tx,
          requisicao,
          requisicao.params.id,
          arvore,
          CUIDE_DA_SUA,
        );
        const { prazo, aparelhos } = await aparelhosDaConta(tx, {
          contaId: conta.id,
          momento: agora(),
        });
        return {
          prazo,
          diasDaConta: await diasDaConta(tx, conta.id),
          aparelhos: aparelhos.map(({ esteAparelho: _este, ...aparelho }) => ({
            ...aparelho,
            criadoEm: aparelho.criadoEm.toISOString(),
            usadoEm: aparelho.usadoEm.toISOString(),
            valeAte: aparelho.valeAte.toISOString(),
          })),
        };
      }),
  );

  app.delete(
    '/contas/:id/aparelhos',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary: 'Esquecer todos os aparelhos confiáveis de outra conta; as sessões continuam',
        params: ParametrosDaConta,
        response: { 204: z.null(), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const { conta } = await contaDeOutraPessoa(
          tx,
          requisicao,
          requisicao.params.id,
          arvore,
          CUIDE_DA_SUA,
        );
        const quantos = await esquecerAparelhosDaConta(tx, conta.id);
        await registrarNaAuditoria(tx, {
          acao: 'aparelhos.esquecidos',
          ator: { tipo: 'conta', contaId: sessaoDa(requisicao).contaId },
          alvo: { tipo: 'conta', id: conta.id },
          dados: { quantos },
          origem: origemDa(requisicao),
          momento,
        });
      });
      return resposta.code(204).send(null);
    },
  );

  app.put(
    '/contas/:id/prazo-da-confianca',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary:
          'Mudar o prazo da confiança de outra conta; `null` segue os perfis e a organização',
        params: ParametrosDaConta,
        body: PedidoDePrazo,
        response: { 200: PrazoDaConta, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const momento = agora();
      const { dias } = requisicao.body;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const { conta } = await contaDeOutraPessoa(
          tx,
          requisicao,
          requisicao.params.id,
          arvore,
          MENSAGENS_DA_CONFIANCA.propriaConta,
        );
        const antes = await diasDaConta(tx, conta.id);
        if (antes !== dias) {
          await tx
            .update(contas)
            .set({ diasDeConfianca: dias, atualizadaEm: momento })
            .where(eq(contas.id, conta.id));
          await registrarNaAuditoria(tx, {
            acao: 'prazo-da-confianca.alterado',
            ator: { tipo: 'conta', contaId: sessaoDa(requisicao).contaId },
            alvo: { tipo: 'conta', id: conta.id },
            antes: { dias: antes },
            depois: { dias },
            origem: origemDa(requisicao),
            momento,
          });
        }
        return { prazo: await prazoDaConta(tx, conta.id), diasDaConta: dias };
      });
    },
  );

  // O prazo da organização (spec perfis-e-grupos, "Prazo da confiança no perfil e na organização").

  app.get(
    '/politica-de-entrada',
    {
      config: { permissao: 'acessos.ver' },
      schema: {
        summary: 'O prazo da confiança nos aparelhos da organização',
        response: { 200: PoliticaDeEntrada, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => ({
        diasDeConfianca: await diasDaOrganizacao(tx),
      })),
  );

  app.put(
    '/politica-de-entrada',
    {
      config: { permissao: 'acessos.administrar' },
      schema: {
        summary: 'Mudar o prazo da confiança nos aparelhos da organização',
        body: PoliticaDeEntrada,
        response: { 200: PoliticaDeEntrada, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const momento = agora();
      const { diasDeConfianca } = requisicao.body;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const antes = await diasDaOrganizacao(tx);
        if (antes !== diasDeConfianca) {
          await tx
            .insert(politicaDeEntrada)
            .values({
              orgId: requisicao.organizacao?.id ?? '',
              diasDeConfianca,
              atualizadaEm: momento,
            })
            .onConflictDoUpdate({
              target: politicaDeEntrada.orgId,
              set: { diasDeConfianca, atualizadaEm: momento },
            });
          await registrarNaAuditoria(tx, {
            acao: 'prazo-da-confianca.alterado',
            ator: { tipo: 'conta', contaId: sessaoDa(requisicao).contaId },
            alvo: { tipo: 'organizacao', id: requisicao.organizacao?.id ?? null },
            antes: { dias: antes },
            depois: { dias: diasDeConfianca },
            origem: origemDa(requisicao),
            momento,
          });
        }
        return { diasDeConfianca };
      });
    },
  );
};

/** O prazo próprio da conta, ou `null`. */
async function diasDaConta(tx: Transacao, contaId: string): Promise<number | null> {
  const [linha] = await tx
    .select({ dias: contas.diasDeConfianca })
    .from(contas)
    .where(eq(contas.id, contaId));
  return linha?.dias ?? null;
}

/** O prazo da organização: o da política, ou os 30 dias de fábrica. */
async function diasDaOrganizacao(tx: Transacao): Promise<number> {
  const [linha] = await tx
    .select({ dias: politicaDeEntrada.diasDeConfianca })
    .from(politicaDeEntrada);
  return linha?.dias ?? PRAZO_DA_CONFIANCA.deFabrica;
}
