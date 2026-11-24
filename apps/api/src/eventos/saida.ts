// O evento de saída (spec eventos-em-tempo-real; design do F2c, decisão 9): gravado na transação da
// mudança, pelo `tx` da naOrganizacao, com o tipo, o alvo e quem pode recebê-lo. A auditoria grava o
// evento de cada ação que tem um (EVENTO_DA_ACAO); as mudanças sem auditoria, como as preferências de
// uma conta, o gravam por aqui. O banco avisa a API depois do commit (gatilho eventos_avisar). As
// contas e as sessões vão em linhas de até 20, o teto do CHECK (change chat-com-chamados, design,
// decisão 4): o notificar de um canal com centenas de contas não é recusado.
import { eventos, type Transacao } from '@grafite/db';
import type { AlvoDoEvento, PublicoDoEvento, TipoDeEvento } from '@grafite/domain';
import { sql } from 'drizzle-orm';

export interface EventoParaGravar {
  tipo: TipoDeEvento;
  alvo: AlvoDoEvento | null;
  publico: PublicoDoEvento;
}

/** As contas ou as sessões numa linha, no máximo: o `eventos_publico_curto`. */
export const POR_LINHA = 20;

/** A lista em partes de até `POR_LINHA`, na ordem dela. */
function emPartes(lista: readonly string[] | undefined): string[][] {
  const partes: string[][] = [];
  for (let inicio = 0; inicio < (lista?.length ?? 0); inicio += POR_LINHA) {
    partes.push((lista ?? []).slice(inicio, inicio + POR_LINHA));
  }
  return partes;
}

/**
 * Grava o evento na transação dada: se a mudança for desfeita, o evento também é. Com mais de 20
 * contas, sessões, sessões da aba ou aparelhos, ele vai em várias linhas: a primeira leva o resto do público, e as seguintes,
 * só essas listas, no que sobra.
 */
export async function registrarEvento(tx: Transacao, { tipo, alvo, publico }: EventoParaGravar) {
  const { todas = false, permissao = null, locais, grupos, permissoes, contas, sessoes } = publico;
  const { sessoesDaAba, aparelhos, abas = false } = publico;
  if (
    !todas &&
    !abas &&
    !permissao &&
    !permissoes?.length &&
    !contas?.length &&
    !sessoes?.length &&
    !sessoesDaAba?.length &&
    !aparelhos?.length
  ) {
    throw new Error(`O evento ${tipo} não tem público.`);
  }
  const partesDasContas = emPartes(contas);
  const partesDasSessoes = emPartes(sessoes);
  const partesDasSessoesDaAba = emPartes(sessoesDaAba);
  const partesDosAparelhos = emPartes(aparelhos);
  const linhas = Math.max(
    1,
    partesDasContas.length,
    partesDasSessoes.length,
    partesDasSessoesDaAba.length,
    partesDosAparelhos.length,
  );
  await tx.insert(eventos).values(
    Array.from({ length: linhas }, (_, linha) => {
      const primeira = linha === 0;
      return {
        orgId: sql`app.current_org()`,
        tipo,
        alvoTipo: alvo?.tipo ?? null,
        alvoId: alvo?.id ?? null,
        todas: primeira && todas,
        permissao: primeira ? permissao : null,
        // O registro sem local entra como null no meio da lista: só a organização inteira o alcança.
        locais: primeira && locais ? ([...locais] as string[]) : null,
        // A lista vazia fica vazia, e não nula: com ela, ninguém recebe pela permissão.
        grupos: primeira && grupos ? [...grupos] : null,
        permissoes: primeira && permissoes?.length ? [...permissoes] : null,
        contas: partesDasContas[linha] ?? null,
        sessoes: partesDasSessoes[linha] ?? null,
        sessoesDaAba: partesDasSessoesDaAba[linha] ?? null,
        aparelhosDaAba: partesDosAparelhos[linha] ?? null,
        abas: primeira && abas,
      };
    }),
  );
}
