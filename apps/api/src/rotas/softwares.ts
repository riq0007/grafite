// Os softwares do ativo (spec inventario-pelo-agente, "Softwares na ficha do ativo"; change
// inventario-pelo-agente-glpi): a lista do último inventário completo do agente, em ordem de nome,
// para quem vê o ativo no local dele.
import { type Banco, naOrganizacao, softwaresDosAtivos } from '@grafite/db';
import { asc, eq, max } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirEm } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { lerAtivo } from '../ativos/leitura.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const SoftwaresDoAtivo = z
  .object({
    softwares: z.array(
      z.object({
        nome: z.string(),
        versao: z.string().nullable(),
        editor: z.string().nullable(),
        instaladoEm: z.string().nullable(),
      }),
    ),
    /** Quando o agente mandou a lista; `null` sem nenhuma. */
    inventariadoEm: z.string().nullable(),
  })
  .meta({ id: 'SoftwaresDoAtivo' });

export const rotasDosSoftwares: FastifyPluginAsyncZod<{ banco: Banco }> = async (
  app,
  { banco },
) => {
  app.get(
    '/ativos/:id/softwares',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary: 'Os softwares instalados no ativo, do último inventário do agente',
        params: z.object({ id: z.uuid({ error: 'Ativo não encontrado.' }) }),
        response: { 200: SoftwaresDoAtivo, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linha = await lerAtivo(tx, requisicao.params.id);
        exigirEm(requisicao, 'ativos.ver', linha.ativo.localId, await lerArvore(tx));
        const softwares = await tx
          .select({
            nome: softwaresDosAtivos.nome,
            versao: softwaresDosAtivos.versao,
            editor: softwaresDosAtivos.editor,
            instaladoEm: softwaresDosAtivos.instaladoEm,
          })
          .from(softwaresDosAtivos)
          .where(eq(softwaresDosAtivos.ativoId, linha.ativo.id))
          .orderBy(asc(softwaresDosAtivos.nome));
        const [inventario] = await tx
          .select({ momento: max(softwaresDosAtivos.inventariadoEm) })
          .from(softwaresDosAtivos)
          .where(eq(softwaresDosAtivos.ativoId, linha.ativo.id));
        return { softwares, inventariadoEm: inventario?.momento?.toISOString() ?? null };
      }),
  );
};
