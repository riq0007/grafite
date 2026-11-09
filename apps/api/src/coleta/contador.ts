// O total de páginas de um ativo agora (spec estoque, "Contador de páginas na saída"; spec
// solicitacoes, "Contador congelado na solicitação"): a saída do estoque e a impressora que entra
// numa solicitação guardam a leitura de `impressora.contador` do menor item, o "Total de páginas",
// quando ela é válida.
import { estadoDosAtivos, type Transacao } from '@grafite/db';
import { and, eq } from 'drizzle-orm';

/** O total de páginas lido e o momento da leitura; nulo sem a leitura válida. */
export async function lerContador(
  tx: Transacao,
  ativoId: string,
): Promise<{ paginas: number; lidoEm: Date } | null> {
  const linhas = await tx
    .select({
      item: estadoDosAtivos.item,
      situacao: estadoDosAtivos.situacao,
      valor: estadoDosAtivos.valorNumero,
      momento: estadoDosAtivos.momento,
    })
    .from(estadoDosAtivos)
    .where(
      and(eq(estadoDosAtivos.ativoId, ativoId), eq(estadoDosAtivos.metrica, 'impressora.contador')),
    );
  const [total] = linhas.sort((a, b) => Number(a.item) - Number(b.item));
  if (total?.situacao !== 'valida' || total.valor === null) return null;
  return { paginas: Math.round(total.valor), lidoEm: total.momento };
}
