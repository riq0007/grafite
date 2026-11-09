// Os canais da conta e os aparelhos do push (spec notificacoes, "Aparelhos do push" e "Canais
// desligados sem configuração"; change p3c-email-e-push, design, decisões 8 e 9): o que cada canal
// tem para a conta, a inscrição do aparelho, que só aceita um serviço de push dos navegadores, a
// retirada pela própria conta e o teste de cada canal, na hora, sem gravar notificação. Sem
// permissão própria: cada conta cuida dos dela, com a sessão valendo.
import {
  type Banco,
  contas,
  inscricoesDePush,
  naOrganizacao,
  organizacoes,
  pessoas,
} from '@grafite/db';
import { type Ambiente, emailDeTeste, pushDeTeste } from '@grafite/domain';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirAtiva, sessaoDa } from '../acesso/escopo.ts';
import {
  type CanaisDaApi,
  SITUACOES_DO_EMAIL,
  SITUACOES_DO_PUSH,
  situacaoDoEmail,
  situacaoDoPush,
} from '../canais/canais.ts';
import { FalhaDoEmail } from '../canais/email.ts';
import { origemDaOrganizacao } from '../notificacoes/entrega.ts';
import {
  conflito,
  dadosInvalidos,
  naoEncontrado,
  ProblemaDaApi,
  RespostaDeProblema,
} from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const ENDERECO_DO_PUSH = 'Use o endereço de um serviço de push dos navegadores.';
const PUSH_SEM_CONFIGURACAO = 'Os avisos no celular não estão configurados neste servidor.';
export const CANAIS_NO_TESTE = 'O ambiente de teste não envia e-mail nem avisos no celular.';
const EMAIL_SEM_CONFIGURACAO = 'O envio de e-mail não está configurado neste servidor.';
const PESSOA_SEM_EMAIL =
  'A pessoa da sua conta não tem e-mail. Peça à administração para cadastrar o seu e-mail.';

/** Um teste de cada canal a cada 30 s, por conta. */
const INTERVALO_DOS_TESTES = 30_000;

/** O servidor de e-mail ou o serviço de push recusou o teste (502 `canal-recusou`). */
const canalRecusou = (detalhe: string) =>
  new ProblemaDaApi({ codigo: 'canal-recusou', status: 502, titulo: 'Canal recusou', detalhe });

const AparelhoDoPush = z
  .object({
    id: z.uuid(),
    /** O nome do aparelho, como "Chrome no Android". */
    aparelho: z.string(),
    /** O endereço da inscrição, para a web reconhecer "Este aparelho". */
    endpoint: z.string(),
    /** ISO 8601. */
    criadaEm: z.string(),
    /** O último push aceito pelo serviço, em ISO 8601. */
    ultimoEnvioEm: z.string().nullable(),
  })
  .meta({ id: 'AparelhoDoPush' });

const CanaisDaConta = z
  .object({
    email: z.object({
      situacao: z.enum(SITUACOES_DO_EMAIL),
      /** O e-mail da pessoa da conta, para onde as notificações vão. */
      endereco: z.string().nullable(),
    }),
    push: z.object({
      situacao: z.enum(SITUACOES_DO_PUSH),
      /** A chave com que o navegador inscreve o aparelho; só com o push ligado. */
      chavePublica: z.string().nullable(),
      aparelhos: z.array(AparelhoDoPush),
    }),
  })
  .meta({ id: 'CanaisDaConta' });

const NovaInscricao = z
  .object({
    endpoint: z.string({ error: ENDERECO_DO_PUSH }).max(1000, { error: ENDERECO_DO_PUSH }),
    chaves: z.object({
      p256dh: z
        .string()
        .regex(/^[A-Za-z0-9_-]{87}$/, { error: 'Use a chave p256dh da inscrição, em base64url.' }),
      auth: z
        .string()
        .regex(/^[A-Za-z0-9_-]{22}$/, { error: 'Use a chave auth da inscrição, em base64url.' }),
    }),
    aparelho: z
      .string()
      .trim()
      .min(1, { error: 'Diga o nome do aparelho.' })
      .max(80, { error: 'Use até 80 caracteres.' }),
  })
  .meta({ id: 'NovaInscricaoDePush' });

const ParametrosDoAparelho = z.object({ id: z.uuid({ error: 'Aparelho não encontrado.' }) });

const PROBLEMAS_DOS_CANAIS = { 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };
const PROBLEMAS_DOS_TESTES = {
  ...PROBLEMAS_DOS_CANAIS,
  409: RespostaDeProblema,
  429: RespostaDeProblema,
  502: RespostaDeProblema,
};

const EmailDeTeste = z
  .object({
    /** O e-mail para onde o teste foi. */
    endereco: z.string(),
  })
  .meta({ id: 'EmailDeTeste' });

const AvisoDeTeste = z
  .object({
    /** Quantos aparelhos receberam o aviso de teste. */
    aparelhos: z.number().int(),
  })
  .meta({ id: 'AvisoDeTeste' });

type LinhaDoAparelho = typeof inscricoesDePush.$inferSelect;

const paraAResposta = (linha: LinhaDoAparelho): z.infer<typeof AparelhoDoPush> => ({
  id: linha.id,
  aparelho: linha.aparelho,
  endpoint: linha.endpoint,
  criadaEm: linha.criadaEm.toISOString(),
  ultimoEnvioEm: linha.ultimoEnvioEm?.toISOString() ?? null,
});

export const rotasDosCanais: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  ambiente: Ambiente;
  canais: CanaisDaApi;
}> = async (app, { banco, agora, ambiente, canais }) => {
  const ultimosTestes = new Map<string, number>();

  /** Um teste de cada canal a cada 30 s: o que vem antes disso é recusado com 429. */
  function conferirIntervalo(contaId: string, canal: 'email' | 'push') {
    const chave = `${contaId}:${canal}`;
    const momento = agora().getTime();
    const ultimo = ultimosTestes.get(chave);
    if (ultimo !== undefined && momento - ultimo < INTERVALO_DOS_TESTES) {
      throw new ProblemaDaApi({
        codigo: 'teste-recente',
        status: 429,
        titulo: 'Teste recente',
        detalhe: 'Espere 30 s para mandar outro teste.',
      });
    }
    ultimosTestes.set(chave, momento);
  }

  app.get(
    '/conta/canais',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'O e-mail e o push da própria conta, com os aparelhos inscritos',
        response: { 200: CanaisDaConta, ...PROBLEMAS_DOS_CANAIS },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const push = situacaoDoPush(ambiente, canais);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [daPessoa] = await tx
          .select({ email: pessoas.email })
          .from(contas)
          .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
          .where(eq(contas.id, contaId));
        const endereco = daPessoa?.email ?? null;
        const aparelhos =
          push === 'ligado'
            ? await tx
                .select()
                .from(inscricoesDePush)
                .where(eq(inscricoesDePush.contaId, contaId))
                .orderBy(asc(inscricoesDePush.criadaEm), asc(inscricoesDePush.id))
            : [];
        return {
          email: { situacao: situacaoDoEmail(ambiente, canais, endereco), endereco },
          push: {
            situacao: push,
            chavePublica: push === 'ligado' ? (canais.entregador?.chavePublica ?? null) : null,
            aparelhos: aparelhos.map(paraAResposta),
          },
        };
      });
    },
  );

  app.post(
    '/conta/push',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Inscreve o aparelho no push da própria conta',
        body: NovaInscricao,
        response: { 201: AparelhoDoPush, ...PROBLEMAS_DOS_CANAIS },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      if (ambiente === 'teste') throw conflito(CANAIS_NO_TESTE);
      const { entregador } = canais;
      if (!entregador) throw conflito(PUSH_SEM_CONFIGURACAO);
      const { endpoint, chaves, aparelho } = requisicao.body;
      // O endereço passa pela conta: só um serviço de push dos navegadores é aceito.
      if (!entregador.aceita(endpoint)) throw dadosInvalidos({ endpoint: ENDERECO_DO_PUSH });
      const momento = agora();
      const linha = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        // O mesmo endereço é o mesmo navegador: a inscrição passa para a conta que entrou nele.
        const [gravada] = await tx
          .insert(inscricoesDePush)
          .values({
            orgId: sql`app.current_org()`,
            contaId,
            endpoint,
            p256dh: chaves.p256dh,
            auth: chaves.auth,
            aparelho,
            criadaEm: momento,
          })
          .onConflictDoUpdate({
            target: [inscricoesDePush.orgId, inscricoesDePush.endpoint],
            set: {
              contaId,
              p256dh: chaves.p256dh,
              auth: chaves.auth,
              aparelho,
              criadaEm: momento,
              ultimoEnvioEm: null,
            },
          })
          .returning();
        if (!gravada) throw new Error('A inscrição do aparelho não foi gravada.');
        return gravada;
      });
      return resposta.code(201).send(paraAResposta(linha));
    },
  );

  app.delete(
    '/conta/push/:id',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Tira um aparelho do push da própria conta',
        params: ParametrosDoAparelho,
        response: { 204: z.null(), ...PROBLEMAS_DOS_CANAIS },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const apagados = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        tx
          .delete(inscricoesDePush)
          .where(
            and(
              eq(inscricoesDePush.id, requisicao.params.id),
              eq(inscricoesDePush.contaId, contaId),
            ),
          )
          .returning({ id: inscricoesDePush.id }),
      );
      if (apagados.length === 0) throw naoEncontrado('Aparelho não encontrado.');
      return resposta.code(204).send(null);
    },
  );

  app.post(
    '/conta/canais/email/teste',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Manda o e-mail de teste para a pessoa da própria conta, na hora',
        response: { 200: EmailDeTeste, ...PROBLEMAS_DOS_TESTES },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      if (ambiente === 'teste') throw conflito(CANAIS_NO_TESTE);
      const { carteiro } = canais;
      if (!carteiro) throw conflito(EMAIL_SEM_CONFIGURACAO);
      const { endereco, organizacao, origem } = await naOrganizacao(
        banco,
        requisicao.organizacao?.id ?? '',
        async (tx) => {
          const [daPessoa] = await tx
            .select({ email: pessoas.email })
            .from(contas)
            .innerJoin(
              pessoas,
              and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)),
            )
            .where(eq(contas.id, contaId));
          const [daOrganizacao] = await tx.select({ nome: organizacoes.nome }).from(organizacoes);
          return {
            endereco: daPessoa?.email ?? null,
            organizacao: daOrganizacao?.nome ?? '',
            origem: await origemDaOrganizacao(tx, canais.origemDosLinks),
          };
        },
      );
      if (!endereco) throw conflito(PESSOA_SEM_EMAIL);
      conferirIntervalo(contaId, 'email');
      try {
        await carteiro.enviar({ para: endereco, ...emailDeTeste({ organizacao, origem }) });
      } catch (erro) {
        if (!(erro instanceof FalhaDoEmail)) throw erro;
        requisicao.log.warn({ detalhe: erro.detalhe }, erro.message);
        throw canalRecusou(erro.message);
      }
      return { endereco };
    },
  );

  app.post(
    '/conta/canais/push/teste',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Manda o aviso de teste para os aparelhos da própria conta, na hora',
        response: { 200: AvisoDeTeste, ...PROBLEMAS_DOS_TESTES },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      if (ambiente === 'teste') throw conflito(CANAIS_NO_TESTE);
      const { entregador } = canais;
      if (!entregador) throw conflito(PUSH_SEM_CONFIGURACAO);
      const orgId = requisicao.organizacao?.id ?? '';
      const aparelhos = await naOrganizacao(banco, orgId, (tx) =>
        tx.select().from(inscricoesDePush).where(eq(inscricoesDePush.contaId, contaId)),
      );
      if (aparelhos.length === 0) {
        throw conflito('Inscreva um aparelho antes de mandar o aviso de teste.');
      }
      conferirIntervalo(contaId, 'push');
      const recebidos: string[] = [];
      const expirados: string[] = [];
      for (const aparelho of aparelhos) {
        try {
          const resultado = await entregador.enviar(aparelho, pushDeTeste());
          (resultado === 'expirada' ? expirados : recebidos).push(aparelho.id);
        } catch (erro) {
          requisicao.log.warn(
            { err: erro, inscricaoId: aparelho.id },
            'o serviço de push recusou o aviso de teste',
          );
        }
      }
      await naOrganizacao(banco, orgId, async (tx) => {
        if (expirados.length > 0) {
          await tx.delete(inscricoesDePush).where(inArray(inscricoesDePush.id, expirados));
        }
        if (recebidos.length > 0) {
          await tx
            .update(inscricoesDePush)
            .set({ ultimoEnvioEm: agora() })
            .where(inArray(inscricoesDePush.id, recebidos));
        }
      });
      if (recebidos.length === 0 && expirados.length < aparelhos.length) {
        throw canalRecusou('O serviço de push recusou o aviso de teste.');
      }
      return { aparelhos: recebidos.length };
    },
  );
};
