// O resumo do ativo ligado na ficha do chamado (spec chamados, "Ativo ligado e campos da TI"; change
// chamados-da-ti, design, decisão 5, "O resumo na ficha (tarefa 4.25)"), a quem vê o chamado, também
// sem `ativos.ver`: a disponibilidade e os suprimentos pelas leituras da ficha do ativo, com o restrito
// só a quem vê os restritos no local dele; a média de páginas por mês; o "Toner crítico" pelo alerta
// aberto, a quem vê os alertas no local dele; as OS do ativo, a quem as vê no local dele; os
// compatíveis com o saldo, o mínimo e o "abaixo", a quem vê o estoque; e a solicitação de Toner
// pendente que o "Pedir toner" juntaria, a quem a vê. Com o Operação desligado, as três últimas vão
// como a quem não as vê, e com o Alertas, o selo; com o Ativos desligado, a ficha não pede o resumo.
import {
  alertas,
  ativos,
  leiturasPorHora,
  ordensDeServico,
  regrasDeAlerta,
  type Transacao,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  comecoDoAno,
  JANELA_DA_MEDIA_DE_PAGINAS,
  paginasPorMes,
  podeEm,
  SITUACOES_EM_ABERTO,
  type SituacaoDaSolicitacao,
  veASolicitacao,
} from '@grafite/domain';
import { and, asc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { DisponibilidadeDoAtivo, SuprimentosDoAtivo } from '../ativos/esquemas.ts';
import { camposRestritos } from '../ativos/leitura.ts';
import { lerContador } from '../coleta/contador.ts';
import { disponibilidadeDosAtivos } from '../coleta/disponibilidade.ts';
import { suprimentosDosAtivos } from '../coleta/suprimentos.ts';
import {
  type CompativelComOMinimo,
  compativeisComOMinimo,
  tipoComCompativeis,
} from '../consumiveis/compativeis.ts';
import { pendenteDa } from './toner.ts';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

export interface ResumoDoAtivo {
  disponibilidade: z.infer<typeof DisponibilidadeDoAtivo> | null;
  suprimentos: z.infer<typeof SuprimentosDoAtivo> | null;
  paginasPorMes: number | null;
  /** Se o ativo tem um alerta do toner aberto, Crítico; nulo a quem não vê os alertas dele. */
  tonerCritico: boolean | null;
  ordens: { abertas: number; concluidas: number } | null;
  compativeis: CompativelComOMinimo[] | null;
  solicitacao: { id: string; numero: number; situacao: SituacaoDaSolicitacao } | null;
}

/** O que o resumo pede da ficha: quem lê, o momento, o fuso da TI e os módulos ligados. */
export interface LeituraDoResumo {
  acesso: Acesso;
  arvore: ArvoreDeLocais;
  agora: Date;
  /** O fuso do horário da TI, que diz quando o ano começa. */
  fuso: string;
  ligado: (modulo: string) => boolean;
}

/**
 * A média de páginas por mês entre o contador de agora e o último valor válido da hora mais antiga
 * dos agregados dos últimos 90 dias, do mesmo item.
 */
async function mediaDoContador(tx: Transacao, ativoId: string, agora: Date) {
  const atual = await lerContador(tx, ativoId);
  if (atual === null) return null;
  const [antes] = await tx
    .select({ paginas: leiturasPorHora.ultimo, momento: leiturasPorHora.ultimoMomento })
    .from(leiturasPorHora)
    .where(
      and(
        eq(leiturasPorHora.ativoId, ativoId),
        eq(leiturasPorHora.metrica, 'impressora.contador'),
        eq(leiturasPorHora.item, atual.item),
        isNotNull(leiturasPorHora.ultimo),
        isNotNull(leiturasPorHora.ultimoMomento),
        gte(
          leiturasPorHora.hora,
          new Date(agora.getTime() - JANELA_DA_MEDIA_DE_PAGINAS * DIA_EM_MS),
        ),
      ),
    )
    .orderBy(asc(leiturasPorHora.hora))
    .limit(1);
  if (!antes || antes.paginas === null || antes.momento === null) return null;
  return paginasPorMes(
    { paginas: antes.paginas, momento: antes.momento },
    { paginas: atual.paginas, momento: atual.lidoEm },
  );
}

/**
 * Se o ativo tem um alerta aberto de uma regra do toner na severidade Crítico, a do selo "Toner
 * crítico": o limite é o da regra da organização, com as exceções dela. O cartão do ativo na
 * mensagem também o lê (`cartao.ts`).
 */
export async function tonerCriticoDo(tx: Transacao, ativoId: string): Promise<boolean> {
  const [alerta] = await tx
    .select({ id: alertas.id })
    .from(alertas)
    .innerJoin(regrasDeAlerta, eq(regrasDeAlerta.id, alertas.regraId))
    .where(
      and(
        eq(alertas.ativoId, ativoId),
        eq(alertas.situacao, 'aberto'),
        eq(alertas.severidade, 'critico'),
        eq(regrasDeAlerta.condicao, 'toner.nivel'),
      ),
    )
    .limit(1);
  return alerta !== undefined;
}

/**
 * As OS do ativo em aberto agora, de qualquer ano, e as concluídas desde o começo do ano: as
 * resolvidas e as encerradas, pela resolução ou, sem ela, pelo encerramento.
 */
async function ordensDoAtivo(tx: Transacao, ativoId: string, desde: Date) {
  const emAberto = inArray(ordensDeServico.situacao, [...SITUACOES_EM_ABERTO]);
  const concluida = inArray(ordensDeServico.situacao, ['resolvida', 'encerrada']);
  const concluidaEm = sql`coalesce(${ordensDeServico.resolvidaEm}, ${ordensDeServico.encerradaEm})`;
  const [contagem] = await tx
    .select({
      abertas: sql<number>`(count(*) filter (where ${emAberto}))::int`,
      concluidas: sql<number>`(count(*) filter (where ${concluida}
        and ${concluidaEm} >= ${desde.toISOString()}::timestamptz))::int`,
    })
    .from(ordensDeServico)
    .where(eq(ordensDeServico.ativoId, ativoId));
  return { abertas: contagem?.abertas ?? 0, concluidas: contagem?.concluidas ?? 0 };
}

/** O resumo do ativo ligado ao chamado; nulo se o ativo não existe mais. */
export async function resumoDoAtivo(
  tx: Transacao,
  ativoId: string,
  { acesso, arvore, agora, fuso, ligado }: LeituraDoResumo,
): Promise<ResumoDoAtivo | null> {
  const [ativo] = await tx.select().from(ativos).where(eq(ativos.id, ativoId));
  if (!ativo) return null;
  const leitura = {
    restritos: await camposRestritos(tx),
    veRestritos: () => podeEm(acesso, 'ativos.restritos', ativo.localId, arvore),
  };
  const operacao = ligado('operacao');

  let compativeis: ResumoDoAtivo['compativeis'] = null;
  const estoque = alcance(acesso, 'estoque.ver', arvore);
  if (operacao && estoque !== null && (await tipoComCompativeis(tx, ativo.tipoId))) {
    compativeis =
      ativo.modeloId === null ? [] : await compativeisComOMinimo(tx, ativo.modeloId, estoque);
  }

  let solicitacao: ResumoDoAtivo['solicitacao'] = null;
  const pendente = operacao ? await pendenteDa(tx, ativo.id) : null;
  if (pendente && veASolicitacao(alcance(acesso, 'solicitacoes.ver', arvore), pendente)) {
    solicitacao = { id: pendente.id, numero: pendente.numero, situacao: pendente.situacao };
  }

  return {
    disponibilidade: (await disponibilidadeDosAtivos(tx, [ativo], leitura)).get(ativo.id) ?? null,
    suprimentos: (await suprimentosDosAtivos(tx, [ativo], leitura)).get(ativo.id) ?? null,
    paginasPorMes: await mediaDoContador(tx, ativo.id, agora),
    tonerCritico:
      ligado('alertas') && podeEm(acesso, 'alertas.ver', ativo.localId, arvore)
        ? await tonerCriticoDo(tx, ativo.id)
        : null,
    ordens:
      operacao && podeEm(acesso, 'ordens.ver', ativo.localId, arvore)
        ? await ordensDoAtivo(tx, ativo.id, comecoDoAno(agora, fuso))
        : null,
    compativeis,
    solicitacao,
  };
}
