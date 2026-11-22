// Os anexos dos chamados (spec arquivos-e-imagens, "Anexos dos chamados"; change chamados-da-ti,
// design, decisão 10): cada anexo nasce sem dono no envio, com a conta que o enviou, e passa ao
// chamado na gravação que o usa, a mensagem, a nota, a abertura ou o campo da TI, na transação
// dela. O anexo esquecido sai na manutenção diária, passadas 24 h.
import { anexosDosChamados, arquivos, type Transacao } from '@grafite/db';
import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { dadosInvalidos } from '../problemas.ts';

export const ANEXO_NAO_ENCONTRADO = 'O anexo não foi encontrado. Envie o arquivo de novo.';

/** Por quanto tempo o anexo fica sem dono antes de a manutenção diária o remover. */
export const VALIDADE_DO_ANEXO_SEM_DONO = 24 * 60 * 60_000;

/** O dono do anexo: o chamado, com a mensagem (ou a nota) ou com o id do campo do formulário. */
export type DonoDoAnexo =
  | { chamadoId: string; mensagemId: string }
  | { chamadoId: string; campoId: string };

export interface TomadaDosAnexos {
  /**
   * Os ids dos arquivos, como o envio os devolveu, já conferidos como UUID pelo esquema da rota ou
   * pelo domínio; o repetido conta uma vez.
   */
  arquivos: readonly string[];
  /** A conta que grava: só os anexos que ela enviou. */
  contaId: string;
  dono: DonoDoAnexo;
  /** Onde a recusa aparece: `anexos` na mensagem e na nota, `campos.<id>` no campo. */
  chave: string;
}

/**
 * Toma os anexos para o dono, na transação da gravação: só os sem dono, enviados pela mesma conta e
 * com o arquivo não removido. Qualquer um fora disso recusa a gravação inteira com "O anexo não foi
 * encontrado. Envie o arquivo de novo.", e a transação volta. Devolve os ids tomados, na ordem.
 *
 * Os anexos ficam travados antes da conferência do arquivo, que vem num comando à parte: a outra
 * gravação com o mesmo anexo espera esta e não o acha mais sem dono, e a manutenção que travou o
 * anexo antes faz esta esperar e reler o arquivo, já removido. A trava segue a ordem dos arquivos,
 * como a da manutenção, para as duas não se travarem em cruz quando pegam vários anexos.
 */
export async function tomarAnexos(
  tx: Transacao,
  { arquivos: pedidos, contaId, dono, chave }: TomadaDosAnexos,
): Promise<string[]> {
  const ids = [...new Set(pedidos.map((id) => id.toLowerCase()))];
  if (ids.length === 0) return [];
  const recusa = () => dadosInvalidos({ [chave]: ANEXO_NAO_ENCONTRADO });
  const travados = await tx
    .select({ id: anexosDosChamados.id })
    .from(anexosDosChamados)
    .where(and(inArray(anexosDosChamados.arquivoId, ids), isNull(anexosDosChamados.chamadoId)))
    .orderBy(anexosDosChamados.arquivoId)
    .for('update');
  if (travados.length !== ids.length) throw recusa();
  const tomados = await tx
    .update(anexosDosChamados)
    .set({
      chamadoId: dono.chamadoId,
      mensagemId: 'mensagemId' in dono ? dono.mensagemId : null,
      campoId: 'campoId' in dono ? dono.campoId : null,
    })
    .where(
      and(
        inArray(
          anexosDosChamados.id,
          travados.map(({ id }) => id),
        ),
        sql`exists (select 1 from ${arquivos}
          where ${arquivos.id} = ${anexosDosChamados.arquivoId}
            and ${arquivos.enviadoPor} = ${contaId}
            and ${arquivos.removidoEm} is null)`,
      ),
    )
    .returning({ arquivoId: anexosDosChamados.arquivoId });
  if (tomados.length !== ids.length) throw recusa();
  return ids;
}

/**
 * Os nomes dos anexos que ainda existem de cada mensagem (ou nota), na ordem do envio, como a
 * conversa os mostra: o começo da mensagem só com os anexos é o nome do primeiro (change
 * chat-com-chamados, tarefa 4.18). A mensagem sem anexo fica de fora do mapa.
 */
export async function nomesDosAnexosDasMensagens(
  tx: Transacao,
  mensagens: readonly string[],
): Promise<Map<string, string[]>> {
  const ids = [...new Set(mensagens)];
  const nomes = new Map<string, string[]>();
  if (ids.length === 0) return nomes;
  const linhas = await tx
    .select({ mensagemId: anexosDosChamados.mensagemId, nome: arquivos.nome })
    .from(anexosDosChamados)
    .innerJoin(arquivos, eq(arquivos.id, anexosDosChamados.arquivoId))
    .where(and(inArray(anexosDosChamados.mensagemId, ids), isNull(arquivos.removidoEm)))
    .orderBy(asc(arquivos.enviadoEm), asc(arquivos.id));
  for (const { mensagemId, nome } of linhas) {
    if (mensagemId === null) continue;
    const daMensagem = nomes.get(mensagemId) ?? [];
    daMensagem.push(nome ?? '');
    nomes.set(mensagemId, daMensagem);
  }
  return nomes;
}

/**
 * Remove os anexos sem dono enviados há mais de 24 h: o arquivo ganha o `removido_em`, e o conteúdo
 * sai com os outros removidos. A linha do anexo fica, porque o papel da aplicação não apaga o anexo,
 * e é o `removido_em` do arquivo que a deixa de fora da próxima vez. Os anexos ficam travados antes,
 * como na gravação que os toma: o que ela tomou primeiro fica de fora, e a que vem depois relê o
 * arquivo removido e recusa. Devolve quantos removeu.
 */
export async function removerAnexosEsquecidos(tx: Transacao, momento: Date): Promise<number> {
  const limite = new Date(momento.getTime() - VALIDADE_DO_ANEXO_SEM_DONO);
  const esquecidos = await tx
    .select({ arquivoId: anexosDosChamados.arquivoId })
    .from(anexosDosChamados)
    .innerJoin(arquivos, eq(arquivos.id, anexosDosChamados.arquivoId))
    .where(
      and(
        isNull(anexosDosChamados.chamadoId),
        isNull(arquivos.removidoEm),
        lt(arquivos.enviadoEm, limite),
      ),
    )
    .orderBy(anexosDosChamados.arquivoId)
    .for('update', { of: anexosDosChamados });
  if (esquecidos.length === 0) return 0;
  // O `removido_em` nulo se confere de novo: a outra volta da manutenção que travou os mesmos
  // anexos antes só os travou, e a espera não relê o arquivo; este comando já o lê removido.
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
