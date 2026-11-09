// O login de cada controle escolhido na ficha dele (spec saude-do-control-id, "Login escolhido na
// ficha do controle"; change login-de-cada-controle, design, decisão 3): quem administra o cofre lê
// os logins que servem, pelo nome, e escolhe o do controle. A escolha liga o segredo ao controle e
// desliga dele os outros segredos de login, com a auditoria de cada segredo que mudou, como a edição
// pela ficha do segredo. O escopo do cofre já exige o módulo ligado e os dois passos ativos.

import type { Transacao } from '@grafite/db';
import { type Banco, naOrganizacao, segredos, segredosDosAtivos, tiposDeAtivo } from '@grafite/db';
import { TIPOS_DO_LOGIN_DO_CONTROL_ID } from '@grafite/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { lerAtivo } from '../ativos/leitura.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import type { ConfiguracaoDasCapacidades } from '../catalogo/esquemas.ts';
import { visaoDoSegredo } from '../cofre/segredos.ts';
import { LOGIN_INVALIDO, serveDeLogin } from '../coleta/control-id.ts';
import { conflito, dadosInvalidos } from '../problemas.ts';
import { PROBLEMAS_DO_COFRE } from './cofre.ts';
import { origemDa } from './sessao.ts';

const ParametrosDoControle = z.object({ id: z.uuid({ error: 'Ativo não encontrado.' }) });

export const EscolhaDoLogin = z
  .object({
    /** Os logins que servem, pelo id e pelo nome, sem o usuário nem a senha. */
    logins: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    /** O login próprio do controle, quando ele tem um só que serve. */
    proprio: z.uuid().nullable(),
    /** Se o tipo do controle tem um login escolhido. */
    tipoTemLogin: z.boolean(),
  })
  .meta({ id: 'EscolhaDoLogin' });

const PedidoDoLogin = z
  .object({
    /** O login do controle, ou nulo para voltar ao do tipo. */
    segredoId: z.uuid({ error: LOGIN_INVALIDO }).nullable(),
  })
  .meta({ id: 'PedidoDoLogin' });

type Configuracao = z.infer<typeof ConfiguracaoDasCapacidades>;

export interface DependenciasDoLoginDoControle {
  banco: Banco;
  agora: () => Date;
}

/** O controle da escolha: ao alcance da conta, de um tipo com a saúde do Control iD. */
async function lerControle(
  tx: Transacao,
  requisicao: FastifyRequest,
  ativoId: string,
  { travar = false } = {},
) {
  const arvore = await lerArvore(tx);
  const { ativo } = await lerAtivo(tx, ativoId, { travar });
  exigirEm(requisicao, 'ativos.ver', ativo.localId, arvore);
  const [tipo] = await tx
    .select({
      capacidades: tiposDeAtivo.capacidades,
      configuracao: tiposDeAtivo.configuracaoDasCapacidades,
    })
    .from(tiposDeAtivo)
    .where(eq(tiposDeAtivo.id, ativo.tipoId));
  if (!tipo?.capacidades.includes('controlid.saude')) {
    throw conflito('O tipo deste ativo não sonda o Control iD.');
  }
  const doControle = (tipo.configuracao as Configuracao)['controlid.saude'];
  return { ativo, tipoTemLogin: Boolean(doControle?.segredoId) };
}

/** Os logins que servem e o próprio do controle, quando ele tem um só. */
async function escolhaDo(tx: Transacao, ativoId: string, tipoTemLogin: boolean) {
  const logins = await tx
    .select({ id: segredos.id, nome: segredos.nome })
    .from(segredos)
    .where(serveDeLogin)
    .orderBy(asc(segredos.nomeNormalizado));
  const ligados = await tx
    .select({ id: segredos.id })
    .from(segredosDosAtivos)
    .innerJoin(
      segredos,
      and(
        eq(segredos.orgId, segredosDosAtivos.orgId),
        eq(segredos.id, segredosDosAtivos.segredoId),
      ),
    )
    .where(and(eq(segredosDosAtivos.ativoId, ativoId), serveDeLogin));
  const [proprio] = ligados;
  return { logins, proprio: ligados.length === 1 && proprio ? proprio.id : null, tipoTemLogin };
}

/** Os ativos ligados a cada segredo dado, pelo id. */
async function ativosLigados(tx: Transacao, segredoIds: readonly string[]) {
  const porSegredo = new Map<string, string[]>(segredoIds.map((id) => [id, []]));
  if (segredoIds.length === 0) return porSegredo;
  const linhas = await tx
    .select({ segredoId: segredosDosAtivos.segredoId, ativoId: segredosDosAtivos.ativoId })
    .from(segredosDosAtivos)
    .where(inArray(segredosDosAtivos.segredoId, [...segredoIds]));
  for (const { segredoId, ativoId } of linhas) porSegredo.get(segredoId)?.push(ativoId);
  return porSegredo;
}

export const rotasDoLoginDoControle: FastifyPluginAsyncZod<DependenciasDoLoginDoControle> = async (
  app,
  { banco, agora },
) => {
  app.get(
    '/cofre/controles/:id/login',
    {
      config: { permissao: 'cofre.administrar' },
      schema: {
        summary: 'Os logins que servem a um controle de acesso e o login próprio dele',
        params: ParametrosDoControle,
        response: { 200: EscolhaDoLogin, ...PROBLEMAS_DO_COFRE },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const { ativo, tipoTemLogin } = await lerControle(tx, requisicao, requisicao.params.id);
        return escolhaDo(tx, ativo.id, tipoTemLogin);
      }),
  );

  app.put(
    '/cofre/controles/:id/login',
    {
      config: { permissao: 'cofre.administrar' },
      schema: {
        summary: 'Escolher o login de um controle de acesso, ou voltar ao do tipo',
        params: ParametrosDoControle,
        body: PedidoDoLogin,
        response: { 200: EscolhaDoLogin, ...PROBLEMAS_DO_COFRE },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const { segredoId } = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, orgId, async (tx) => {
        const { ativo, tipoTemLogin } = await lerControle(tx, requisicao, requisicao.params.id, {
          travar: true,
        });
        if (ativo.situacao === 'inativo') throw conflito('O ativo está inativo.');
        if (segredoId !== null) {
          const [escolhido] = await tx
            .select({ id: segredos.id })
            .from(segredos)
            .where(and(eq(segredos.id, segredoId), serveDeLogin));
          if (!escolhido) throw dadosInvalidos({ segredoId: LOGIN_INVALIDO });
        }
        // Os segredos de login ligados ao controle, de qualquer situação: só o escolhido fica.
        const ligados = await tx
          .select({ id: segredos.id })
          .from(segredosDosAtivos)
          .innerJoin(
            segredos,
            and(
              eq(segredos.orgId, segredosDosAtivos.orgId),
              eq(segredos.id, segredosDosAtivos.segredoId),
            ),
          )
          .where(
            and(
              eq(segredosDosAtivos.ativoId, ativo.id),
              inArray(segredos.tipo, [...TIPOS_DO_LOGIN_DO_CONTROL_ID]),
            ),
          );
        const saem = ligados.map(({ id }) => id).filter((id) => id !== segredoId);
        const entra =
          segredoId !== null && !ligados.some(({ id }) => id === segredoId) ? segredoId : null;
        const mudados = [...saem, ...(entra ? [entra] : [])];
        const antes = await ativosLigados(tx, mudados);
        const linhas =
          mudados.length === 0
            ? []
            : await tx.select().from(segredos).where(inArray(segredos.id, mudados));
        for (const linha of linhas) {
          const ativosAntes = antes.get(linha.id) ?? [];
          const ativosDepois =
            linha.id === entra
              ? [...ativosAntes, ativo.id]
              : ativosAntes.filter((ativoId) => ativoId !== ativo.id);
          if (linha.id === entra) {
            await tx
              .insert(segredosDosAtivos)
              .values({ orgId, segredoId: linha.id, ativoId: ativo.id });
          } else {
            await tx
              .delete(segredosDosAtivos)
              .where(
                and(
                  eq(segredosDosAtivos.segredoId, linha.id),
                  eq(segredosDosAtivos.ativoId, ativo.id),
                ),
              );
          }
          await tx.update(segredos).set({ atualizadoEm: momento }).where(eq(segredos.id, linha.id));
          await registrarNaAuditoria(tx, {
            acao: 'segredo.alterado',
            ator: { tipo: 'conta', contaId: sessao.contaId },
            alvo: { tipo: 'segredo', id: linha.id },
            antes: visaoDoSegredo(linha, ativosAntes),
            depois: visaoDoSegredo(linha, ativosDepois),
            origem: origemDa(requisicao),
            momento,
          });
        }
        return escolhaDo(tx, ativo.id, tipoTemLogin);
      });
    },
  );
};
