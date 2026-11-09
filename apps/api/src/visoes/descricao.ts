// A visão como a auditoria a guarda (spec auditoria; design do P1c, decisão 6): a tabela, o nome, as
// colunas pelos rótulos, a ordenação e os filtros em texto, com os registros escolhidos pelo nome atual.
import { modelos, pessoas, type Transacao, tiposDeAtivo } from '@grafite/db';
import { type ColunaDescrita, type DefinicaoDaVisao, descreverDefinicao } from '@grafite/domain';
import { inArray } from 'drizzle-orm';
import { lerArvore } from '../arvore.ts';
import { colunasDoCatalogo } from '../ativos/colunas.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** As colunas de cada tabela com visões, todas, para os rótulos da auditoria. */
const COLUNAS_DA_TABELA: Record<string, (tx: Transacao) => Promise<readonly ColunaDescrita[]>> = {
  ativos: (tx) => colunasDoCatalogo(tx, true),
};

/** Os nomes atuais dos tipos, dos modelos, das pessoas e dos locais que os filtros escolhem. */
async function nomesDosRegistros(
  tx: Transacao,
  definicao: DefinicaoDaVisao,
): Promise<(id: string) => string | undefined> {
  const ids = [
    ...new Set(
      definicao.filtros.flatMap((filtro) =>
        filtro.operador === 'qualquer'
          ? filtro.valores
          : filtro.operador === 'em' || filtro.operador === 'igual'
            ? [filtro.local]
            : [],
      ),
    ),
  ].filter((id) => UUID.test(id));
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    for (const tipo of await tx
      .select({ id: tiposDeAtivo.id, nome: tiposDeAtivo.nome })
      .from(tiposDeAtivo)
      .where(inArray(tiposDeAtivo.id, ids))) {
      nomes.set(tipo.id, tipo.nome);
    }
    for (const modelo of await tx
      .select({ id: modelos.id, fabricante: modelos.fabricante, nome: modelos.nome })
      .from(modelos)
      .where(inArray(modelos.id, ids))) {
      nomes.set(modelo.id, `${modelo.fabricante} ${modelo.nome}`);
    }
    for (const pessoa of await tx
      .select({ id: pessoas.id, nome: pessoas.nome })
      .from(pessoas)
      .where(inArray(pessoas.id, ids))) {
      nomes.set(pessoa.id, pessoa.nome);
    }
    const arvore = await lerArvore(tx);
    for (const id of ids) if (arvore.local(id)) nomes.set(id, arvore.caminho(id));
  }
  return (id) => nomes.get(id);
}

/** A visão na auditoria: a tabela, o nome e a definição em texto. */
export async function visaoNaAuditoria(
  tx: Transacao,
  { tabela, nome, definicao }: { tabela: string; nome: string; definicao: DefinicaoDaVisao },
) {
  const colunas = (await COLUNAS_DA_TABELA[tabela]?.(tx)) ?? [];
  return {
    tabela,
    nome,
    ...descreverDefinicao(definicao, colunas, await nomesDosRegistros(tx, definicao)),
  };
}
