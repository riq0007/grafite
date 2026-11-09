// A leitura do estoque (change p4c-estoque, design, decisões 5 e 6): as movimentações e os saldos
// com os nomes das referências, que quem vê o estoque lê sem as permissões delas, e se a conta pode
// abrir a ficha de cada uma, pelas permissões dela. As listas vão por cursor: os saldos pelo código
// do consumível, pelo caminho do local e pelo id; as movimentações da mais nova para a mais antiga.
import {
  ativos,
  consumiveis,
  contas,
  fornecedores,
  modelos,
  movimentosDoEstoque,
  pessoas,
  saldosDoEstoque,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  type LocalDaArvore,
  type Permissao,
  podeEm,
  rotuloDoAtivo,
  situacaoDoSaldo,
} from '@grafite/domain';
import { and, asc, desc, eq, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { z } from 'zod';
import { codificarCursor, decodificarCursor } from '../paginacao.ts';
import type { MovimentoDoEstoque, SaldoDoEstoque } from './esquemas.ts';

/** Quem lê: o acesso, para as fichas que a conta abre, e a árvore, para os caminhos. */
export interface LeitorDoEstoque {
  acesso: Acesso;
  arvore: ArvoreDeLocais;
}

/**
 * Os locais que a consulta alcança: os do alcance da permissão, dentro do local filtrado, com os de
 * dentro dele. `null` é a organização inteira, sem o filtro.
 */
export function locaisDaConsulta(
  { acesso, arvore }: LeitorDoEstoque,
  permissao: Permissao,
  local?: string,
): string[] | null {
  const doAlcance = alcance(acesso, permissao, arvore);
  if (doAlcance === null) return [];
  const doFiltro =
    local === undefined ? null : arvore.local(local) ? arvore.ramo(local) : new Set<string>();
  if (doAlcance === 'organizacao') return doFiltro ? [...doFiltro] : null;
  return [...doAlcance].filter((id) => !doFiltro || doFiltro.has(id));
}

/** Os ids de uma lista como o literal de um array do PostgreSQL. */
export const arrayDeIds = (ids: readonly string[]) => sql`${`{${ids.join(',')}}`}::uuid[]`;

/** A coluna de local dentro da lista de locais; a lista vazia não alcança nada. */
export const localEm = (coluna: SQLWrapper, ids: readonly string[]) =>
  sql`${coluna} = any(${arrayDeIds(ids)})`;

const COLUNAS_DO_CONSUMIVEL = {
  id: consumiveis.id,
  codigo: consumiveis.codigo,
  nome: consumiveis.nome,
  tipo: consumiveis.tipo,
  cor: consumiveis.cor,
  situacao: consumiveis.situacao,
};

type ConsumivelLido = Pick<
  typeof consumiveis.$inferSelect,
  'id' | 'codigo' | 'nome' | 'tipo' | 'cor' | 'situacao'
>;

const comoConsumivel = (consumivel: ConsumivelLido, { acesso, arvore }: LeitorDoEstoque) => ({
  ...consumivel,
  abrir: podeEm(acesso, 'consumiveis.ver', null, arvore),
});

const comoLocal = (id: string | null, arvore: ArvoreDeLocais) =>
  id === null ? null : { id, caminho: arvore.caminho(id) };

/** O momento com a precisão do banco, para o cursor não pular nem repetir. */
const momentoExato = sql<string>`to_char(${movimentosDoEstoque.momento} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const ChaveDoMovimento = z.tuple([z.string(), z.uuid()]);

/** As movimentações da condição, da mais nova para a mais antiga, com a chave do cursor. */
async function consultarMovimentos(
  tx: Transacao,
  leitor: LeitorDoEstoque,
  { onde, limite }: { onde?: SQL; limite?: number },
) {
  const consulta = tx
    .select({
      movimento: movimentosDoEstoque,
      momentoExato,
      consumivel: COLUNAS_DO_CONSUMIVEL,
      fornecedor: { id: fornecedores.id, nome: fornecedores.nome },
      ativo: {
        id: ativos.id,
        nome: ativos.nome,
        patrimonio: ativos.patrimonio,
        localId: ativos.localId,
      },
      tipoDoAtivo: { nome: tiposDeAtivo.nome },
      modeloDoAtivo: { fabricante: modelos.fabricante, nome: modelos.nome },
      lancadoPor: { id: contas.id, nome: pessoas.nome },
    })
    .from(movimentosDoEstoque)
    .innerJoin(consumiveis, eq(consumiveis.id, movimentosDoEstoque.consumivelId))
    .leftJoin(fornecedores, eq(fornecedores.id, movimentosDoEstoque.fornecedorId))
    .leftJoin(ativos, eq(ativos.id, movimentosDoEstoque.ativoId))
    .leftJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .innerJoin(contas, eq(contas.id, movimentosDoEstoque.lancadoPor))
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .where(onde)
    .orderBy(desc(movimentosDoEstoque.momento), desc(movimentosDoEstoque.id))
    .$dynamic();
  const linhas = await (limite === undefined ? consulta : consulta.limit(limite));
  const { acesso, arvore } = leitor;
  const abreFornecedores = podeEm(acesso, 'fornecedores.ver', null, arvore);
  return linhas.map((linha) => {
    const { movimento, ativo, tipoDoAtivo } = linha;
    const item: z.infer<typeof MovimentoDoEstoque> = {
      id: movimento.id,
      tipo: movimento.tipo,
      consumivel: comoConsumivel(linha.consumivel, leitor),
      quantidade: movimento.quantidade,
      origem: comoLocal(movimento.origemId, arvore),
      destino: comoLocal(movimento.destinoId, arvore),
      fornecedor: linha.fornecedor ? { ...linha.fornecedor, abrir: abreFornecedores } : null,
      notaFiscal: movimento.notaFiscal,
      ativo:
        ativo && tipoDoAtivo
          ? {
              id: ativo.id,
              rotulo: rotuloDoAtivo({
                nome: ativo.nome,
                modelo: linha.modeloDoAtivo,
                tipo: tipoDoAtivo,
              }),
              patrimonio: ativo.patrimonio,
              abrir: podeEm(acesso, 'ativos.ver', ativo.localId, arvore),
            }
          : null,
      contador:
        movimento.contadorPaginas !== null && movimento.contadorLidoEm !== null
          ? { paginas: movimento.contadorPaginas, lidoEm: movimento.contadorLidoEm.toISOString() }
          : null,
      motivo: movimento.motivo,
      observacao: movimento.observacao,
      lancadoPor: linha.lancadoPor,
      momento: movimento.momento.toISOString(),
    };
    return { item, chave: [linha.momentoExato, movimento.id] as const };
  });
}

/** As movimentações da condição, da mais nova para a mais antiga, até o limite. */
export async function lerMovimentos(
  tx: Transacao,
  leitor: LeitorDoEstoque,
  opcoes: { onde?: SQL; limite?: number },
): Promise<z.infer<typeof MovimentoDoEstoque>[]> {
  return (await consultarMovimentos(tx, leitor, opcoes)).map(({ item }) => item);
}

/** Uma página das movimentações da condição, depois do cursor. */
export async function lerPaginaDeMovimentos(
  tx: Transacao,
  leitor: LeitorDoEstoque,
  { onde, cursor, limite }: { onde?: SQL; cursor?: string; limite: number },
) {
  const depoisDe = cursor ? decodificarCursor(cursor, ChaveDoMovimento) : null;
  const doCursor = depoisDe
    ? sql`(${movimentosDoEstoque.momento}, ${movimentosDoEstoque.id}) < (${depoisDe[0]}::timestamptz, ${depoisDe[1]}::uuid)`
    : undefined;
  const linhas = await consultarMovimentos(tx, leitor, {
    onde: and(onde, doCursor),
    limite: limite + 1,
  });
  const daPagina = linhas.slice(0, limite);
  const ultima = daPagina.at(-1);
  return {
    itens: daPagina.map(({ item }) => item),
    proximo: linhas.length > limite && ultima ? codificarCursor(ultima.chave) : null,
  };
}

/** Um saldo lido, com a situação e o que a conta pode fazer nele. */
export function comoSaldo(
  saldo: typeof saldosDoEstoque.$inferSelect,
  consumivel: ConsumivelLido,
  leitor: LeitorDoEstoque,
): z.infer<typeof SaldoDoEstoque> {
  const { acesso, arvore } = leitor;
  return {
    id: saldo.id,
    consumivel: comoConsumivel(consumivel, leitor),
    local: { id: saldo.localId, caminho: arvore.caminho(saldo.localId) },
    saldo: saldo.saldo,
    minimo: saldo.minimo,
    situacao: situacaoDoSaldo(saldo.saldo, saldo.minimo),
    abaixoDesde: saldo.abaixoDesde?.toISOString() ?? null,
    permite: { movimentar: podeEm(acesso, 'estoque.movimentar', saldo.localId, arvore) },
  };
}

const ChaveDoSaldo = z.tuple([z.string(), z.number().int(), z.uuid()]);

/**
 * Uma página dos saldos da condição, pelo código normalizado do consumível, pelo caminho do local e
 * pelo id. O caminho não é coluna: a ordem dos locais pelo caminho vai ao banco como uma lista.
 */
export async function lerPaginaDeSaldos(
  tx: Transacao,
  leitor: LeitorDoEstoque,
  {
    locais,
    onde,
    cursor,
    limite,
  }: { locais: readonly LocalDaArvore[]; onde?: SQL; cursor?: string; limite: number },
) {
  const { arvore } = leitor;
  const ordem = locais
    .map(({ id }) => ({ id, caminho: arvore.caminho(id) }))
    .sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt-BR') || (a.id < b.id ? -1 : 1))
    .map(({ id }) => id);
  const posicao = sql<number>`array_position(${arrayDeIds(ordem)}, ${saldosDoEstoque.localId})`;
  const depoisDe = cursor ? decodificarCursor(cursor, ChaveDoSaldo) : null;
  const doCursor = depoisDe
    ? sql`(${consumiveis.codigoNormalizado}, ${posicao}, ${saldosDoEstoque.id}) > (${depoisDe[0]}, ${depoisDe[1]}::int, ${depoisDe[2]}::uuid)`
    : undefined;
  const linhas = await tx
    .select({
      saldo: saldosDoEstoque,
      consumivel: COLUNAS_DO_CONSUMIVEL,
      codigoNormalizado: consumiveis.codigoNormalizado,
      posicao,
    })
    .from(saldosDoEstoque)
    .innerJoin(consumiveis, eq(consumiveis.id, saldosDoEstoque.consumivelId))
    .where(and(onde, doCursor))
    .orderBy(asc(consumiveis.codigoNormalizado), asc(posicao), asc(saldosDoEstoque.id))
    .limit(limite + 1);
  const daPagina = linhas.slice(0, limite);
  const ultima = daPagina.at(-1);
  return {
    itens: daPagina.map(({ saldo, consumivel }) => comoSaldo(saldo, consumivel, leitor)),
    proximo:
      linhas.length > limite && ultima
        ? codificarCursor([ultima.codigoNormalizado, ultima.posicao, ultima.saldo.id])
        : null,
  };
}

/** Os saldos da condição, sem cursor, na ordem dada. */
export async function lerSaldos(
  tx: Transacao,
  leitor: LeitorDoEstoque,
  {
    onde,
    ordem = [asc(consumiveis.codigoNormalizado)],
    limite,
  }: {
    onde?: SQL;
    ordem?: SQL[];
    limite?: number;
  },
): Promise<z.infer<typeof SaldoDoEstoque>[]> {
  const consulta = tx
    .select({ saldo: saldosDoEstoque, consumivel: COLUNAS_DO_CONSUMIVEL })
    .from(saldosDoEstoque)
    .innerJoin(consumiveis, eq(consumiveis.id, saldosDoEstoque.consumivelId))
    .where(onde)
    .orderBy(...ordem)
    .$dynamic();
  const linhas = await (limite === undefined ? consulta : consulta.limit(limite));
  return linhas.map(({ saldo, consumivel }) => comoSaldo(saldo, consumivel, leitor));
}
