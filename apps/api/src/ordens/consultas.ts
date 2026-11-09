// As consultas das OS (spec modulo-operacao, "Tela das ordens de serviço" e "Ficha da ordem de
// serviço"; cadastro-de-ativos, "Ordens de serviço na ficha do ativo"; change p4e-ordens-de-servico,
// design, decisão 7): a página da lista, com as em aberto por padrão, o local, a busca e o cursor; a
// ficha pelo número; e as OS de um ativo. A OS vale pelo local guardado na abertura.
import { ativos, ordensDeServico, type Transacao } from '@grafite/db';
import { alcance, normalizarTexto, SITUACOES_EM_ABERTO } from '@grafite/domain';
import { and, count, desc, eq, inArray, like, lt, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { semAcento } from '../ativos/colunas.ts';
import { contendo } from '../busca.ts';
import { localEm } from '../estoque/leitura.ts';
import { decodificarCursor, pagina } from '../paginacao.ts';
import { dadosInvalidos, naoEncontrado } from '../problemas.ts';
import type { FiltrosDasOrdens, ListaDeOrdens, OrdensDoAtivo } from './esquemas.ts';
import { type LeitorDasOrdens, lerOrdem, lerOrdens } from './leitura.ts';

/** As OS que a conta vê: o local no alcance de `ordens.ver`; a sem local, pela organização inteira. */
function condicaoDeVer({ acesso, arvore }: LeitorDasOrdens): SQL | undefined {
  const ver = alcance(acesso, 'ordens.ver', arvore);
  if (ver === null) return sql`false`;
  if (ver === 'organizacao') return undefined;
  return localEm(ordensDeServico.localId, [...ver]);
}

/** Cada palavra da busca acha pelo número, pelo ativo, pelo problema e pela OS do fornecedor. */
function condicaoDaPalavra(palavra: string): SQL {
  const padrao = contendo(palavra);
  return or(
    sql`${ordensDeServico.numero}::text = ${palavra}`,
    sql`exists (select 1 from ${ativos} where ${ativos.id} = ${ordensDeServico.ativoId}
      and ${ativos.busca} like ${padrao})`,
    like(semAcento(sql`${ordensDeServico.problema}`), padrao),
    like(semAcento(sql`coalesce(${ordensDeServico.osDoFornecedor}, '')`), padrao),
  ) as SQL;
}

function condicoesDaLista(
  leitor: LeitorDasOrdens,
  filtros: z.infer<typeof FiltrosDasOrdens>,
): SQL[] {
  const condicoes: SQL[] = [];
  const ver = condicaoDeVer(leitor);
  if (ver) condicoes.push(ver);
  if (filtros.situacao === 'em-aberto') {
    condicoes.push(inArray(ordensDeServico.situacao, [...SITUACOES_EM_ABERTO]));
  } else if (filtros.situacao !== 'todas') {
    condicoes.push(eq(ordensDeServico.situacao, filtros.situacao));
  }
  if (filtros.local) {
    if (!leitor.arvore.local(filtros.local)) {
      throw dadosInvalidos({ local: 'Local não encontrado.' });
    }
    condicoes.push(localEm(ordensDeServico.localId, [...leitor.arvore.ramo(filtros.local)]));
  }
  for (const palavra of normalizarTexto(filtros.busca ?? '')
    .split(' ')
    .filter(Boolean)) {
    condicoes.push(condicaoDaPalavra(palavra));
  }
  return condicoes;
}

const ChaveDaLista = z.tuple([z.iso.datetime(), z.uuid()]);

/** A página da lista, das mais novas para as mais antigas, com o total dos filtros. */
export async function lerPaginaDeOrdens(
  tx: Transacao,
  leitor: LeitorDasOrdens,
  filtros: z.infer<typeof FiltrosDasOrdens>,
): Promise<z.infer<typeof ListaDeOrdens>> {
  const condicoes = condicoesDaLista(leitor, filtros);
  const [{ total } = { total: 0 }] = await tx
    .select({ total: count() })
    .from(ordensDeServico)
    .where(and(...condicoes));
  if (filtros.cursor) {
    const [momento, id] = decodificarCursor(filtros.cursor, ChaveDaLista);
    const depois = new Date(momento);
    condicoes.push(
      or(
        lt(ordensDeServico.abertaEm, depois),
        and(eq(ordensDeServico.abertaEm, depois), lt(ordensDeServico.id, id)),
      ) as SQL,
    );
  }
  const linhas = await tx
    .select({ id: ordensDeServico.id, abertaEm: ordensDeServico.abertaEm })
    .from(ordensDeServico)
    .where(and(...condicoes))
    .orderBy(desc(ordensDeServico.abertaEm), desc(ordensDeServico.id))
    .limit(filtros.limite + 1);
  const { linhas: daPagina, proximo } = pagina(linhas, filtros.limite, (linha) => [
    linha.abertaEm.toISOString(),
    linha.id,
  ]);
  return {
    itens: await lerOrdens(
      tx,
      leitor,
      daPagina.map(({ id }) => id),
    ),
    total,
    proximo,
  };
}

/** A ficha pelo número: a que não existe e a que a conta não vê são a mesma recusa. */
export async function lerFichaDaOrdem(tx: Transacao, leitor: LeitorDasOrdens, numero: number) {
  const [linha] = await tx
    .select({ id: ordensDeServico.id })
    .from(ordensDeServico)
    .where(and(eq(ordensDeServico.numero, numero), condicaoDeVer(leitor)));
  if (!linha) throw naoEncontrado('Ordem de serviço não encontrada.');
  return lerOrdem(tx, leitor, linha.id);
}

/** As resolvidas ou encerradas mais novas que a seção da ficha do ativo mostra. */
const RESOLVIDAS_DO_ATIVO = 5;

/** As OS de um ativo que a conta vê: as em aberto e as 5 resolvidas ou encerradas mais novas. */
export async function ordensDoAtivo(
  tx: Transacao,
  leitor: LeitorDasOrdens,
  ativoId: string,
): Promise<z.infer<typeof OrdensDoAtivo>> {
  const doAtivo = and(eq(ordensDeServico.ativoId, ativoId), condicaoDeVer(leitor));
  const emAberto = await tx
    .select({ id: ordensDeServico.id })
    .from(ordensDeServico)
    .where(and(doAtivo, inArray(ordensDeServico.situacao, [...SITUACOES_EM_ABERTO])))
    .orderBy(desc(ordensDeServico.abertaEm), desc(ordensDeServico.id));
  const resolvidas = await tx
    .select({ id: ordensDeServico.id })
    .from(ordensDeServico)
    .where(and(doAtivo, inArray(ordensDeServico.situacao, ['resolvida', 'encerrada'])))
    .orderBy(
      desc(sql`coalesce(${ordensDeServico.encerradaEm}, ${ordensDeServico.resolvidaEm})`),
      desc(ordensDeServico.id),
    )
    .limit(RESOLVIDAS_DO_ATIVO);
  return {
    emAberto: await lerOrdens(
      tx,
      leitor,
      emAberto.map(({ id }) => id),
    ),
    resolvidasOuEncerradas: await lerOrdens(
      tx,
      leitor,
      resolvidas.map(({ id }) => id),
    ),
  };
}
