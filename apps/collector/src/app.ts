import Fastify, { type FastifyServerOptions } from 'fastify';
import { type EstadoDoColetor, saudeDoColetor } from './saude.ts';

/** Servidor local do coletor: a saúde, com o estado da coleta. */
export function criarApp({
  versao,
  logger = false,
  estado,
  agora = () => new Date(),
}: {
  versao: string;
  logger?: FastifyServerOptions['logger'];
  estado: () => EstadoDoColetor;
  agora?: () => Date;
}) {
  const app = Fastify({ logger });
  app.get('/health', async () => saudeDoColetor({ versao, estado: estado(), agora: agora() }));
  return app;
}
