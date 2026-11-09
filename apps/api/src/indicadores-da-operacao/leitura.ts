// A leitura dos indicadores da operação (spec indicadores-da-operacao; change
// p4f-indicadores-da-operacao, design, decisões 1 e 2): as OS que tocam os últimos 60 dias, com o
// histórico, pelo alcance de `ordens.ver`, e as saídas de toner dos 60 dias, com a anterior de cada
// impressora em cada cor, marcadas pelo alcance de `estoque.ver` na origem. Todas as saídas entram
// na conta, para a vida de cada toner ir até a troca certa; só a troca que a conta vê conta. Sem a
// conta, como na avaliação diária, vale a organização inteira. O cálculo é o do domínio.
import {
  ativos,
  consumiveis,
  historicoDasOrdens,
  modelos,
  movimentosDoEstoque,
  ordensDeServico,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  calcularIndicadoresDaOperacao,
  type IndicadoresDaOperacaoCalculados,
  type OrdemParaOsIndicadores,
  periodoDosIndicadores,
  rotuloDoAtivo,
  type SaidaDeTonerParaOsIndicadores,
  SITUACOES_EM_ABERTO,
} from '@grafite/domain';
import { and, desc, eq, gte, inArray, isNotNull, lt, or, type SQL, sql } from 'drizzle-orm';
import { metasDaOrganizacao } from '../alertas/indicadores.ts';
import { localEm } from '../estoque/leitura.ts';

/** O ativo ou a impressora nas listas dos indicadores da operação. */
export interface AtivoDoIndicadorDaOperacao {
  id: string;
  /** O rótulo do ativo: o nome, o fabricante e o modelo, ou o tipo. */
  nome: string;
  patrimonio: string | null;
  /** O caminho do local atual do ativo, ou nulo no ativo sem local. */
  local: string | null;
}

type Alcance = ReturnType<typeof alcance>;

/** Os ativos pelo id, com o rótulo, o patrimônio e o caminho do local atual. */
async function lerAtivos(
  tx: Transacao,
  ids: readonly string[],
  arvore: ArvoreDeLocais,
): Promise<Map<string, AtivoDoIndicadorDaOperacao>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
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
    .where(inArray(ativos.id, unicos));
  return new Map(
    linhas.map((linha) => [
      linha.id,
      {
        id: linha.id,
        nome: rotuloDoAtivo({ nome: linha.nome, modelo: linha.modelo, tipo: linha.tipo }),
        patrimonio: linha.patrimonio,
        local: linha.localId ? arvore.caminho(linha.localId) : null,
      },
    ]),
  );
}

/**
 * As OS que tocam os 60 dias: as abertas neles, as resolvidas neles e as ainda em aberto, no
 * alcance de quem vê as OS, pelo local guardado na abertura; a sem local, pela organização inteira.
 */
async function ordensDosIndicadores(
  tx: Transacao,
  { agora, arvore, doVer }: { agora: Date; arvore: ArvoreDeLocais; doVer: Alcance },
): Promise<OrdemParaOsIndicadores<AtivoDoIndicadorDaOperacao>[]> {
  if (doVer === null) return [];
  const { inicioDoAnterior } = periodoDosIndicadores(agora);
  const condicoes: SQL[] = [
    or(
      gte(ordensDeServico.abertaEm, inicioDoAnterior),
      gte(ordensDeServico.resolvidaEm, inicioDoAnterior),
      inArray(ordensDeServico.situacao, [...SITUACOES_EM_ABERTO]),
    ) as SQL,
  ];
  if (doVer !== 'organizacao') condicoes.push(localEm(ordensDeServico.localId, [...doVer]));
  const linhas = await tx
    .select({
      id: ordensDeServico.id,
      numero: ordensDeServico.numero,
      problema: ordensDeServico.problema,
      situacao: ordensDeServico.situacao,
      ativoId: ordensDeServico.ativoId,
      abertaEm: ordensDeServico.abertaEm,
      resolvidaEm: ordensDeServico.resolvidaEm,
    })
    .from(ordensDeServico)
    .where(and(...condicoes));
  if (linhas.length === 0) return [];
  const historico = await tx
    .select({
      ordemId: historicoDasOrdens.ordemId,
      situacao: historicoDasOrdens.situacao,
      mudadaEm: historicoDasOrdens.mudadaEm,
    })
    .from(historicoDasOrdens)
    .where(
      inArray(
        historicoDasOrdens.ordemId,
        linhas.map(({ id }) => id),
      ),
    );
  const ativosDasOrdens = await lerAtivos(
    tx,
    linhas.map(({ ativoId }) => ativoId),
    arvore,
  );
  return linhas.map((linha) => ({
    id: linha.id,
    numero: linha.numero,
    problema: linha.problema,
    situacao: linha.situacao,
    ativoChave: linha.ativoId,
    ativo: ativosDasOrdens.get(linha.ativoId) ?? {
      id: linha.ativoId,
      nome: '',
      patrimonio: null,
      local: null,
    },
    abertaEm: linha.abertaEm,
    resolvidaEm: linha.resolvidaEm,
    historico: historico
      .filter(({ ordemId }) => ordemId === linha.id)
      .map(({ situacao, mudadaEm }) => ({ situacao, mudadaEm })),
  }));
}

/** A vida de um toner: a impressora com a cor do consumível, ou com o próprio consumível sem cor. */
const chaveDaVida = sql`coalesce(${consumiveis.cor}, 'consumivel:' || ${consumiveis.id}::text)`;

const COLUNAS_DA_SAIDA = {
  id: movimentosDoEstoque.id,
  ativoId: movimentosDoEstoque.ativoId,
  origemId: movimentosDoEstoque.origemId,
  quantidade: movimentosDoEstoque.quantidade,
  momento: movimentosDoEstoque.momento,
  totalDePaginas: movimentosDoEstoque.contadorPaginas,
  consumivel: {
    id: consumiveis.id,
    codigo: consumiveis.codigo,
    cor: consumiveis.cor,
    rendimento: consumiveis.rendimento,
  },
};

/**
 * As saídas de toner para uma impressora: as dos 60 dias e, de cada impressora em cada cor, a
 * última antes deles, que abre a vida do primeiro toner trocado. Cada uma diz se a conta a vê, pela
 * origem no alcance de quem vê o estoque.
 */
async function saidasDosIndicadores(
  tx: Transacao,
  { agora, arvore, doVer }: { agora: Date; arvore: ArvoreDeLocais; doVer: Alcance },
): Promise<SaidaDeTonerParaOsIndicadores<AtivoDoIndicadorDaOperacao>[]> {
  if (doVer === null) return [];
  const { inicioDoAnterior } = periodoDosIndicadores(agora);
  const deToner = and(
    eq(movimentosDoEstoque.tipo, 'saida'),
    isNotNull(movimentosDoEstoque.ativoId),
    eq(consumiveis.tipo, 'toner'),
  );
  const recentes = await tx
    .select(COLUNAS_DA_SAIDA)
    .from(movimentosDoEstoque)
    .innerJoin(consumiveis, eq(consumiveis.id, movimentosDoEstoque.consumivelId))
    .where(and(deToner, gte(movimentosDoEstoque.momento, inicioDoAnterior)));
  const anteriores = await tx
    .selectDistinctOn([movimentosDoEstoque.ativoId, chaveDaVida], COLUNAS_DA_SAIDA)
    .from(movimentosDoEstoque)
    .innerJoin(consumiveis, eq(consumiveis.id, movimentosDoEstoque.consumivelId))
    .where(and(deToner, lt(movimentosDoEstoque.momento, inicioDoAnterior)))
    .orderBy(
      movimentosDoEstoque.ativoId,
      chaveDaVida,
      desc(movimentosDoEstoque.momento),
      desc(movimentosDoEstoque.id),
    );
  const saidas = [...anteriores, ...recentes];
  const impressoras = await lerAtivos(
    tx,
    saidas.map(({ ativoId }) => ativoId ?? ''),
    arvore,
  );
  return saidas.map((saida) => {
    const ativoId = saida.ativoId ?? '';
    return {
      id: saida.id,
      impressoraChave: ativoId,
      impressora: impressoras.get(ativoId) ?? {
        id: ativoId,
        nome: '',
        patrimonio: null,
        local: null,
      },
      consumivel: saida.consumivel,
      quantidade: saida.quantidade,
      momento: saida.momento,
      totalDePaginas: saida.totalDePaginas,
      contaVe: doVer === 'organizacao' || (saida.origemId !== null && doVer.has(saida.origemId)),
    };
  });
}

export interface IndicadoresDaOperacaoLidos {
  metas: Awaited<ReturnType<typeof metasDaOrganizacao>>;
  calculados: IndicadoresDaOperacaoCalculados<
    AtivoDoIndicadorDaOperacao,
    AtivoDoIndicadorDaOperacao
  >;
  /** Os indicadores que a conta vê: os das OS e o das páginas por toner. */
  ve: { ordens: boolean; estoque: boolean };
}

/**
 * Os indicadores da operação no momento dado, com as OS e as saídas que a conta vê, ou, sem a conta,
 * como na avaliação diária, com as da organização inteira.
 */
export async function lerIndicadoresDaOperacao(
  tx: Transacao,
  { agora, arvore, acesso }: { agora: Date; arvore: ArvoreDeLocais; acesso?: Acesso },
): Promise<IndicadoresDaOperacaoLidos> {
  const dasOrdens = acesso ? alcance(acesso, 'ordens.ver', arvore) : 'organizacao';
  const doEstoque = acesso ? alcance(acesso, 'estoque.ver', arvore) : 'organizacao';
  const metas = await metasDaOrganizacao(tx);
  const calculados = calcularIndicadoresDaOperacao(
    {
      ordens: await ordensDosIndicadores(tx, { agora, arvore, doVer: dasOrdens }),
      saidas: await saidasDosIndicadores(tx, { agora, arvore, doVer: doEstoque }),
    },
    { agora, metas },
  );
  return { metas, calculados, ve: { ordens: dasOrdens !== null, estoque: doEstoque !== null } };
}
