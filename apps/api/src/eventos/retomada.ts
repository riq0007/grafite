// A retomada da conexão de eventos (spec eventos-em-tempo-real; design do F2c, decisão 11): os
// eventos a partir de 30 s antes do último que a tela recebeu, em ordem de id. O uuidv7 segue a
// ordem da inclusão, e não a do commit; a margem cobre a transação que terminou depois de outra
// mais nova. O último desconhecido, com mais de 24 h ou com perdidos demais pede `reiniciar`.
import { eventos, type Transacao } from '@grafite/db';
import type { EventoDeSaida, Permissao, TipoDeEvento } from '@grafite/domain';
import { and, asc, eq, gte, ne } from 'drizzle-orm';

const MARGEM = 30_000;
const VALIDADE = 24 * 60 * 60_000;
/** Acima disso, reler tudo custa menos que reenviar evento por evento. */
const PERDIDOS_NO_MAXIMO = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O menor uuidv7 de um momento: todo evento incluído a partir dele tem um id maior ou igual. */
export function inicioDoUuidv7(momento: Date): string {
  const tempo = Math.max(0, momento.getTime()).toString(16).padStart(12, '0');
  return `${tempo.slice(0, 8)}-${tempo.slice(8, 12)}-7000-8000-000000000000`;
}

/** O evento gravado como o distribuidor e a conexão o entendem. */
export function eventoDaLinha(linha: typeof eventos.$inferSelect): EventoDeSaida {
  return {
    id: linha.id,
    orgId: linha.orgId,
    momento: linha.momento.toISOString(),
    tipo: linha.tipo as TipoDeEvento,
    alvo: linha.alvoTipo ? { tipo: linha.alvoTipo, id: linha.alvoId } : null,
    publico: {
      ...(linha.todas ? { todas: true } : {}),
      ...(linha.permissao ? { permissao: linha.permissao as Permissao } : {}),
      ...(linha.locais ? { locais: linha.locais } : {}),
      ...(linha.contas ? { contas: linha.contas } : {}),
      ...(linha.sessoes ? { sessoes: linha.sessoes } : {}),
    },
  };
}

/**
 * Os eventos que a tela pode ter perdido depois do `ultimo`, sem ele, ou `null` quando ela precisa
 * reler tudo.
 */
export async function eventosPerdidos(
  tx: Transacao,
  ultimo: string,
  agora: Date,
): Promise<EventoDeSaida[] | null> {
  if (!UUID.test(ultimo)) return null;
  const [referencia] = await tx
    .select({ momento: eventos.momento })
    .from(eventos)
    .where(eq(eventos.id, ultimo));
  if (!referencia || agora.getTime() - referencia.momento.getTime() > VALIDADE) return null;
  const linhas = await tx
    .select()
    .from(eventos)
    .where(
      and(
        gte(eventos.id, inicioDoUuidv7(new Date(referencia.momento.getTime() - MARGEM))),
        ne(eventos.id, ultimo),
      ),
    )
    .orderBy(asc(eventos.id))
    .limit(PERDIDOS_NO_MAXIMO + 1);
  if (linhas.length > PERDIDOS_NO_MAXIMO) return null;
  return linhas.map(eventoDaLinha);
}
