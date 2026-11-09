// O acesso e a situação dos segredos (spec cofre-de-segredos, "Acesso ao segredo" e "Segredo", e
// modulo-cofre, "Acesso na ficha"; design do P6, decisões 3 e 7): quem administra o cofre troca a
// lista inteira de titulares de um segredo, com o antes e o depois na auditoria, escolhe entre as
// contas, os grupos, os perfis e as pessoas ativos, sem pedir a permissão de ver os acessos, e
// inativa e reativa o segredo. Tirar um titular vale na requisição seguinte.
import {
  acessosAosSegredos,
  type Banco,
  contas,
  grupos,
  naOrganizacao,
  perfis,
  pessoas,
  segredos,
} from '@grafite/db';
import { type AcessoAoSegredo, TIPOS_DE_TITULAR } from '@grafite/domain';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { ativosDosSegredos, lerSegredoVisto, visaoDoSegredo } from '../cofre/segredos.ts';
import { acessoDoSegredo, conferirTitulares } from '../cofre/titulares.ts';
import {
  comoFicha,
  FichaDoSegredo,
  ParametrosDoSegredo,
  PROBLEMAS_DO_COFRE,
  quemPede,
} from './cofre.ts';
import { origemDa } from './sessao.ts';

const PedidoDeAcesso = z
  .object({
    /** A lista inteira de quem acessa o segredo: as contas, os grupos e os perfis. */
    titulares: z
      .array(
        z.object({
          tipo: z.enum(TIPOS_DE_TITULAR, { error: 'Titular não encontrado.' }),
          id: z.uuid({ error: 'Titular não encontrado.' }),
        }),
      )
      .max(200, { error: 'Libere o segredo a até 200 titulares.' }),
  })
  .meta({ id: 'PedidoDeAcesso' });

const TitularesDoCofre = z
  .object({
    contas: z.array(z.object({ id: z.uuid(), nome: z.string(), usuario: z.string() })),
    grupos: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    perfis: z.array(z.object({ id: z.uuid(), nome: z.string() })),
  })
  .meta({ id: 'TitularesDoCofre' });

const PessoasDoCofre = z
  .object({ pessoas: z.array(z.object({ id: z.uuid(), nome: z.string() })) })
  .meta({ id: 'PessoasDoCofre' });

const chaveDoTitular = ({ tipo, id }: AcessoAoSegredo) => `${tipo}:${id}`;

const peloNome = <T extends { nome: string }>(lista: T[]) =>
  lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

const colunaDoTitular = {
  conta: acessosAosSegredos.contaId,
  grupo: acessosAosSegredos.grupoId,
  perfil: acessosAosSegredos.perfilId,
} as const;

export const rotasDoAcessoAoCofre: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.put(
    '/cofre/segredos/:id/acesso',
    {
      config: { permissao: 'cofre.administrar' },
      schema: {
        summary: 'Trocar a lista de contas, grupos e perfis que acessam um segredo',
        params: ParametrosDoSegredo,
        body: PedidoDeAcesso,
        response: { 200: FichaDoSegredo, ...PROBLEMAS_DO_COFRE },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const pedidos = [
        ...new Map(requisicao.body.titulares.map((t) => [chaveDoTitular(t), t])).values(),
      ];
      const momento = agora();
      return naOrganizacao(banco, orgId, async (tx) => {
        const visto = await lerSegredoVisto(tx, requisicao.params.id, quemPede(sessao), {
          travar: true,
        });
        const segredoId = visto.linha.id;
        const antes = visto.acesso;
        await conferirTitulares(tx, pedidos, antes);
        const pedidosPorChave = new Set(pedidos.map(chaveDoTitular));
        const antesPorChave = new Set(antes.map(chaveDoTitular));
        const saem = antes.filter((titular) => !pedidosPorChave.has(chaveDoTitular(titular)));
        const entram = pedidos.filter((titular) => !antesPorChave.has(chaveDoTitular(titular)));
        if (saem.length === 0 && entram.length === 0) return comoFicha(tx, visto);
        for (const { tipo, id } of saem) {
          await tx
            .delete(acessosAosSegredos)
            .where(and(eq(acessosAosSegredos.segredoId, segredoId), eq(colunaDoTitular[tipo], id)));
        }
        for (const { tipo, id } of entram) {
          await tx.insert(acessosAosSegredos).values({
            orgId,
            segredoId,
            contaId: tipo === 'conta' ? id : null,
            grupoId: tipo === 'grupo' ? id : null,
            perfilId: tipo === 'perfil' ? id : null,
            concedidoPor: sessao.contaId,
            concedidoEm: momento,
          });
        }
        await registrarNaAuditoria(tx, {
          acao: 'acesso-do-segredo.alterado',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'segredo', id: segredoId },
          antes: { acesso: antes },
          depois: { acesso: await acessoDoSegredo(tx, segredoId) },
          origem: origemDa(requisicao),
          momento,
        });
        return comoFicha(tx, await lerSegredoVisto(tx, segredoId, quemPede(sessao)));
      });
    },
  );

  app.get(
    '/cofre/titulares',
    {
      config: { permissao: 'cofre.administrar' },
      schema: {
        summary: 'As contas, os grupos e os perfis ativos, pelo nome, para o acesso dos segredos',
        response: { 200: TitularesDoCofre, ...PROBLEMAS_DO_COFRE },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const dasContas = await tx
          .select({ id: contas.id, nome: pessoas.nome, usuario: contas.usuario })
          .from(contas)
          .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
          .where(
            and(
              eq(contas.situacao, 'ativa'),
              eq(pessoas.situacao, 'ativa'),
              isNotNull(contas.usuario),
            ),
          );
        const dosGrupos = await tx
          .select({ id: grupos.id, nome: grupos.nome })
          .from(grupos)
          .where(eq(grupos.situacao, 'ativo'));
        const dosPerfis = await tx
          .select({ id: perfis.id, nome: perfis.nome })
          .from(perfis)
          .where(eq(perfis.situacao, 'ativo'));
        return {
          contas: peloNome(dasContas.map((conta) => ({ ...conta, usuario: conta.usuario ?? '' }))),
          grupos: peloNome(dosGrupos),
          perfis: peloNome(dosPerfis),
        };
      }),
  );

  app.get(
    '/cofre/pessoas',
    {
      config: { permissao: 'cofre.administrar' },
      schema: {
        summary: 'As pessoas ativas, só pelo nome, para o vínculo dos segredos',
        response: { 200: PessoasDoCofre, ...PROBLEMAS_DO_COFRE },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => ({
        pessoas: peloNome(
          await tx
            .select({ id: pessoas.id, nome: pessoas.nome })
            .from(pessoas)
            .where(eq(pessoas.situacao, 'ativa')),
        ),
      })),
  );

  for (const [caminho, situacao, acao] of [
    ['inativacao', 'inativo', 'segredo.inativado'],
    ['reativacao', 'ativo', 'segredo.reativado'],
  ] as const) {
    app.post(
      `/cofre/segredos/:id/${caminho}`,
      {
        config: { permissao: 'cofre.administrar' },
        schema: {
          summary:
            situacao === 'inativo'
              ? 'Inativar um segredo: ele sai da lista de quem o usa e não é mais revelado'
              : 'Reativar um segredo',
          params: ParametrosDoSegredo,
          response: { 200: FichaDoSegredo, ...PROBLEMAS_DO_COFRE },
        },
      },
      async (requisicao) => {
        const sessao = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const visto = await lerSegredoVisto(tx, requisicao.params.id, quemPede(sessao), {
            travar: true,
          });
          const antes = visto.linha;
          if (antes.situacao === situacao) return comoFicha(tx, visto);
          const ativoIds =
            (await ativosDosSegredos(tx, [antes.id])).get(antes.id)?.map((ativo) => ativo.id) ?? [];
          const [depois] = await tx
            .update(segredos)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(segredos.id, antes.id))
            .returning();
          if (!depois) throw new Error('O segredo não foi alterado.');
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId: sessao.contaId },
            alvo: { tipo: 'segredo', id: antes.id },
            antes: visaoDoSegredo(antes, ativoIds),
            depois: visaoDoSegredo(depois, ativoIds),
            origem: origemDa(requisicao),
            momento,
          });
          return comoFicha(tx, await lerSegredoVisto(tx, antes.id, quemPede(sessao)));
        });
      },
    );
  }
};
