// A quem pedir acesso (spec permissoes): os nomes de até 3 pessoas que administram os acessos da
// organização inteira, para a tela que a conta não pode ver dizer com quem falar.
import { type Banco, naOrganizacao } from '@grafite/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { nomesDosAdministradores } from '../acesso/administradores.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const AdministradoresDoAcesso = z
  .object({
    /** Em ordem alfabética, até 3. */
    administradores: z.array(z.string()),
  })
  .meta({ id: 'AdministradoresDoAcesso' });

export const rotasDoAcesso: FastifyPluginAsyncZod<{ banco: Banco }> = async (app, { banco }) => {
  app.get(
    '/acesso/administradores',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Quem administra os acessos da organização',
        response: {
          200: AdministradoresDoAcesso,
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) => ({
      administradores: await naOrganizacao(
        banco,
        requisicao.organizacao?.id ?? '',
        nomesDosAdministradores,
      ),
    }),
  );
};
