// A saúde da API (spec plataforma-base; design do F2c, decisão 17): o banco, a fila de tarefas e o
// aviso de eventos do banco. O banco fora dá 503; a fila ou os eventos fora dão 200 com
// `degradado`, porque a API continua atendendo. Nunca devolve detalhe interno do erro.
import { AMBIENTES, type Ambiente } from '@grafite/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const Estado = z.enum(['ok', 'indisponivel']);

const RespostaDeSaude = z
  .object({
    status: z.enum(['ok', 'degradado', 'indisponivel']),
    versao: z.string(),
    /** O ambiente da configuração: desenvolvimento, teste ou producao. */
    ambiente: z.enum(AMBIENTES),
    banco: Estado,
    /** A fila de tarefas está rodando. */
    fila: Estado,
    /** A ligação com o aviso de eventos do banco está ativa. */
    eventos: Estado,
  })
  .meta({ id: 'RespostaDeSaude' });

export interface OpcoesDeSaude {
  ambiente: Ambiente;
  versao: string;
  verificarBanco: () => Promise<void>;
  filaRodando: () => boolean;
  eventosLigados: () => boolean;
}

const estado = (vale: boolean) => (vale ? 'ok' : 'indisponivel');

export const rotasDeSaude: FastifyPluginAsyncZod<OpcoesDeSaude> = async (
  app,
  { ambiente, versao, verificarBanco, filaRodando, eventosLigados },
) => {
  app.get(
    '/health',
    {
      schema: {
        summary: 'Estado da API, do banco, da fila e dos eventos',
        response: { 200: RespostaDeSaude, 503: RespostaDeSaude },
      },
    },
    async (requisicao, resposta) => {
      const fila = estado(filaRodando());
      const eventos = estado(eventosLigados());
      try {
        await verificarBanco();
      } catch (erro) {
        requisicao.log.warn({ err: erro }, 'banco indisponível na verificação de saúde');
        return resposta
          .code(503)
          .send({ status: 'indisponivel', versao, ambiente, banco: 'indisponivel', fila, eventos });
      }
      const status = fila === 'ok' && eventos === 'ok' ? 'ok' : 'degradado';
      return { status, versao, ambiente, banco: 'ok', fila, eventos } as const;
    },
  );
};
