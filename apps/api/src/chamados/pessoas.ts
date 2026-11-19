// A busca da pessoa dos chamados (spec chamados, "Abrir um chamado pela TI"; change chamados-da-ti,
// design, decisão 18, "A busca da pessoa (tarefa 4.22)"), da gaveta e do "Ver como" da prévia: as
// pessoas ativas da organização pelas palavras do nome, sem acento, até 10, pela ordem do nome sem
// acento, com o nome e o caminho do local de trabalho, sem os contatos, e o total das que casam. Só
// o nome, e não o texto de busca das pessoas, que tem também a matrícula e o e-mail.
import { pessoas, type Transacao } from '@grafite/db';
import { type ArvoreDeLocais, normalizarTexto } from '@grafite/domain';
import { and, asc, count, eq, type SQL, sql } from 'drizzle-orm';
import { semAcento } from '../ativos/colunas.ts';

/** Quantas pessoas a busca traz, no máximo: quem busca afina o termo para achar as outras. */
export const LIMITE_DA_BUSCA_DA_PESSOA = 10;

export interface PessoaNaBusca {
  id: string;
  nome: string;
  /** O caminho do local de trabalho, como o chamado o mostra; nulo sem o local. */
  local: string | null;
}

export interface ResultadoDaBuscaDaPessoa {
  itens: PessoaNaBusca[];
  /** Quantas pessoas casam com o termo, para quem busca saber que há mais que as do limite. */
  total: number;
}

/** O nome sem acento e em minúsculas, no banco, como o `normalizarTexto` deixa as palavras. */
const nomeSemAcento = semAcento(sql`${pessoas.nome}`);

export async function buscarPessoas(
  tx: Transacao,
  busca: string,
  arvore: ArvoreDeLocais,
): Promise<ResultadoDaBuscaDaPessoa> {
  const palavras = normalizarTexto(busca).split(' ').filter(Boolean);
  // O termo só de acento não sobra palavra, e a palavra vazia acharia todas as pessoas.
  if (palavras.length === 0) return { itens: [], total: 0 };
  const casam = and(
    eq(pessoas.situacao, 'ativa'),
    ...palavras.map((palavra): SQL => sql`strpos(${nomeSemAcento}, ${palavra}) > 0`),
  );
  const linhas = await tx
    .select({ id: pessoas.id, nome: pessoas.nome, localId: pessoas.localId })
    .from(pessoas)
    .where(casam)
    .orderBy(nomeSemAcento, asc(pessoas.id))
    .limit(LIMITE_DA_BUSCA_DA_PESSOA);
  const [contagem] = await tx.select({ total: count() }).from(pessoas).where(casam);
  return {
    itens: linhas.map(({ id, nome, localId }) => ({
      id,
      nome,
      local: localId === null ? null : arvore.caminho(localId),
    })),
    total: contagem?.total ?? 0,
  };
}
