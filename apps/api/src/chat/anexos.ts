// Os anexos do chat (spec arquivos-e-imagens, "Anexos do chat"; change chat-com-chamados, design,
// decisão 1): cada anexo nasce sem dono no envio, com a conta que o enviou, e passa à mensagem, com
// a conversa dela, na gravação dela. O anexo esquecido sai na manutenção diária, passadas 24 h, como
// o dos chamados.
import { anexosDoChat, arquivos, type Transacao } from '@grafite/db';
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { ANEXO_NAO_ENCONTRADO, VALIDADE_DO_ANEXO_SEM_DONO } from '../chamados/anexos.ts';
import { dadosInvalidos } from '../problemas.ts';

export interface TomadaDosAnexosDoChat {
  /** Os ids dos arquivos, como o envio os devolveu; o repetido conta uma vez. */
  arquivos: readonly string[];
  /** A conta que manda a mensagem: só os anexos que ela enviou. */
  contaId: string;
  conversaId: string;
  mensagemId: string;
}

/**
 * Toma os anexos para a mensagem, na transação dela, que já a gravou: só os sem dono, enviados pela
 * mesma conta e com o arquivo não removido. Qualquer um fora disso recusa a mensagem inteira com "O
 * anexo não foi encontrado. Envie o arquivo de novo.", em `anexos`, e a transação volta. As travas
 * seguem as de `tomarAnexos` dos chamados: os anexos travados na ordem dos arquivos antes de o
 * arquivo ser conferido, num comando à parte.
 */
export async function tomarAnexosDoChat(
  tx: Transacao,
  { arquivos: pedidos, contaId, conversaId, mensagemId }: TomadaDosAnexosDoChat,
): Promise<string[]> {
  const ids = [...new Set(pedidos.map((id) => id.toLowerCase()))];
  if (ids.length === 0) return [];
  const recusa = () => dadosInvalidos({ anexos: ANEXO_NAO_ENCONTRADO });
  const travados = await tx
    .select({ id: anexosDoChat.id })
    .from(anexosDoChat)
    .where(and(inArray(anexosDoChat.arquivoId, ids), isNull(anexosDoChat.conversaId)))
    .orderBy(anexosDoChat.arquivoId)
    .for('update');
  if (travados.length !== ids.length) throw recusa();
  const tomados = await tx
    .update(anexosDoChat)
    .set({ conversaId, mensagemId })
    .where(
      and(
        inArray(
          anexosDoChat.id,
          travados.map(({ id }) => id),
        ),
        sql`exists (select 1 from ${arquivos}
          where ${arquivos.id} = ${anexosDoChat.arquivoId}
            and ${arquivos.enviadoPor} = ${contaId}
            and ${arquivos.removidoEm} is null)`,
      ),
    )
    .returning({ arquivoId: anexosDoChat.arquivoId });
  if (tomados.length !== ids.length) throw recusa();
  return ids;
}

/**
 * Remove os anexos do chat sem dono enviados há mais de 24 h, como `removerAnexosEsquecidos` dos
 * chamados: o arquivo ganha o `removido_em`, a linha do anexo fica, e os anexos ficam travados antes,
 * na ordem dos arquivos. Devolve quantos removeu.
 */
export async function removerAnexosDoChatEsquecidos(tx: Transacao, momento: Date): Promise<number> {
  const limite = new Date(momento.getTime() - VALIDADE_DO_ANEXO_SEM_DONO);
  const esquecidos = await tx
    .select({ arquivoId: anexosDoChat.arquivoId })
    .from(anexosDoChat)
    .innerJoin(arquivos, eq(arquivos.id, anexosDoChat.arquivoId))
    .where(
      and(
        isNull(anexosDoChat.conversaId),
        isNull(arquivos.removidoEm),
        lt(arquivos.enviadoEm, limite),
      ),
    )
    .orderBy(anexosDoChat.arquivoId)
    .for('update', { of: anexosDoChat });
  if (esquecidos.length === 0) return 0;
  const removidos = await tx
    .update(arquivos)
    .set({ removidoEm: momento })
    .where(
      and(
        inArray(
          arquivos.id,
          esquecidos.map(({ arquivoId }) => arquivoId),
        ),
        isNull(arquivos.removidoEm),
      ),
    )
    .returning({ id: arquivos.id });
  return removidos.length;
}
