// A manutenção diária (spec fila-de-tarefas; design do F2c, decisão 16). A `manutencao-diaria`
// roda às 3h30 de São Paulo e põe uma `manutencao` para cada organização, com a chave do dia. Cada
// uma roda na organização dela: apaga os eventos de mais de 24 h e, do armazenamento, os arquivos
// removidos, em lotes, marcando quando; descarta as importações em rascunho de mais de 7 dias, sem
// o conteúdo da planilha (design do P1e); guarda os agregados por hora das leituras (design do P2b,
// decisão 9) e só então apaga, em blocos, as leituras da coleta e as chaves dos lotes com mais de 30
// dias, deixando o estado atual (design do P2a), os agregados com mais de 13 meses, as notificações
// com mais de 90 dias, lidas ou não (design do P3b, decisão 12), os alertas resolvidos há mais de
// 13 meses (design do P3d, decisão 5) e os rascunhos dos cadastros parados há mais de 30 dias
// (change cadastro-em-etapas, decisão 10). Apagar o que já não existe não é erro, e agregar de novo
// regrava o mesmo, então rodar de novo dá o mesmo resultado. Não grava auditoria, porque a retenção
// não é uma ação de alguém; o log diz quanto saiu, e o rascunho descartado avisa quem importou.
import {
  arquivos,
  type Banco,
  eventos,
  importacoes,
  lotesDaColeta,
  naOrganizacao,
  rascunhosDeCadastro,
} from '@grafite/db';
import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { chaveDoArquivo, VARIANTES, type Variante } from '../arquivos/armazenamento.ts';
import { avisarQuemImportou } from '../eventos/importacoes.ts';
import { FILA_DAS_FALHAS } from './falhas.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from './tarefas.ts';

const VALIDADE_DOS_EVENTOS = 24 * 60 * 60_000;
/** Por quanto tempo o rascunho de uma importação fica guardado sem ser aplicado. */
const VALIDADE_DO_RASCUNHO = 7 * 24 * 60 * 60_000;
const LOTE_DE_ARQUIVOS = 500;
/** Por quanto tempo as leituras da coleta e as chaves dos lotes ficam guardadas. */
const VALIDADE_DAS_LEITURAS = 30 * 24 * 60 * 60_000;
/** Quantas leituras cada `delete` apaga, para não travar a coleta por muito tempo. */
const LOTE_DE_LEITURAS = 10_000;
/** Por quanto tempo os agregados por hora ficam guardados. */
const VALIDADE_DOS_AGREGADOS = '13 months';
/** Por quanto tempo as notificações das contas ficam guardadas, lidas ou não. */
const VALIDADE_DAS_NOTIFICACOES = 90 * 24 * 60 * 60_000;
/** Por quanto tempo os alertas resolvidos ficam guardados, depois do fim. */
const VALIDADE_DOS_ALERTAS_RESOLVIDOS = '13 months';
/** Por quanto tempo o rascunho de um cadastro fica guardado sem mudar. */
const VALIDADE_DO_RASCUNHO_DE_CADASTRO = 30 * 24 * 60 * 60_000;
const DIA = 24 * 60 * 60;
const FUSO = 'America/Sao_Paulo';

/** As organizações ativas, pela consulta que atravessa organizações só para as tarefas. */
async function organizacoes(banco: Banco): Promise<string[]> {
  const { rows } = await banco.execute<{ id: string }>(
    sql`select id from app.organizacoes_para_tarefas() as t(id)`,
  );
  return rows.map((linha) => linha.id);
}

/** A data em São Paulo, como "2026-10-07": a chave do dia da manutenção. */
const diaEmSaoPaulo = (momento: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(momento);

async function apagarEventosAntigos(banco: Banco, orgId: string, momento: Date) {
  const limite = new Date(momento.getTime() - VALIDADE_DOS_EVENTOS);
  const apagados = await naOrganizacao(banco, orgId, (tx) =>
    tx.delete(eventos).where(lt(eventos.momento, limite)).returning({ id: eventos.id }),
  );
  return apagados.length;
}

/**
 * Apaga os rascunhos dos cadastros parados há mais de 30 dias, pelo índice da data (change
 * cadastro-em-etapas, design, decisão 10). Eles são poucos, um por conta, e saem de uma vez.
 */
async function apagarRascunhosDeCadastroParados(banco: Banco, orgId: string, momento: Date) {
  const limite = new Date(momento.getTime() - VALIDADE_DO_RASCUNHO_DE_CADASTRO);
  const apagados = await naOrganizacao(banco, orgId, (tx) =>
    tx
      .delete(rascunhosDeCadastro)
      .where(lt(rascunhosDeCadastro.atualizadoEm, limite))
      .returning({ id: rascunhosDeCadastro.id }),
  );
  return apagados.length;
}

async function descartarRascunhosEsquecidos(banco: Banco, orgId: string, momento: Date) {
  const limite = new Date(momento.getTime() - VALIDADE_DO_RASCUNHO);
  return naOrganizacao(banco, orgId, async (tx) => {
    const descartados = await tx
      .update(importacoes)
      .set({ situacao: 'descartada', conteudo: null, atualizadaEm: momento })
      .where(and(eq(importacoes.situacao, 'rascunho'), lt(importacoes.criadaEm, limite)))
      .returning({ id: importacoes.id, criadaPor: importacoes.criadaPor });
    for (const descartado of descartados) await avisarQuemImportou(tx, descartado);
    return descartados.length;
  });
}

/**
 * Os agregados por hora, numa consulta só (spec leituras-e-estado, "Agregados por hora"; design do
 * P2b, decisão 9): as horas completas desde a última hora agregada, que entra de novo, ou desde a
 * leitura mais antiga, quando ainda não há agregado. De cada ativo, métrica, item e hora: quantas
 * leituras e quantas válidas, o mínimo, o máximo e a média dos valores válidos, e o último valor
 * válido, com o momento dele. A hora sem leitura válida fica sem os valores. O `on conflict` torna a
 * repetição idempotente. Devolve quantos agregados gravou.
 */
async function agregarLeituras(banco: Banco, orgId: string, momento: Date) {
  const resultado = await naOrganizacao(banco, orgId, (tx) =>
    tx.execute(sql`
      insert into leituras_por_hora
        (org_id, ativo_id, metrica, item, hora, leituras, validas, minimo, maximo, media, ultimo,
         ultimo_momento)
      select app.current_org(), l.ativo_id, l.metrica, l.item, date_trunc('hour', l.momento, 'UTC'),
        count(*),
        count(*) filter (where l.situacao = 'valida'),
        min(l.valor_numero) filter (where l.situacao = 'valida'),
        max(l.valor_numero) filter (where l.situacao = 'valida'),
        avg(l.valor_numero) filter (where l.situacao = 'valida'),
        (array_agg(l.valor_numero order by l.momento desc)
          filter (where l.situacao = 'valida' and l.valor_numero is not null))[1],
        (array_agg(l.momento order by l.momento desc)
          filter (where l.situacao = 'valida' and l.valor_numero is not null))[1]
      from leituras l
      where l.momento >= coalesce(
          (select max(a.hora) from leituras_por_hora a),
          (select date_trunc('hour', min(d.momento), 'UTC') from leituras d))
        and l.momento < date_trunc('hour', ${momento}::timestamptz, 'UTC')
      group by l.ativo_id, l.metrica, l.item, date_trunc('hour', l.momento, 'UTC')
      on conflict (org_id, ativo_id, metrica, item, hora) do update set
        leituras = excluded.leituras,
        validas = excluded.validas,
        minimo = excluded.minimo,
        maximo = excluded.maximo,
        media = excluded.media,
        ultimo = excluded.ultimo,
        ultimo_momento = excluded.ultimo_momento`),
  );
  return resultado.rowCount ?? 0;
}

/** Apaga, em blocos, os agregados por hora com mais de 13 meses. */
async function apagarAgregadosAntigos(
  banco: Banco,
  orgId: string,
  momento: Date,
  sinal: AbortSignal,
) {
  let agregados = 0;
  while (!sinal.aborted) {
    const apagados = await naOrganizacao(banco, orgId, (tx) =>
      tx.execute(sql`
        delete from leituras_por_hora
         where id in (select id from leituras_por_hora
                       where hora < ${momento}::timestamptz - ${VALIDADE_DOS_AGREGADOS}::interval
                       limit ${LOTE_DE_LEITURAS})`),
    );
    const quantos = apagados.rowCount ?? 0;
    agregados += quantos;
    if (quantos < LOTE_DE_LEITURAS) break;
  }
  return agregados;
}

/** Apaga, em blocos, as notificações com mais de 90 dias, pelo índice do momento. */
async function apagarNotificacoesAntigas(
  banco: Banco,
  orgId: string,
  momento: Date,
  sinal: AbortSignal,
) {
  const limite = new Date(momento.getTime() - VALIDADE_DAS_NOTIFICACOES);
  let total = 0;
  while (!sinal.aborted) {
    const apagadas = await naOrganizacao(banco, orgId, (tx) =>
      tx.execute(sql`
        delete from notificacoes
         where id in (select id from notificacoes where criada_em < ${limite} limit ${LOTE_DE_LEITURAS})`),
    );
    const quantas = apagadas.rowCount ?? 0;
    total += quantas;
    if (quantas < LOTE_DE_LEITURAS) break;
  }
  return total;
}

/**
 * Apaga, em blocos, os alertas resolvidos há mais de 13 meses, pelo índice dos resolvidos. Só os que
 * nenhuma notificação cita: as notificações saem em 90 dias, e a condição só protege a chave
 * estrangeira. O que a auditoria registrou sobre eles fica.
 */
async function apagarAlertasResolvidosAntigos(
  banco: Banco,
  orgId: string,
  momento: Date,
  sinal: AbortSignal,
) {
  let total = 0;
  while (!sinal.aborted) {
    const apagados = await naOrganizacao(banco, orgId, (tx) =>
      tx.execute(sql`
        delete from alertas
         where id in (select a.id from alertas a
                       where a.situacao = 'resolvido'
                         and a.resolvido_em < ${momento}::timestamptz - ${VALIDADE_DOS_ALERTAS_RESOLVIDOS}::interval
                         and not exists (select 1 from notificacoes n where n.alerta_id = a.id)
                       limit ${LOTE_DE_LEITURAS})`),
    );
    const quantos = apagados.rowCount ?? 0;
    total += quantos;
    if (quantos < LOTE_DE_LEITURAS) break;
  }
  return total;
}

async function apagarLeiturasAntigas(
  banco: Banco,
  orgId: string,
  momento: Date,
  sinal: AbortSignal,
) {
  const limite = new Date(momento.getTime() - VALIDADE_DAS_LEITURAS);
  let leituras = 0;
  while (!sinal.aborted) {
    const apagadas = await naOrganizacao(banco, orgId, (tx) =>
      tx.execute(sql`
        delete from leituras
         where id in (select id from leituras where momento < ${limite} limit ${LOTE_DE_LEITURAS})`),
    );
    const quantas = apagadas.rowCount ?? 0;
    leituras += quantas;
    if (quantas < LOTE_DE_LEITURAS) break;
  }
  const lotes = await naOrganizacao(banco, orgId, (tx) =>
    tx
      .delete(lotesDaColeta)
      .where(lt(lotesDaColeta.recebidoEm, limite))
      .returning({ id: lotesDaColeta.id }),
  );
  return { leituras, lotes: lotes.length };
}

async function apagarArquivosRemovidos(
  { banco, armazenamento }: ContextoDasTarefas,
  orgId: string,
  momento: Date,
  sinal: AbortSignal,
) {
  let total = 0;
  while (!sinal.aborted) {
    const lote = await naOrganizacao(banco, orgId, (tx) =>
      tx
        .select({ id: arquivos.id, variantes: arquivos.variantes })
        .from(arquivos)
        .where(and(isNotNull(arquivos.removidoEm), isNull(arquivos.apagadoEm)))
        .orderBy(asc(arquivos.removidoEm))
        .limit(LOTE_DE_ARQUIVOS),
    );
    if (lote.length === 0) break;
    for (const arquivo of lote) {
      for (const variante of arquivo.variantes) {
        if (!VARIANTES.includes(variante as Variante)) continue;
        await armazenamento.apagar(chaveDoArquivo(orgId, arquivo.id, variante as Variante));
      }
    }
    await naOrganizacao(banco, orgId, (tx) =>
      tx
        .update(arquivos)
        .set({ apagadoEm: momento })
        .where(
          inArray(
            arquivos.id,
            lote.map((arquivo) => arquivo.id),
          ),
        ),
    );
    total += lote.length;
    if (lote.length < LOTE_DE_ARQUIVOS) break;
  }
  return total;
}

export function tarefasDaManutencao(contexto: ContextoDasTarefas): DefinicaoDeTarefa[] {
  const { banco, agora, log, enviar } = contexto;

  const diaria: DefinicaoDeTarefa<unknown> = {
    nome: 'manutencao-diaria',
    rotulo: 'Distribuição da manutenção diária',
    rotina: {
      nome: 'Manutenção diária',
      descricao:
        'Apaga o que venceu em cada organização: os eventos, os rascunhos, as leituras antigas, as notificações e os alertas resolvidos há mais de 13 meses.',
    },
    dados: z.unknown(),
    agenda: { cron: '30 3 * * *', fuso: FUSO },
    opcoes: { deadLetter: FILA_DAS_FALHAS },
    async trabalho() {
      const dia = diaEmSaoPaulo(agora());
      const daInstalacao = await organizacoes(banco);
      for (const orgId of daInstalacao) {
        await enviar('manutencao', { orgId }, { chaveUnica: `${orgId}:${dia}`, unicaPor: DIA });
      }
      log.info({ dia, organizacoes: daInstalacao.length }, 'manutenção diária distribuída');
    },
  };

  const daOrganizacao: DefinicaoDeTarefa<{ orgId: string }> = {
    nome: 'manutencao',
    rotulo: 'Manutenção diária',
    dados: z.object({ orgId: z.uuid() }),
    // Cinco novas tentativas, a partir de 1 min, dobrando com uma variação, até 1 h; depois, a
    // lista das tarefas com falha.
    opcoes: {
      retryLimit: 5,
      retryDelay: 60,
      retryBackoff: true,
      retryDelayMax: 60 * 60,
      deadLetter: FILA_DAS_FALHAS,
    },
    async trabalho({ orgId }, { sinal }) {
      const momento = agora();
      const eventosApagados = await apagarEventosAntigos(banco, orgId, momento);
      const arquivosApagados = await apagarArquivosRemovidos(contexto, orgId, momento, sinal);
      const rascunhosDescartados = await descartarRascunhosEsquecidos(banco, orgId, momento);
      const cadastrosParados = await apagarRascunhosDeCadastroParados(banco, orgId, momento);
      // Os agregados antes: a leitura apagada já está no agregado da hora dela.
      const agregados = await agregarLeituras(banco, orgId, momento);
      const daColeta = await apagarLeiturasAntigas(banco, orgId, momento, sinal);
      const agregadosApagados = await apagarAgregadosAntigos(banco, orgId, momento, sinal);
      const notificacoesApagadas = await apagarNotificacoesAntigas(banco, orgId, momento, sinal);
      // Os alertas depois das notificações, que os citam.
      const alertasApagados = await apagarAlertasResolvidosAntigos(banco, orgId, momento, sinal);
      log.info(
        {
          orgId,
          eventos: eventosApagados,
          arquivos: arquivosApagados,
          rascunhos: rascunhosDescartados,
          rascunhosDeCadastro: cadastrosParados,
          leituras: daColeta.leituras,
          lotes: daColeta.lotes,
          agregados,
          agregadosApagados,
          notificacoes: notificacoesApagadas,
          alertas: alertasApagados,
        },
        'manutenção da organização',
      );
    },
  };

  return [diaria, daOrganizacao];
}
