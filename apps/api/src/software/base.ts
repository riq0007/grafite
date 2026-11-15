// A base de software frente ao inventário (spec distribuicao-de-software, "Pacote frente ao
// inventário"; change software-por-pacote, design, decisões 1, 2 e 10): as máquinas da conta, que
// são os ativos ativos com o agente ligado nos locais em que ela distribui; as versões dos programas
// de cada uma que casam com cada pacote, com o casamento no banco; e as distribuições dos pacotes,
// com o "Para quem".
import {
  agentes,
  ativos,
  distribuicoes,
  maquinasDasDistribuicoes,
  pacotesDeSoftware,
  softwaresDosAtivos,
  type Transacao,
} from '@grafite/db';
import { type Acesso, alcance, type SituacaoDaMaquina, semContato } from '@grafite/domain';
import { and, count, desc, eq, exists, inArray, type SQL, sql } from 'drizzle-orm';
import { lerCadastroDosAgentes } from '../agentes/cadastro.ts';
import { lerArvore } from '../arvore.ts';

const programa = sql`${softwaresDosAtivos.nomeNormalizado}`;
const doPacote = sql`${pacotesDeSoftware.nomeNoInventarioNormalizado}`;

/**
 * O programa do inventário que casa com o nome no inventário do pacote: igual a ele, ou começando
 * por ele seguido de um espaço e de um algarismo ou de "(". A faixa em bytes, de "nome" até
 * "nome!", que o índice percorre, contém os dois casos; o `starts_with` e o caractere seguinte
 * conferem dentro dela, sem o `LIKE`, porque o nome pode ter "%" e "_".
 */
const casaNoBanco = sql`(${programa} collate "C") >= (${doPacote} collate "C")
  and (${programa} collate "C") < ((${doPacote} || '!') collate "C")
  and (${programa} = ${doPacote}
    or (starts_with(${programa}, ${doPacote} || ' ')
      and substr(${programa}, char_length(${doPacote}) + 2, 1) ~ '[0-9(]'))`;

/** As máquinas da conta, como condição sobre `ativos`; `null` quando ela não distribui em lugar nenhum. */
async function maquinasDaConta(tx: Transacao, acesso: Acesso): Promise<SQL | null> {
  const doDistribuir = alcance(acesso, 'software.distribuir', await lerArvore(tx));
  if (doDistribuir === null) return null;
  const condicoes = [
    eq(ativos.situacao, 'ativo'),
    exists(
      tx
        .select({ um: sql`1` })
        .from(agentes)
        .where(and(eq(agentes.orgId, ativos.orgId), eq(agentes.ativoId, ativos.id))),
    ),
  ];
  if (doDistribuir !== 'organizacao') condicoes.push(inArray(ativos.localId, [...doDistribuir]));
  return and(...condicoes) ?? null;
}

/**
 * Quantas máquinas a conta tem e, de cada pacote (ou só do pedido), as versões dos programas que
 * casam com ele em cada máquina dela que tem o programa.
 */
export async function instalacoesNaConta(
  tx: Transacao,
  acesso: Acesso,
  pacoteId?: string,
): Promise<{ maquinas: number; porPacote: Map<string, (string | null)[][]> }> {
  const daConta = await maquinasDaConta(tx, acesso);
  if (!daConta) return { maquinas: 0, porPacote: new Map() };
  const [total] = await tx.select({ quantas: count() }).from(ativos).where(daConta);
  const linhas = await tx
    .select({
      pacoteId: pacotesDeSoftware.id,
      ativoId: softwaresDosAtivos.ativoId,
      versao: softwaresDosAtivos.versao,
    })
    .from(pacotesDeSoftware)
    .innerJoin(
      softwaresDosAtivos,
      and(eq(softwaresDosAtivos.orgId, pacotesDeSoftware.orgId), casaNoBanco),
    )
    .innerJoin(
      ativos,
      and(eq(ativos.orgId, softwaresDosAtivos.orgId), eq(ativos.id, softwaresDosAtivos.ativoId)),
    )
    .where(and(daConta, pacoteId ? eq(pacotesDeSoftware.id, pacoteId) : undefined));
  const porMaquina = new Map<string, Map<string, (string | null)[]>>();
  for (const linha of linhas) {
    const doPacote = porMaquina.get(linha.pacoteId) ?? new Map<string, (string | null)[]>();
    porMaquina.set(linha.pacoteId, doPacote);
    doPacote.set(linha.ativoId, [...(doPacote.get(linha.ativoId) ?? []), linha.versao]);
  }
  return {
    maquinas: total?.quantas ?? 0,
    porPacote: new Map([...porMaquina].map(([id, maquinas]) => [id, [...maquinas.values()]])),
  };
}

/** As versões dos programas que casam com o pacote em cada máquina dada que tem o programa. */
export async function versoesDoPacoteNasMaquinas(
  tx: Transacao,
  pacoteId: string,
  ativoIds: readonly string[],
): Promise<Map<string, (string | null)[]>> {
  const porMaquina = new Map<string, (string | null)[]>();
  if (ativoIds.length === 0) return porMaquina;
  const linhas = await tx
    .select({ ativoId: softwaresDosAtivos.ativoId, versao: softwaresDosAtivos.versao })
    .from(pacotesDeSoftware)
    .innerJoin(
      softwaresDosAtivos,
      and(eq(softwaresDosAtivos.orgId, pacotesDeSoftware.orgId), casaNoBanco),
    )
    .where(
      and(eq(pacotesDeSoftware.id, pacoteId), inArray(softwaresDosAtivos.ativoId, [...ativoIds])),
    );
  for (const { ativoId, versao } of linhas) {
    porMaquina.set(ativoId, [...(porMaquina.get(ativoId) ?? []), versao]);
  }
  return porMaquina;
}

/** O "Para quem" da distribuição; a de antes da change software-por-pacote diz quantas máquinas. */
export const paraQuemNaTela = (paraQuem: string | null, maquinas: number): string =>
  paraQuem ?? `${maquinas} ${maquinas === 1 ? 'máquina' : 'máquinas'}`;

/** As máquinas da distribuição em cada situação, para os rótulos do resultado. */
export interface ResultadoDaDistribuicao {
  concluidas: number;
  emAndamento: number;
  aguardando: number;
  falharam: number;
  tiradas: number;
}

const CAMPO_DA_SITUACAO: Record<SituacaoDaMaquina, keyof ResultadoDaDistribuicao> = {
  concluida: 'concluidas',
  'em-andamento': 'emAndamento',
  aguardando: 'aguardando',
  falhou: 'falharam',
  tirada: 'tiradas',
};

/** Quantas máquinas cada distribuição tem, em cada situação. */
async function situacoesDas(tx: Transacao, ids: readonly string[]) {
  const porDistribuicao = new Map<string, ResultadoDaDistribuicao>();
  if (ids.length === 0) return porDistribuicao;
  const linhas = await tx
    .select({
      distribuicaoId: maquinasDasDistribuicoes.distribuicaoId,
      situacao: maquinasDasDistribuicoes.situacao,
      quantas: count(),
    })
    .from(maquinasDasDistribuicoes)
    .where(inArray(maquinasDasDistribuicoes.distribuicaoId, [...ids]))
    .groupBy(maquinasDasDistribuicoes.distribuicaoId, maquinasDasDistribuicoes.situacao);
  for (const { distribuicaoId, situacao, quantas } of linhas) {
    const resultado = porDistribuicao.get(distribuicaoId) ?? {
      concluidas: 0,
      emAndamento: 0,
      aguardando: 0,
      falharam: 0,
      tiradas: 0,
    };
    resultado[CAMPO_DA_SITUACAO[situacao]] += quantas;
    porDistribuicao.set(distribuicaoId, resultado);
  }
  return porDistribuicao;
}

const somaDas = (resultado: ResultadoDaDistribuicao | undefined) =>
  resultado ? Object.values(resultado).reduce((soma, quantas) => soma + quantas, 0) : 0;

/** A última distribuição de cada pacote, com o "Para quem", pela id do pacote. */
export async function ultimasDistribuicoes(
  tx: Transacao,
): Promise<Map<string, { id: string; criadaEm: string; paraQuem: string }>> {
  const linhas = await tx
    .selectDistinctOn([distribuicoes.pacoteId], {
      id: distribuicoes.id,
      pacoteId: distribuicoes.pacoteId,
      criadaEm: distribuicoes.criadaEm,
      paraQuem: distribuicoes.paraQuem,
    })
    .from(distribuicoes)
    .orderBy(distribuicoes.pacoteId, desc(distribuicoes.criadaEm), desc(distribuicoes.id));
  const situacoes = await situacoesDas(
    tx,
    linhas.filter(({ paraQuem }) => paraQuem === null).map(({ id }) => id),
  );
  return new Map(
    linhas.map((linha) => [
      linha.pacoteId,
      {
        id: linha.id,
        criadaEm: linha.criadaEm.toISOString(),
        paraQuem: paraQuemNaTela(linha.paraQuem, somaDas(situacoes.get(linha.id))),
      },
    ]),
  );
}

/** Quantas distribuições a ficha do pacote mostra, das mais novas. */
const DISTRIBUICOES_NA_FICHA = 50;

/** As distribuições do pacote, da mais nova para a mais antiga, com o resultado de cada uma. */
/** Das que aguardam em cada distribuição, quantas têm o agente sem contato pelo prazo da organização. */
async function semContatoDas(tx: Transacao, ids: readonly string[], momento: Date) {
  const porDistribuicao = new Map<string, number>();
  if (ids.length === 0) return porDistribuicao;
  const { diasSemContato } = await lerCadastroDosAgentes(tx);
  const linhas = await tx
    .select({
      distribuicaoId: maquinasDasDistribuicoes.distribuicaoId,
      ultimoContato: agentes.ultimoContato,
    })
    .from(maquinasDasDistribuicoes)
    .innerJoin(agentes, eq(agentes.id, maquinasDasDistribuicoes.agenteId))
    .where(
      and(
        inArray(maquinasDasDistribuicoes.distribuicaoId, [...ids]),
        eq(maquinasDasDistribuicoes.situacao, 'aguardando'),
      ),
    );
  for (const { distribuicaoId, ultimoContato } of linhas) {
    if (!semContato(ultimoContato, momento, diasSemContato).semContato) continue;
    porDistribuicao.set(distribuicaoId, (porDistribuicao.get(distribuicaoId) ?? 0) + 1);
  }
  return porDistribuicao;
}

export async function distribuicoesDoPacote(tx: Transacao, pacoteId: string, momento: Date) {
  const linhas = await tx
    .select({
      id: distribuicoes.id,
      criadaEm: distribuicoes.criadaEm,
      paraQuem: distribuicoes.paraQuem,
    })
    .from(distribuicoes)
    .where(eq(distribuicoes.pacoteId, pacoteId))
    .orderBy(desc(distribuicoes.criadaEm), desc(distribuicoes.id))
    .limit(DISTRIBUICOES_NA_FICHA);
  const ids = linhas.map(({ id }) => id);
  const situacoes = await situacoesDas(tx, ids);
  const longe = await semContatoDas(tx, ids, momento);
  return linhas.map((linha) => {
    const resultado = situacoes.get(linha.id) ?? {
      concluidas: 0,
      emAndamento: 0,
      aguardando: 0,
      falharam: 0,
      tiradas: 0,
    };
    const maquinas = somaDas(resultado);
    return {
      id: linha.id,
      criadaEm: linha.criadaEm.toISOString(),
      paraQuem: paraQuemNaTela(linha.paraQuem, maquinas),
      maquinas,
      resultado: { ...resultado, semContato: longe.get(linha.id) ?? 0 },
    };
  });
}
