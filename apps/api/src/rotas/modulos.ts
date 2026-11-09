// Ligar e desligar os módulos opcionais (spec modulos-da-organizacao; design do P1b, decisão 12):
// quem define os padrões da organização vê os opcionais e liga ou desliga cada um, com a auditoria
// e o evento modulos.mudaram, que leva as sessões abertas a validar o estado de novo.
import { type Banco, naOrganizacao, organizacoes } from '@grafite/db';
import { MODULOS_OPCIONAIS, moduloOpcional } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const ModulosDaOrganizacao = z
  .object({
    modulos: z.array(
      z.object({ id: z.string(), nome: z.string(), descricao: z.string(), ligado: z.boolean() }),
    ),
  })
  .meta({ id: 'ModulosDaOrganizacao' });

const listar = (desligados: readonly string[]) => ({
  modulos: MODULOS_OPCIONAIS.map((modulo) => ({
    ...modulo,
    ligado: !desligados.includes(modulo.id),
  })),
});

export const rotasDosModulos: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  app.get(
    '/organizacao/modulos',
    {
      config: { permissao: 'organizacao.editar' },
      schema: {
        summary: 'Os módulos opcionais da organização, ligados ou desligados',
        response: { 200: ModulosDaOrganizacao, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [organizacao] = await tx
          .select({ desligados: organizacoes.modulosDesligados })
          .from(organizacoes);
        return listar(organizacao?.desligados ?? []);
      }),
  );

  app.put(
    '/organizacao/modulos/:id',
    {
      config: { permissao: 'organizacao.editar' },
      schema: {
        summary: 'Ligar ou desligar um módulo opcional',
        params: z.object({ id: z.string().max(64) }),
        body: z.object({ ligado: z.boolean({ error: 'Diga se o módulo fica ligado.' }) }),
        response: { 200: ModulosDaOrganizacao, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { id } = requisicao.params;
      if (!moduloOpcional(id)) throw naoEncontrado('Módulo não encontrado.');
      const sessao = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const momento = agora();
      return naOrganizacao(banco, orgId, async (tx) => {
        const [organizacao] = await tx
          .select({ desligados: organizacoes.modulosDesligados })
          .from(organizacoes)
          .where(eq(organizacoes.id, orgId))
          .for('update');
        const antes = organizacao?.desligados ?? [];
        const { ligado } = requisicao.body;
        if (ligado === !antes.includes(id)) return listar(antes);
        const depois = ligado ? antes.filter((modulo) => modulo !== id) : [...antes, id];
        await tx
          .update(organizacoes)
          .set({ modulosDesligados: depois })
          .where(eq(organizacoes.id, orgId));
        await registrarNaAuditoria(tx, {
          acao: ligado ? 'modulo.ligado' : 'modulo.desligado',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'modulo' },
          dados: { modulo: MODULOS_OPCIONAIS.find((modulo) => modulo.id === id)?.nome ?? id },
          origem: origemDa(requisicao),
          momento,
        });
        return listar(depois);
      });
    },
  );
};
