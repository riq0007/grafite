// O lote do coletor (spec coletor-local, "Lotes de leituras", e leituras-e-estado; design do P2a,
// decisões 4 e 5): numa transação, as leituras na série, o estado atual pela leitura mais recente de
// cada ativo e métrica, com o desde, o evento da disponibilidade só na transição e a chave que prova
// o lote. O reenvio da mesma chave não grava nada, e a leitura de quem não é alvo do coletor é
// ignorada. A leitura atrasada, mais antiga que o estado atual, entra só na série. O número de série
// lido, da impressora (P2b) ou do controle de acesso (P2c), grava o campo do ativo.
import { ativos, estadoDosAtivos, leituras, lotesDaColeta, type Transacao } from '@grafite/db';
import type { LeituraDaColeta, LoteDaColeta } from '@grafite/domain';
import { eq, inArray, sql } from 'drizzle-orm';
import { registrarEvento } from '../eventos/saida.ts';
import { alvosDaColeta, coletaDaMetrica } from './alvos.ts';
import { gravarSeriesDaColeta, type SerieLida } from './serie.ts';

export interface ResultadoDoLote {
  gravadas: number;
  ignoradas: number;
  /** O lote já tinha entrado: nada foi gravado de novo. */
  repetido: boolean;
}

/** O lote que já entrou, pela chave, ou `null`. */
export async function loteRecebido(tx: Transacao, chave: string): Promise<ResultadoDoLote | null> {
  const [lote] = await tx
    .select({ gravadas: lotesDaColeta.gravadas, ignoradas: lotesDaColeta.ignoradas })
    .from(lotesDaColeta)
    .where(eq(lotesDaColeta.chave, chave));
  return lote ? { ...lote, repetido: true } : null;
}

const chaveDoEstado = (ativoId: string, metrica: string, item: string) =>
  `${ativoId}|${metrica}|${item}`;

/**
 * O estado atual pela leitura mais recente de cada ativo, métrica e item do lote, com o desde: a
 * mesma situação mantém o de antes. Devolve os ativos cuja disponibilidade mudou.
 */
async function atualizarEstado(
  tx: Transacao,
  coletorId: string,
  aceitas: readonly LeituraDaColeta[],
): Promise<string[]> {
  const recentes = new Map<string, LeituraDaColeta>();
  for (const leitura of aceitas) {
    const chave = chaveDoEstado(leitura.ativoId, leitura.metrica, leitura.item);
    const guardada = recentes.get(chave);
    if (!guardada || leitura.momento > guardada.momento) recentes.set(chave, leitura);
  }
  const ativoIds = [...new Set(aceitas.map((leitura) => leitura.ativoId))];
  // As linhas travadas: dois lotes do mesmo ativo gravam um depois do outro.
  const atuais = await tx
    .select()
    .from(estadoDosAtivos)
    .where(inArray(estadoDosAtivos.ativoId, ativoIds))
    .for('update');
  const porChave = new Map(
    atuais.map((estado) => [chaveDoEstado(estado.ativoId, estado.metrica, estado.item), estado]),
  );
  const linhas: Omit<typeof estadoDosAtivos.$inferInsert, 'orgId'>[] = [];
  const mudaram: string[] = [];
  for (const [chave, leitura] of recentes) {
    const atual = porChave.get(chave);
    if (atual && leitura.momento.getTime() <= atual.momento.getTime()) continue;
    const mesma =
      atual !== undefined &&
      atual.situacao === leitura.situacao &&
      atual.valorTexto === leitura.valorTexto;
    linhas.push({
      ativoId: leitura.ativoId,
      metrica: leitura.metrica,
      item: leitura.item,
      momento: leitura.momento,
      valorNumero: leitura.valorNumero,
      valorTexto: leitura.valorTexto,
      situacao: leitura.situacao,
      detalhes: leitura.detalhes,
      desde: mesma && atual ? atual.desde : leitura.momento,
      coletorId,
    });
    if (leitura.metrica === 'rede.disponibilidade' && !mesma) mudaram.push(leitura.ativoId);
  }
  if (linhas.length > 0) {
    await tx
      .insert(estadoDosAtivos)
      .values(linhas.map((linha) => ({ ...linha, orgId: sql`app.current_org()` })))
      .onConflictDoUpdate({
        target: [
          estadoDosAtivos.orgId,
          estadoDosAtivos.ativoId,
          estadoDosAtivos.metrica,
          estadoDosAtivos.item,
        ],
        set: {
          momento: sql`excluded.momento`,
          valorNumero: sql`excluded.valor_numero`,
          valorTexto: sql`excluded.valor_texto`,
          situacao: sql`excluded.situacao`,
          detalhes: sql`excluded.detalhes`,
          desde: sql`excluded.desde`,
          coletorId: sql`excluded.coletor_id`,
        },
      });
  }
  return mudaram;
}

/** As métricas que trazem o número de série lido: o da impressora e o do controle de acesso. */
const METRICAS_DE_SERIE: ReadonlySet<string> = new Set(['impressora.serie', 'controlid.serie']);

/** A série mais recente de cada ativo entre as leituras válidas do lote. */
function seriesDoLote(aceitas: readonly LeituraDaColeta[]): Map<string, SerieLida> {
  const series = new Map<string, SerieLida>();
  for (const leitura of aceitas) {
    if (!METRICAS_DE_SERIE.has(leitura.metrica) || leitura.situacao !== 'valida') continue;
    if (!leitura.valorTexto) continue;
    const guardada = series.get(leitura.ativoId);
    if (!guardada || leitura.momento > guardada.momento) {
      series.set(leitura.ativoId, { serie: leitura.valorTexto, momento: leitura.momento });
    }
  }
  return series;
}

/**
 * Grava o lote aceito pela organização do contexto, com o que o coletor do token alcança: cada
 * leitura vale só se o ativo é alvo, para esse coletor, da coleta que dá a métrica dela (design do
 * P2b, decisão 7), e a série lida grava o Número de série.
 */
export async function gravarLote(
  tx: Transacao,
  {
    coletor,
    lote,
    moduloLigado,
    momento,
  }: {
    coletor: { id: string; nome: string };
    lote: LoteDaColeta;
    moduloLigado: boolean;
    /** O momento do pedido, para a auditoria do que a coleta grava no ativo. */
    momento: Date;
  },
): Promise<ResultadoDoLote> {
  const coletorId = coletor.id;
  const anterior = await loteRecebido(tx, lote.chave);
  if (anterior) return anterior;
  const ativoIds = [...new Set(lote.leituras.map((leitura) => leitura.ativoId))];
  const alvos = moduloLigado ? await alvosDaColeta(tx, { ativoIds }) : [];
  const doColetor = new Set(
    alvos
      .filter((alvo) => alvo.coletorId === coletorId)
      .map((alvo) => `${alvo.ativoId}|${alvo.coleta}`),
  );
  const aceitas = lote.leituras.filter((leitura) =>
    doColetor.has(`${leitura.ativoId}|${coletaDaMetrica(leitura.metrica)}`),
  );
  const ignoradas = lote.leituras.length - aceitas.length;
  if (aceitas.length > 0) {
    await tx.insert(leituras).values(
      aceitas.map((leitura) => ({
        orgId: sql`app.current_org()`,
        ativoId: leitura.ativoId,
        metrica: leitura.metrica,
        item: leitura.item,
        momento: leitura.momento,
        valorNumero: leitura.valorNumero,
        valorTexto: leitura.valorTexto,
        situacao: leitura.situacao,
        detalhes: leitura.detalhes,
        coletorId,
      })),
    );
    const mudaram = await atualizarEstado(tx, coletorId, aceitas);
    await gravarSeriesDaColeta(tx, { coletor, series: seriesDoLote(aceitas), momento });
    if (mudaram.length > 0) {
      const locais = await tx
        .select({ id: ativos.id, localId: ativos.localId })
        .from(ativos)
        .where(inArray(ativos.id, mudaram));
      for (const { id, localId } of locais) {
        await registrarEvento(tx, {
          tipo: 'disponibilidade.mudou',
          alvo: { tipo: 'ativo', id },
          publico: { permissao: 'ativos.ver', locais: [localId] },
        });
      }
    }
  }
  await tx.insert(lotesDaColeta).values({
    orgId: sql`app.current_org()`,
    coletorId,
    chave: lote.chave,
    gravadas: aceitas.length,
    ignoradas,
  });
  return { gravadas: aceitas.length, ignoradas, repetido: false };
}
