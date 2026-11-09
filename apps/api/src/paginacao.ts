// As listas paginadas por cursor (spec plataforma-base; design do F2b, decisão 12): a página tem de
// 1 a 100 itens, com 50 como padrão, e o cursor é opaco, o base64url de um JSON com a chave da ordem
// do último item. Um registro novo no topo não faz a página seguinte pular nem repetir nada.
import { z } from 'zod';
import { dadosInvalidos } from './problemas.ts';

const NAO_INTEIRO = 'Informe um número inteiro de itens por página.';

/** O tamanho da página, de 1 a 100 (padrão 50). */
export const Limite = z.coerce
  .number({ error: NAO_INTEIRO })
  .int({ error: NAO_INTEIRO })
  .min(1, { error: 'Use pelo menos 1 item por página.' })
  .max(100, { error: 'Use até 100 itens por página.' })
  .default(50);

export const Cursor = z.string().max(1024, { error: 'A lista mudou. Recarregue a lista.' });

export function codificarCursor(chave: readonly unknown[]): string {
  return Buffer.from(JSON.stringify(chave)).toString('base64url');
}

const cursorIlegivel = () => dadosInvalidos({ cursor: 'A lista mudou. Recarregue a lista.' });

/** A chave do cursor, conferida pelo schema da ordem da lista. */
export function decodificarCursor<T>(cursor: string, chave: z.ZodType<T>): T {
  let valor: unknown;
  try {
    valor = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw cursorIlegivel();
  }
  const lido = chave.safeParse(valor);
  if (!lido.success) throw cursorIlegivel();
  return lido.data;
}

/**
 * A página a partir das linhas lidas com um item a mais que o limite: as do limite e o cursor do
 * último item, ou nulo na última página.
 */
export function pagina<L>(
  linhas: L[],
  limite: number,
  chave: (linha: L) => readonly unknown[],
): { linhas: L[]; proximo: string | null } {
  if (linhas.length <= limite) return { linhas, proximo: null };
  const daPagina = linhas.slice(0, limite);
  const ultima = daPagina[daPagina.length - 1] as L;
  return { linhas: daPagina, proximo: codificarCursor(chave(ultima)) };
}
