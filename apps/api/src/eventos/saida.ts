// O evento de saída (spec eventos-em-tempo-real; design do F2c, decisão 9): gravado na transação da
// mudança, pelo `tx` da naOrganizacao, com o tipo, o alvo e quem pode recebê-lo. A auditoria grava o
// evento de cada ação que tem um (EVENTO_DA_ACAO); as mudanças sem auditoria, como as preferências de
// uma conta, o gravam por aqui. O banco avisa a API depois do commit (gatilho eventos_avisar).
import { eventos, type Transacao } from '@grafite/db';
import type { AlvoDoEvento, PublicoDoEvento, TipoDeEvento } from '@grafite/domain';
import { sql } from 'drizzle-orm';

export interface EventoParaGravar {
  tipo: TipoDeEvento;
  alvo: AlvoDoEvento | null;
  publico: PublicoDoEvento;
}

/** Grava o evento na transação dada: se a mudança for desfeita, o evento também é. */
export async function registrarEvento(tx: Transacao, { tipo, alvo, publico }: EventoParaGravar) {
  const { todas = false, permissao = null, locais, contas, sessoes } = publico;
  if (!todas && !permissao && !contas?.length && !sessoes?.length) {
    throw new Error(`O evento ${tipo} não tem público.`);
  }
  await tx.insert(eventos).values({
    orgId: sql`app.current_org()`,
    tipo,
    alvoTipo: alvo?.tipo ?? null,
    alvoId: alvo?.id ?? null,
    todas,
    permissao,
    // O registro sem local entra como null no meio da lista: só a organização inteira o alcança.
    locais: locais ? ([...locais] as string[]) : null,
    contas: contas?.length ? [...contas] : null,
    sessoes: sessoes?.length ? [...sessoes] : null,
  });
}
