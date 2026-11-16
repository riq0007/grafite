// O chamado que a conta vê, pela API (spec chamados, "Quem vê e quem atende os chamados"; change
// chamados-da-ti, design, decisão 5): quem tem `chamados.ver` num dos locais do chamado o vê, e o da
// organização inteira pede a permissão na organização inteira. O que a conta não vê responde como o
// que não existe, em toda rota que chega a um chamado pelo número.
import { chamados, type Transacao } from '@grafite/db';
import { alcance, type LocaisDoChamado, veOChamado } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { naoEncontrado } from '../problemas.ts';
import { publicoDosLocais } from '../solicitacoes/registro.ts';

const NAO_ENCONTRADO = 'Chamado não encontrado.';

export const chamadoNaoEncontrado = () => naoEncontrado(NAO_ENCONTRADO);

/**
 * O número do chamado no endereço. O que não é o número de um chamado, como o que passa do inteiro
 * do banco, é recusado como o chamado que não existe.
 */
export const NumeroDoChamado = z.coerce
  .number({ error: NAO_ENCONTRADO })
  .int({ error: NAO_ENCONTRADO })
  .min(1, { error: NAO_ENCONTRADO })
  .max(2_147_483_647, { error: NAO_ENCONTRADO });

/** O chamado pelo número, se a conta o vê; senão, a recusa do chamado que não existe. */
export async function chamadoQueAContaVe(
  tx: Transacao,
  requisicao: FastifyRequest,
  numero: number,
): Promise<{ id: string; locais: string[]; semLocal: boolean }> {
  const [chamado] = await tx
    .select({ id: chamados.id, locais: chamados.locais, semLocal: chamados.semLocal })
    .from(chamados)
    .where(eq(chamados.numero, numero));
  if (!chamado) throw chamadoNaoEncontrado();
  const ve = alcance(sessaoDa(requisicao).acesso, 'chamados.ver', await lerArvore(tx));
  if (!veOChamado(ve, chamado)) throw chamadoNaoEncontrado();
  return chamado;
}

/**
 * O público dos eventos do chamado (design, decisão 5): quem o vê nos locais dele, os de antes e os
 * de depois de uma mudança, e, no da organização inteira, quem o vê na organização.
 */
export const publicoDoChamado = (...todos: LocaisDoChamado[]) => ({
  permissao: 'chamados.ver' as const,
  locais: publicoDosLocais(...todos),
});
