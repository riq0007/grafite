// As consultas das solicitações (spec modulo-operacao, "Tela das solicitações" e "Ficha da
// solicitação"; spec cadastro-de-ativos, "Solicitações na ficha do ativo"; spec solicitacoes, "Itens
// do toner"; change p4d-solicitacoes, design, decisões 6 e 7): a página da lista, com o filtro das
// pendentes por padrão, o tipo, o local, a busca e o cursor; a ficha pelo número; a escolha das
// impressoras, com o contador e os compatíveis de cada cor; e as solicitações de um ativo.
import {
  ativos,
  impressorasDasSolicitacoes,
  modelos,
  pessoas,
  solicitacoes,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  alcance,
  CORES_DE_CONSUMIVEL,
  MENSAGEM_DO_ATIVO_INATIVO,
  mensagemDoAtivoSemConsumiveis,
  normalizarTexto,
  rotuloDoAtivo,
  SITUACOES_PENDENTES,
  sugestaoDoConsumivel,
} from '@grafite/domain';
import { and, asc, count, desc, eq, inArray, like, lt, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { semAcento } from '../ativos/colunas.ts';
import { contendo } from '../busca.ts';
import { lerContador } from '../coleta/contador.ts';
import { CAPACIDADE_DOS_CONSUMIVEIS, compativeisDoModelo } from '../consumiveis/compativeis.ts';
import { arrayDeIds, localEm } from '../estoque/leitura.ts';
import { decodificarCursor, pagina } from '../paginacao.ts';
import { conflito, dadosInvalidos, naoEncontrado } from '../problemas.ts';
import type {
  FiltrosDasImpressoras,
  FiltrosDasSolicitacoes,
  ImpressoraParaSolicitacao,
  ImpressorasParaSolicitacao,
  ListaDeSolicitacoes,
  SolicitacoesDoAtivo,
} from './esquemas.ts';
import { type LeitorDasSolicitacoes, lerSolicitacao, lerSolicitacoes } from './leitura.ts';
import { conferirAtivo } from './registro.ts';

/**
 * As solicitações que a conta vê: com algum dos locais no alcance de `solicitacoes.ver`; a sem local
 * só pela organização inteira (design, decisão 6).
 */
function condicaoDeVer({ acesso, arvore }: LeitorDasSolicitacoes): SQL | undefined {
  const ver = alcance(acesso, 'solicitacoes.ver', arvore);
  if (ver === null) return sql`false`;
  if (ver === 'organizacao') return undefined;
  return sql`${solicitacoes.locais} && ${arrayDeIds([...ver])}`;
}

/** Cada palavra da busca acha pelo número, por quem pediu, pela impressora ou pelo ativo e pela OS. */
function condicaoDaPalavra(palavra: string): SQL {
  const padrao = contendo(palavra);
  return or(
    sql`${solicitacoes.numero}::text = ${palavra}`,
    sql`exists (select 1 from ${pessoas} where ${pessoas.id} = ${solicitacoes.pessoaId}
      and ${semAcento(sql`${pessoas.nome}`)} like ${padrao})`,
    sql`exists (select 1 from ${ativos} where ${ativos.id} = ${solicitacoes.ativoId}
      and ${ativos.busca} like ${padrao})`,
    sql`exists (select 1 from ${impressorasDasSolicitacoes}
      inner join ${ativos} on ${ativos.id} = ${impressorasDasSolicitacoes.ativoId}
      where ${impressorasDasSolicitacoes.solicitacaoId} = ${solicitacoes.id}
      and ${ativos.busca} like ${padrao})`,
    like(semAcento(sql`coalesce(${solicitacoes.osDoFornecedor}, '')`), padrao),
  ) as SQL;
}

function condicoesDaLista(
  leitor: LeitorDasSolicitacoes,
  filtros: z.infer<typeof FiltrosDasSolicitacoes>,
): SQL[] {
  const condicoes: SQL[] = [];
  const ver = condicaoDeVer(leitor);
  if (ver) condicoes.push(ver);
  if (filtros.situacao === 'pendentes') {
    condicoes.push(inArray(solicitacoes.situacao, [...SITUACOES_PENDENTES]));
  } else if (filtros.situacao !== 'todas') {
    condicoes.push(eq(solicitacoes.situacao, filtros.situacao));
  }
  if (filtros.tipo) condicoes.push(eq(solicitacoes.tipo, filtros.tipo));
  if (filtros.local) {
    if (!leitor.arvore.local(filtros.local))
      throw dadosInvalidos({ local: 'Local não encontrado.' });
    condicoes.push(
      sql`${solicitacoes.locais} && ${arrayDeIds([...leitor.arvore.ramo(filtros.local)])}`,
    );
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
export async function lerPaginaDeSolicitacoes(
  tx: Transacao,
  leitor: LeitorDasSolicitacoes,
  filtros: z.infer<typeof FiltrosDasSolicitacoes>,
): Promise<z.infer<typeof ListaDeSolicitacoes>> {
  const condicoes = condicoesDaLista(leitor, filtros);
  const [{ total } = { total: 0 }] = await tx
    .select({ total: count() })
    .from(solicitacoes)
    .where(and(...condicoes));
  if (filtros.cursor) {
    const [momento, id] = decodificarCursor(filtros.cursor, ChaveDaLista);
    const depois = new Date(momento);
    condicoes.push(
      or(
        lt(solicitacoes.registradaEm, depois),
        and(eq(solicitacoes.registradaEm, depois), lt(solicitacoes.id, id)),
      ) as SQL,
    );
  }
  const linhas = await tx
    .select({ id: solicitacoes.id, registradaEm: solicitacoes.registradaEm })
    .from(solicitacoes)
    .where(and(...condicoes))
    .orderBy(desc(solicitacoes.registradaEm), desc(solicitacoes.id))
    .limit(filtros.limite + 1);
  const { linhas: daPagina, proximo } = pagina(linhas, filtros.limite, (linha) => [
    linha.registradaEm.toISOString(),
    linha.id,
  ]);
  return {
    itens: await lerSolicitacoes(
      tx,
      leitor,
      daPagina.map(({ id }) => id),
    ),
    total,
    proximo,
  };
}

/** A ficha pela número: a que não existe e a que a conta não vê são a mesma recusa. */
export async function lerFicha(tx: Transacao, leitor: LeitorDasSolicitacoes, numero: number) {
  const [linha] = await tx
    .select({ id: solicitacoes.id })
    .from(solicitacoes)
    .where(and(eq(solicitacoes.numero, numero), condicaoDeVer(leitor)));
  if (!linha) throw naoEncontrado('Solicitação não encontrada.');
  return lerSolicitacao(tx, leitor, linha.id);
}

/** As encerradas mais novas que a seção da ficha do ativo mostra. */
const ENCERRADAS_DO_ATIVO = 5;

/** As solicitações de um ativo que a conta vê: as pendentes e as 5 encerradas mais novas. */
export async function solicitacoesDoAtivo(
  tx: Transacao,
  leitor: LeitorDasSolicitacoes,
  ativoId: string,
): Promise<z.infer<typeof SolicitacoesDoAtivo>> {
  const doAtivo = or(
    eq(solicitacoes.ativoId, ativoId),
    sql`exists (select 1 from ${impressorasDasSolicitacoes}
      where ${impressorasDasSolicitacoes.solicitacaoId} = ${solicitacoes.id}
      and ${impressorasDasSolicitacoes.ativoId} = ${ativoId})`,
  );
  const ver = condicaoDeVer(leitor);
  const pendentes = await tx
    .select({ id: solicitacoes.id })
    .from(solicitacoes)
    .where(and(doAtivo, ver, inArray(solicitacoes.situacao, [...SITUACOES_PENDENTES])))
    .orderBy(desc(solicitacoes.registradaEm), desc(solicitacoes.id));
  const encerradas = await tx
    .select({ id: solicitacoes.id })
    .from(solicitacoes)
    .where(and(doAtivo, ver, inArray(solicitacoes.situacao, ['concluida', 'cancelada'])))
    .orderBy(desc(solicitacoes.encerradaEm), desc(solicitacoes.id))
    .limit(ENCERRADAS_DO_ATIVO);
  const [doTipo] = await tx
    .select({
      usaConsumiveis: sql<boolean>`${CAPACIDADE_DOS_CONSUMIVEIS} = any(${tiposDeAtivo.capacidades})`,
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .where(eq(ativos.id, ativoId));
  return {
    usaConsumiveis: doTipo?.usaConsumiveis ?? false,
    pendentes: await lerSolicitacoes(
      tx,
      leitor,
      pendentes.map(({ id }) => id),
    ),
    encerradas: await lerSolicitacoes(
      tx,
      leitor,
      encerradas.map(({ id }) => id),
    ),
  };
}

/** As impressoras para o toner: as ativas que a conta vê, de um tipo que usa consumíveis. */
export async function impressorasParaSolicitacao(
  tx: Transacao,
  { acesso, arvore }: LeitorDasSolicitacoes,
  filtros: z.infer<typeof FiltrosDasImpressoras>,
): Promise<z.infer<typeof ImpressorasParaSolicitacao>> {
  const doVer = alcance(acesso, 'ativos.ver', arvore);
  if (!doVer) return { itens: [] };
  const condicoes: SQL[] = [
    eq(ativos.situacao, 'ativo'),
    sql`${CAPACIDADE_DOS_CONSUMIVEIS} = any(${tiposDeAtivo.capacidades})`,
  ];
  if (doVer !== 'organizacao') condicoes.push(localEm(ativos.localId, [...doVer]));
  for (const palavra of normalizarTexto(filtros.busca ?? '')
    .split(' ')
    .filter(Boolean)) {
    const padrao = contendo(palavra);
    condicoes.push(or(like(ativos.busca, padrao), like(modelos.busca, padrao)) as SQL);
  }
  const linhas = await tx
    .select({
      id: ativos.id,
      nome: ativos.nome,
      patrimonio: ativos.patrimonio,
      localId: ativos.localId,
      tipo: { nome: tiposDeAtivo.nome },
      modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .where(and(...condicoes))
    .orderBy(asc(ativos.patrimonioNormalizado), asc(ativos.id))
    .limit(filtros.limite);
  return {
    itens: linhas.map((linha) => ({
      id: linha.id,
      rotulo: rotuloDoAtivo({ nome: linha.nome, modelo: linha.modelo, tipo: linha.tipo }),
      patrimonio: linha.patrimonio,
      local: linha.localId ? { id: linha.localId, caminho: arvore.caminho(linha.localId) } : null,
    })),
  };
}

/**
 * A impressora para o toner: o contador de agora e, para cada cor, os compatíveis com o saldo nos
 * locais em que a conta vê o estoque e o sugerido.
 */
export async function impressoraParaSolicitacao(
  tx: Transacao,
  leitor: LeitorDasSolicitacoes,
  ativoId: string,
): Promise<z.infer<typeof ImpressoraParaSolicitacao>> {
  const conferencia = await conferirAtivo(tx, ativoId, leitor);
  if ('recusa' in conferencia) {
    if (conferencia.recusa === 'inativo') throw conflito(MENSAGEM_DO_ATIVO_INATIVO);
    throw naoEncontrado('Impressora não encontrada.');
  }
  const { ativo } = conferencia;
  if (!ativo.usaConsumiveis) {
    throw conflito(mensagemDoAtivoSemConsumiveis(ativo.patrimonio ?? ativo.rotulo));
  }
  const contador = await lerContador(tx, ativo.id);
  const compativeis = ativo.modeloId
    ? await compativeisDoModelo(
        tx,
        ativo.modeloId,
        alcance(leitor.acesso, 'estoque.ver', leitor.arvore),
      )
    : [];
  const paraSugestao = compativeis.map((compativel) => ({ ...compativel, ativo: true }));
  return {
    ativo: { id: ativo.id, rotulo: ativo.rotulo, patrimonio: ativo.patrimonio, abrir: true },
    local: ativo.localId
      ? { id: ativo.localId, caminho: leitor.arvore.caminho(ativo.localId) }
      : null,
    contador: contador
      ? { paginas: contador.paginas, lidoEm: contador.lidoEm.toISOString() }
      : null,
    cores: CORES_DE_CONSUMIVEL.map((cor) => ({
      cor,
      sugerido: sugestaoDoConsumivel(paraSugestao, cor),
      compativeis: compativeis
        .filter((compativel) => compativel.cor === cor)
        .map(({ id, codigo, nome, saldo }) => ({ id, codigo, nome, saldo })),
    })),
  };
}
