// O cadastro dos agentes do GLPI pela API (spec inventario-pelo-agente): o tipo e o local dos
// computadores que o agente cadastra e, na change software-por-pacote, o prazo do sem contato, de
// 1 a 30 dias, que a edição sem o campo mantém (design, decisão 9).
import { type Banco, cadastroDosAgentes, locais, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { MENSAGEM_DO_PRAZO_DO_SEM_CONTATO, prazoDoSemContatoValido } from '@grafite/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerCadastroDosAgentes } from '../agentes/cadastro.ts';
import { lerArvore, lerLocais } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { dadosInvalidos, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const Cadastro = z.object({ tipoId: z.uuid().nullable(), localId: z.uuid().nullable() });
const PROBLEMAS = { 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

export const rotasDoCadastroDosAgentes: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/agentes/cadastro',
    {
      config: { permissao: 'coletores.administrar' },
      schema: {
        summary: 'Configuração do cadastro automático pelo GLPI Agent',
        response: {
          200: Cadastro.extend({
            /** O prazo do sem contato, em dias. */
            diasSemContato: z.number(),
            tipos: z.array(z.object({ id: z.uuid(), nome: z.string() })),
            locais: z.array(z.object({ id: z.uuid(), nome: z.string() })),
          }).meta({ id: 'CadastroDosAgentes' }),
          ...PROBLEMAS,
        },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const tipos = await tx
          .select({ id: tiposDeAtivo.id, nome: tiposDeAtivo.nome })
          .from(tiposDeAtivo)
          .where(
            and(
              eq(tiposDeAtivo.situacao, 'ativo'),
              sql`${tiposDeAtivo.capacidades} @> ARRAY['hardware.inventario']::text[]`,
            ),
          )
          .orderBy(asc(tiposDeAtivo.nome));
        const arvore = await lerArvore(tx);
        const opcoesDeLocal = (await lerLocais(tx))
          .filter((l) => l.situacao === 'ativo')
          .map((l) => ({ id: l.id, nome: arvore.caminho(l.id) }));
        return { ...(await lerCadastroDosAgentes(tx)), tipos, locais: opcoesDeLocal };
      }),
  );

  app.put(
    '/agentes/cadastro',
    {
      config: { permissao: 'coletores.administrar' },
      schema: {
        summary:
          'Escolher tipo e local dos computadores cadastrados pelo agente, e o prazo do sem contato',
        body: Cadastro.extend({
          /** De 1 a 30 dias; sem o campo, fica o de antes. */
          diasSemContato: z.number().optional(),
        }),
        response: { 204: z.null(), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const { tipoId, diasSemContato } = requisicao.body;
      if (diasSemContato !== undefined && !prazoDoSemContatoValido(diasSemContato)) {
        throw dadosInvalidos({ diasSemContato: MENSAGEM_DO_PRAZO_DO_SEM_CONTATO });
      }
      const localId = tipoId ? requisicao.body.localId : null;
      const orgId = requisicao.organizacao?.id ?? '';
      await naOrganizacao(banco, orgId, async (tx) => {
        if (tipoId) {
          const [tipo] = await tx
            .select()
            .from(tiposDeAtivo)
            .where(eq(tiposDeAtivo.id, tipoId))
            .for('share');
          if (tipo?.situacao !== 'ativo' || !tipo.capacidades.includes('hardware.inventario'))
            throw dadosInvalidos({ tipoId: 'Escolha um tipo ativo com Inventário de hardware.' });
        }
        if (localId) {
          const [local] = await tx.select().from(locais).where(eq(locais.id, localId)).for('share');
          if (local?.situacao !== 'ativo')
            throw dadosInvalidos({ localId: 'Escolha um local ativo desta organização.' });
        }
        const antes = await lerCadastroDosAgentes(tx);
        const dias = diasSemContato ?? antes.diasSemContato;
        if (antes.tipoId === tipoId && antes.localId === localId && antes.diasSemContato === dias)
          return;
        await tx
          .insert(cadastroDosAgentes)
          .values({ orgId, tipoId, localId, diasSemContato: dias })
          .onConflictDoUpdate({
            target: cadastroDosAgentes.orgId,
            set: { tipoId, localId, diasSemContato: dias },
          });
        await registrarNaAuditoria(tx, {
          acao: 'agentes.cadastro-configurado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'cadastro-dos-agentes', id: null },
          antes,
          depois: { tipoId, localId, diasSemContato: dias },
          origem: origemDa(requisicao),
          momento: agora(),
        });
      });
      return resposta.code(204).send(null);
    },
  );
};
