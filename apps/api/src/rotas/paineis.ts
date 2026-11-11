// Os painéis pela API (spec painel-de-dashboards; change painel-de-dashboards, design, decisões 1 e
// 2): quem vê os painéis lê a lista com a última verificação; quem os administra cadastra, edita,
// inativa, reativa e pede a verificação na hora. Cada mudança do cadastro vai para a auditoria, com
// o evento `paineis.mudaram`; a verificação, não.
import {
  type Banco,
  EXIBICOES_DO_PAINEL_NO_BANCO,
  locais,
  naOrganizacao,
  paineis,
  SITUACOES_DO_PAINEL_NO_BANCO,
} from '@grafite/db';
import { conferirPainel, MENSAGENS_DOS_PAINEIS, normalizarTexto, pode } from '@grafite/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import {
  painelLido,
  type VerificarEndereco,
  verificarEndereco,
  verificarPaineis,
} from '../paineis/paineis.ts';
import type { criarPonteDosPaineis } from '../paineis/ponte.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const Painel = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    endereco: z.string(),
    local: z.object({ id: z.uuid(), caminho: z.string() }).nullable(),
    ordem: z.number().int(),
    situacao: z.enum(['ativo', 'inativo']),
    verificacao: z.object({
      situacao: z.enum(SITUACOES_DO_PAINEL_NO_BANCO),
      /** ISO 8601. */
      momento: z.string().nullable(),
      /** Em ms. */
      tempoDaResposta: z.number().int().nullable(),
      motivo: z.string().nullable(),
    }),
    /**
     * Se o navegador consegue mostrar o painel dentro do Grafite, pela última resposta: uma
     * leitura, e não uma prova. Nula no painel fora do ar e no ainda não verificado.
     */
    exibicao: z
      .object({
        situacao: z.enum(EXIBICOES_DO_PAINEL_NO_BANCO),
        motivo: z.string().nullable(),
      })
      .nullable(),
  })
  .meta({ id: 'Painel' });

const ListaDePaineis = z
  .object({ paineis: z.array(Painel), permite: z.object({ administrar: z.boolean() }) })
  .meta({ id: 'ListaDePaineis' });

const PedidoDePainel = z
  .object({
    nome: z.string(),
    endereco: z.string(),
    localId: z.string().nullable().optional(),
    ordem: z.number().nullable().optional(),
  })
  .meta({ id: 'PedidoDePainel' });

const ParametrosDoPainel = z.object({ id: z.uuid({ error: 'Painel não encontrado.' }) });

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

export const rotasDosPaineis: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  /** Quem pede os endereços; os testes trocam pelo deles. */
  verificar?: VerificarEndereco;
  ponte: ReturnType<typeof criarPonteDosPaineis>;
}> = async (app, { banco, agora, verificar = verificarEndereco, ponte }) => {
  const orgDa = (requisicao: FastifyRequest) => requisicao.organizacao?.id ?? '';

  app.get(
    '/paineis/:id/exibicao',
    {
      config: { permissao: 'paineis.ver' },
      schema: { hide: true, params: ParametrosDoPainel },
    },
    ponte.abrir,
  );

  app.get(
    '/paineis',
    {
      config: { permissao: 'paineis.ver' },
      schema: {
        summary: 'Os painéis da organização, na ordem da grade, com a última verificação',
        response: { 200: ListaDePaineis, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const arvore = await lerArvore(tx);
        const linhas = await tx
          .select()
          .from(paineis)
          .orderBy(asc(paineis.ordem), asc(paineis.nomeNormalizado));
        return {
          paineis: linhas.map((linha) => painelLido(linha, arvore)),
          permite: { administrar: pode(acesso, 'paineis.administrar') },
        };
      });
    },
  );

  /** Grava o painel novo ou a mudança, com o local conferido no banco. */
  async function gravar(
    requisicao: FastifyRequest,
    pedido: z.infer<typeof PedidoDePainel>,
    id?: string,
  ) {
    const { contaId } = sessaoDa(requisicao);
    const conferido = conferirPainel(pedido);
    if (!conferido.ok) throw dadosInvalidos(conferido.erros as Record<string, string>);
    const { dados } = conferido;
    const momento = agora();
    return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
      const arvore = await lerArvore(tx);
      if (dados.localId) {
        const [local] = await tx
          .select({ id: locais.id })
          .from(locais)
          .where(and(eq(locais.id, dados.localId), eq(locais.situacao, 'ativo')));
        if (!local) throw dadosInvalidos({ local: MENSAGENS_DOS_PAINEIS.local });
      }
      const [antes] = id ? await tx.select().from(paineis).where(eq(paineis.id, id)) : [];
      if (id && !antes) throw naoEncontrado('Painel não encontrado.');
      const valores = {
        nome: dados.nome,
        nomeNormalizado: normalizarTexto(dados.nome),
        endereco: dados.endereco,
        localId: dados.localId,
        ordem: dados.ordem,
        atualizadoEm: momento,
        // O endereço novo volta a esperar a verificação, sem a exibição que era do anterior.
        ...(antes && antes.endereco !== dados.endereco
          ? {
              verificacao: 'sem-verificacao' as const,
              motivo: null,
              verificadoEm: null,
              exibicao: null,
              motivoDaExibicao: null,
            }
          : {}),
      };
      let linha: typeof paineis.$inferSelect | undefined;
      try {
        [linha] = antes
          ? await tx.update(paineis).set(valores).where(eq(paineis.id, antes.id)).returning()
          : await tx
              .insert(paineis)
              .values({ orgId: orgDa(requisicao), ...valores, criadoEm: momento })
              .returning();
      } catch (erro) {
        if (violouUnicidade(erro, 'paineis_nome_unico')) {
          throw conflito(MENSAGENS_DOS_PAINEIS.repetido, { nome: MENSAGENS_DOS_PAINEIS.repetido });
        }
        throw erro;
      }
      if (!linha) throw new Error('O painel não foi gravado.');
      await registrarNaAuditoria(tx, {
        acao: antes ? 'painel.alterado' : 'painel.criado',
        ator: { tipo: 'conta', contaId },
        alvo: { tipo: 'painel', id: linha.id },
        ...(antes
          ? { antes: { nome: antes.nome, endereco: antes.endereco, ordem: antes.ordem } }
          : {}),
        depois: { nome: linha.nome, endereco: linha.endereco, ordem: linha.ordem },
        origem: origemDa(requisicao),
        momento,
      });
      return painelLido(linha, arvore);
    });
  }

  app.post(
    '/paineis',
    {
      config: { permissao: 'paineis.administrar' },
      schema: {
        summary: 'Cadastrar um painel',
        body: PedidoDePainel,
        response: { 201: Painel, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) =>
      resposta.code(201).send(await gravar(requisicao, requisicao.body)),
  );

  app.patch(
    '/paineis/:id',
    {
      config: { permissao: 'paineis.administrar' },
      schema: {
        summary: 'Editar um painel',
        params: ParametrosDoPainel,
        body: PedidoDePainel,
        response: { 200: Painel, ...PROBLEMAS },
      },
    },
    async (requisicao) => gravar(requisicao, requisicao.body, requisicao.params.id),
  );

  for (const [caminho, situacao] of [
    ['inativacao', 'inativo'],
    ['reativacao', 'ativo'],
  ] as const) {
    app.post(
      `/paineis/:id/${caminho}`,
      {
        config: { permissao: 'paineis.administrar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar um painel' : 'Reativar um painel',
          params: ParametrosDoPainel,
          response: { 200: Painel, ...PROBLEMAS },
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
          const arvore = await lerArvore(tx);
          const [linha] = await tx
            .update(paineis)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(paineis.id, requisicao.params.id))
            .returning();
          if (!linha) throw naoEncontrado('Painel não encontrado.');
          await registrarNaAuditoria(tx, {
            acao: situacao === 'inativo' ? 'painel.inativado' : 'painel.reativado',
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'painel', id: linha.id },
            dados: { nome: linha.nome },
            origem: origemDa(requisicao),
            momento,
          });
          return painelLido(linha, arvore);
        });
      },
    );
  }

  app.post(
    '/paineis/:id/verificacao',
    {
      config: { permissao: 'paineis.administrar' },
      schema: {
        summary: 'Verificar um painel na hora',
        params: ParametrosDoPainel,
        response: { 200: Painel, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const orgId = orgDa(requisicao);
      const { id } = requisicao.params;
      const existe = await naOrganizacao(banco, orgId, async (tx) => {
        const [painel] = await tx
          .select({ situacao: paineis.situacao })
          .from(paineis)
          .where(eq(paineis.id, id));
        return painel;
      });
      if (!existe) throw naoEncontrado('Painel não encontrado.');
      if (existe.situacao === 'inativo') throw conflito('O painel inativo não é verificado.');
      await verificarPaineis(banco, orgId, { agora: agora(), verificar, ids: [id] });
      return naOrganizacao(banco, orgId, async (tx) => {
        const arvore = await lerArvore(tx);
        const [linha] = await tx.select().from(paineis).where(eq(paineis.id, id));
        if (!linha) throw naoEncontrado('Painel não encontrado.');
        return painelLido(linha, arvore);
      });
    },
  );
};
