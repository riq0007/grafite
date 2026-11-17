// Os módulos opcionais desligados (spec modulos-da-organizacao; design do P1b, decisão 12): as rotas
// de um módulo ficam num escopo próprio, e a guarda dele recusa a requisição quando a organização o
// desligou. A guarda lê a organização a cada requisição, sem cache: ligar e desligar valem na hora.
import { type Banco, naOrganizacao, organizacoes, type Transacao } from '@grafite/db';
import { type IdDoModuloOpcional, MODULOS_OPCIONAIS } from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ProblemaDaApi } from '../problemas.ts';

/** O módulo desligado na organização (403 `modulo-desligado`). */
export function moduloDesligado(id: IdDoModuloOpcional) {
  const nome = MODULOS_OPCIONAIS.find((modulo) => modulo.id === id)?.nome ?? id;
  return new ProblemaDaApi({
    codigo: 'modulo-desligado',
    status: 403,
    titulo: 'Módulo desligado',
    detalhe: `O módulo ${nome} está desligado nesta organização.`,
  });
}

/** Os módulos opcionais que a organização desligou. */
export async function modulosDesligados(banco: Banco, orgId: string): Promise<string[]> {
  return naOrganizacao(banco, orgId, async (tx) => {
    const [organizacao] = await tx
      .select({ desligados: organizacoes.modulosDesligados })
      .from(organizacoes)
      .where(eq(organizacoes.id, orgId));
    return organizacao?.desligados ?? [];
  });
}

/**
 * Recusa, na transação, a ação de um módulo que mora no escopo de outro, como o "Virar OS" e o
 * "Pedir toner" dos Chamados, que são do Operação: a guarda do escopo não vê o módulo da ação.
 */
export async function exigirLigadoNaTransacao(tx: Transacao, id: IdDoModuloOpcional) {
  const [organizacao] = await tx
    .select({ desligados: organizacoes.modulosDesligados })
    .from(organizacoes)
    .where(eq(organizacoes.id, sql`app.current_org()`));
  if (organizacao?.desligados.includes(id)) throw moduloDesligado(id);
}

/**
 * Recusa as rotas do escopo quando a organização desligou o módulo. Sem sessão, a guarda da rota
 * responde antes, com o 401.
 */
export function exigirModuloLigado(
  escopo: FastifyInstance,
  { banco, modulo }: { banco: Banco; modulo: IdDoModuloOpcional },
) {
  escopo.addHook('preValidation', async (requisicao) => {
    const orgId = requisicao.organizacao?.id;
    if (!orgId || !requisicao.sessao) return;
    if ((await modulosDesligados(banco, orgId)).includes(modulo)) throw moduloDesligado(modulo);
  });
}
