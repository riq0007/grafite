// A busca dos chamados (spec modulo-chamados, "Busca dos chamados"; change chamados-da-ti, design,
// decisão 17, "A rota da busca (tarefa 4.20)"): o número e as palavras que o termo pede são do
// domínio (`termoDaBusca`); aqui, o chamado do número vem primeiro e cada palavra é um `strpos` do
// título normalizado. Os abertos vêm antes dos resolvidos, o mais novo primeiro, só com os chamados
// que a conta vê.
import { chamados, pessoas, type Transacao } from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  type SituacaoDoChamado,
  termoDaBusca,
} from '@grafite/domain';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { ondeAContaVe } from './alcance.ts';

/** Quantos chamados a busca traz. */
export const NA_BUSCA = 8;

export interface ChamadoNaBusca {
  numero: number;
  titulo: string;
  /** O nome de agora de quem pediu. */
  pessoa: string;
  situacao: SituacaoDoChamado;
}

/** Os chamados que a conta vê pelo termo, até 8, na ordem da busca. */
export async function buscarChamados(
  tx: Transacao,
  termo: string,
  { acesso, arvore }: { acesso: Acesso; arvore: ArvoreDeLocais },
): Promise<{ itens: ChamadoNaBusca[] }> {
  const { numero, palavras } = termoDaBusca(termo);
  const peloNumero = numero === null ? undefined : eq(chamados.numero, numero);
  const pelasPalavras =
    palavras.length === 0
      ? undefined
      : and(
          ...palavras.map((palavra) => sql`strpos(${chamados.tituloNormalizado}, ${palavra}) > 0`),
        );
  if (!peloNumero && !pelasPalavras) return { itens: [] };
  const casa: SQL | undefined =
    peloNumero && pelasPalavras
      ? sql`(${peloNumero} or ${pelasPalavras})`
      : (peloNumero ?? pelasPalavras);

  const itens = await tx
    .select({
      numero: chamados.numero,
      titulo: chamados.titulo,
      pessoa: pessoas.nome,
      situacao: chamados.situacao,
    })
    .from(chamados)
    .innerJoin(pessoas, eq(pessoas.id, chamados.pessoaId))
    .where(and(casa, ondeAContaVe(alcance(acesso, 'chamados.ver', arvore))))
    .orderBy(
      ...(peloNumero ? [desc(peloNumero)] : []),
      sql`${chamados.situacao} = 'resolvido'`,
      desc(chamados.numero),
    )
    .limit(NA_BUSCA);
  return { itens };
}
