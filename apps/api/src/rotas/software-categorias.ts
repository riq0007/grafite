// As categorias da base de software pela API (spec distribuicao-de-software, "Categorias da base";
// change software-por-pacote, design, decisão 3): a lista, com quantos pacotes cada uma tem, para
// quem distribui; e criar, renomear, ordenar e remover, para quem administra o software, tudo na
// auditoria. A categoria com pacotes não sai.
import {
  type Banco,
  categoriasDeSoftware,
  naOrganizacao,
  pacotesDeSoftware,
  type Transacao,
} from '@grafite/db';
import {
  conferirNomeDaCategoria,
  MENSAGENS_DAS_CATEGORIAS,
  normalizarTexto,
} from '@grafite/domain';
import { and, asc, count, eq, max } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouChaveEstrangeira, violouUnicidade } from '../banco.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

export const CategoriaDeSoftware = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    ordem: z.number(),
    /** Quantos pacotes, ativos e inativos, estão nela. */
    pacotes: z.number(),
  })
  .meta({ id: 'CategoriaDeSoftware' });

const PedidoDeCategoria = z.object({ nome: z.string() }).meta({ id: 'PedidoDeCategoria' });

const ParametrosDaCategoria = z.object({ id: z.uuid({ error: 'Categoria não encontrada.' }) });

const ListaDeCategorias = z.object({ categorias: z.array(CategoriaDeSoftware) });

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

type Categoria = z.infer<typeof CategoriaDeSoftware>;

/** As categorias na ordem, com quantos pacotes cada uma tem; com o id, só aquela. */
export function lerCategorias(tx: Transacao, id?: string): Promise<Categoria[]> {
  return tx
    .select({
      id: categoriasDeSoftware.id,
      nome: categoriasDeSoftware.nome,
      ordem: categoriasDeSoftware.ordem,
      pacotes: count(pacotesDeSoftware.id),
    })
    .from(categoriasDeSoftware)
    .leftJoin(
      pacotesDeSoftware,
      and(
        eq(pacotesDeSoftware.orgId, categoriasDeSoftware.orgId),
        eq(pacotesDeSoftware.categoriaId, categoriasDeSoftware.id),
      ),
    )
    .where(id ? eq(categoriasDeSoftware.id, id) : undefined)
    .groupBy(
      categoriasDeSoftware.id,
      categoriasDeSoftware.nome,
      categoriasDeSoftware.ordem,
      categoriasDeSoftware.nomeNormalizado,
    )
    .orderBy(asc(categoriasDeSoftware.ordem), asc(categoriasDeSoftware.nomeNormalizado));
}

async function lerCategoria(tx: Transacao, id: string): Promise<Categoria> {
  const [categoria] = await lerCategorias(tx, id);
  if (!categoria) throw naoEncontrado('Categoria não encontrada.');
  return categoria;
}

/** O nome conferido, ou a recusa com o campo. */
function nomeDoPedido(nome: unknown): string {
  const conferido = conferirNomeDaCategoria(nome);
  if (!conferido.ok) throw dadosInvalidos({ nome: conferido.erro });
  return conferido.nome;
}

/** Grava com o nome único: o repetido, sem diferenciar acento, vira 409 no campo. */
async function comNomeUnico<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'categorias_de_software_nome_unico')) {
      throw conflito(MENSAGENS_DAS_CATEGORIAS.nomeRepetido, {
        nome: MENSAGENS_DAS_CATEGORIAS.nomeRepetido,
      });
    }
    throw erro;
  }
}

export const rotasDasCategoriasDeSoftware: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  const orgDa = (requisicao: FastifyRequest) => requisicao.organizacao?.id ?? '';
  const autorDa = (requisicao: FastifyRequest) =>
    ({ tipo: 'conta', contaId: sessaoDa(requisicao).contaId }) as const;

  app.get(
    '/software/categorias',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary: 'As categorias da base de software, na ordem',
        response: { 200: ListaDeCategorias, ...PROBLEMAS },
      },
    },
    async (requisicao) => ({
      categorias: await naOrganizacao(banco, orgDa(requisicao), (tx) => lerCategorias(tx)),
    }),
  );

  app.post(
    '/software/categorias',
    {
      config: { permissao: 'software.administrar' },
      schema: {
        summary: 'Criar uma categoria no fim da ordem',
        body: PedidoDeCategoria,
        response: { 201: CategoriaDeSoftware, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const nome = nomeDoPedido(requisicao.body.nome);
      const momento = agora();
      const criada = await naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const [ultima] = await tx
          .select({ ordem: max(categoriasDeSoftware.ordem) })
          .from(categoriasDeSoftware);
        const [linha] = await comNomeUnico(() =>
          tx
            .insert(categoriasDeSoftware)
            .values({
              orgId: orgDa(requisicao),
              nome,
              nomeNormalizado: normalizarTexto(nome),
              ordem: (ultima?.ordem ?? 0) + 1,
              criadaEm: momento,
            })
            .returning(),
        );
        if (!linha) throw new Error('A categoria não foi gravada.');
        await registrarNaAuditoria(tx, {
          acao: 'categoria-de-software.criada',
          ator: autorDa(requisicao),
          alvo: { tipo: 'categoria-de-software', id: linha.id },
          depois: { nome: linha.nome, ordem: linha.ordem },
          origem: origemDa(requisicao),
          momento,
        });
        return { id: linha.id, nome: linha.nome, ordem: linha.ordem, pacotes: 0 };
      });
      return resposta.code(201).send(criada);
    },
  );

  app.patch(
    '/software/categorias/:id',
    {
      config: { permissao: 'software.administrar' },
      schema: {
        summary: 'Renomear uma categoria',
        params: ParametrosDaCategoria,
        body: PedidoDeCategoria,
        response: { 200: CategoriaDeSoftware, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const nome = nomeDoPedido(requisicao.body.nome);
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const antes = await lerCategoria(tx, requisicao.params.id);
        if (antes.nome === nome) return antes;
        await comNomeUnico(() =>
          tx
            .update(categoriasDeSoftware)
            .set({ nome, nomeNormalizado: normalizarTexto(nome) })
            .where(eq(categoriasDeSoftware.id, antes.id)),
        );
        await registrarNaAuditoria(tx, {
          acao: 'categoria-de-software.renomeada',
          ator: autorDa(requisicao),
          alvo: { tipo: 'categoria-de-software', id: antes.id },
          antes: { nome: antes.nome },
          depois: { nome },
          origem: origemDa(requisicao),
          momento,
        });
        return { ...antes, nome };
      });
    },
  );

  app.put(
    '/software/categorias/ordem',
    {
      config: { permissao: 'software.administrar' },
      schema: {
        summary: 'Ordenar as categorias, com todas, uma vez cada',
        body: z.object({ ids: z.array(z.uuid()) }),
        response: { 200: ListaDeCategorias, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { ids } = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const atuais = await lerCategorias(tx);
        const pelaId = new Map(atuais.map((categoria) => [categoria.id, categoria]));
        if (
          ids.length !== atuais.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !pelaId.has(id))
        ) {
          throw dadosInvalidos({ ids: MENSAGENS_DAS_CATEGORIAS.ordem });
        }
        if (ids.every((id, posicao) => atuais[posicao]?.id === id)) return { categorias: atuais };
        for (const [posicao, id] of ids.entries()) {
          if (pelaId.get(id)?.ordem === posicao + 1) continue;
          await tx
            .update(categoriasDeSoftware)
            .set({ ordem: posicao + 1 })
            .where(eq(categoriasDeSoftware.id, id));
        }
        await registrarNaAuditoria(tx, {
          acao: 'categorias-de-software.ordenadas',
          ator: autorDa(requisicao),
          alvo: { tipo: 'categorias-de-software' },
          antes: { ordem: atuais.map(({ nome }) => nome) },
          depois: { ordem: ids.map((id) => pelaId.get(id)?.nome ?? id) },
          origem: origemDa(requisicao),
          momento,
        });
        return { categorias: await lerCategorias(tx) };
      });
    },
  );

  app.delete(
    '/software/categorias/:id',
    {
      config: { permissao: 'software.administrar' },
      schema: {
        summary: 'Remover uma categoria sem pacotes',
        params: ParametrosDaCategoria,
        response: { 204: z.null(), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      await naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const categoria = await lerCategoria(tx, requisicao.params.id);
        if (categoria.pacotes > 0) throw conflito(MENSAGENS_DAS_CATEGORIAS.comPacotes);
        try {
          await tx.delete(categoriasDeSoftware).where(eq(categoriasDeSoftware.id, categoria.id));
        } catch (erro) {
          // O pacote que entrou na categoria enquanto ela saía.
          if (violouChaveEstrangeira(erro, 'pacotes_de_software_categoria_fk')) {
            throw conflito(MENSAGENS_DAS_CATEGORIAS.comPacotes);
          }
          throw erro;
        }
        await registrarNaAuditoria(tx, {
          acao: 'categoria-de-software.removida',
          ator: autorDa(requisicao),
          alvo: { tipo: 'categoria-de-software', id: categoria.id },
          antes: { nome: categoria.nome, ordem: categoria.ordem },
          origem: origemDa(requisicao),
          momento,
        });
      });
      return resposta.code(204).send(null);
    },
  );
};
