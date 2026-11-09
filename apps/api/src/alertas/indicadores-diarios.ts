// A avaliação diária dos indicadores (spec indicadores, "Indicador fora da meta avisa"; change
// p3d-indicadores, design, decisão 4; spec indicadores-da-operacao, "Indicador da operação fora da
// meta avisa"; change p4f-indicadores-da-operacao, design, decisão 8). A `indicadores-diarios`,
// agendada às 07:00 de São Paulo, põe uma `avaliar-indicadores` por organização, com a chave do dia.
// Cada uma avalia cada grupo com o módulo dele ligado: os dos alertas, com todos os alertas da
// organização, e os da operação, com todas as OS e as saídas. Na mesma transação, marca o indicador
// que saiu da meta e notifica as contas ativas com a permissão do grupo, `alertas.administrar` ou
// `operacao.administrar`, ou limpa a marca do que voltou ou ficou sem dado. Às 07:00, a notificação
// de Atenção entra no resumo das 08:00 do mesmo dia.
import {
  type Banco,
  indicadoresDaOrganizacao,
  naOrganizacao,
  organizacoes,
  type Transacao,
} from '@grafite/db';
import {
  type ArvoreDeLocais,
  type IdDoModuloOpcional,
  INDICADORES_DA_OPERACAO,
  INDICADORES_DOS_ALERTAS,
  type Indicador,
  type NotificacaoDoIndicador,
  type NovaNotificacao,
  notificacaoDoIndicador,
  type Permissao,
  podeEm,
  type SituacaoDoIndicador,
} from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { carregarAcessosDaOrganizacao } from '../acesso/acesso.ts';
import { lerArvore } from '../arvore.ts';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa, EnviarTarefa } from '../fila/tarefas.ts';
import { lerIndicadoresDaOperacao } from '../indicadores-da-operacao/leitura.ts';
import { notificar } from '../notificacoes/notificar.ts';
import { lerIndicadores } from './indicadores.ts';

export const TAREFA_DOS_INDICADORES_DO_DIA = 'indicadores-diarios';
export const TAREFA_DA_AVALIACAO_DOS_INDICADORES = 'avaliar-indicadores';

/** O fuso do horário da avaliação, o mesmo das outras tarefas agendadas. */
const FUSO_DOS_INDICADORES = 'America/Sao_Paulo';
const DIA = 24 * 60 * 60;

/** Cinco novas tentativas, a partir de 1 min, dobrando até 1 h; depois, a lista das falhas. */
const TENTATIVAS = {
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 60 * 60,
  deadLetter: FILA_DAS_FALHAS,
} as const;

/** A data em São Paulo, como "2026-10-14": a chave do dia da avaliação. */
const diaEmSaoPaulo = (momento: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_DOS_INDICADORES }).format(momento);

/** As organizações ativas, pela consulta que atravessa organizações só para as tarefas. */
async function organizacoesAtivas(banco: Banco): Promise<string[]> {
  const { rows } = await banco.execute<{ id: string }>(
    sql`select id from app.organizacoes_para_tarefas() as t(id)`,
  );
  return rows.map((linha) => linha.id);
}

/** O que a avaliação lê de cada indicador do grupo. */
type Calculados = Partial<
  Record<Indicador, { situacao: SituacaoDoIndicador; valor: number | null }>
>;

/** Um grupo de indicadores: o módulo que o liga, quem é notificado e como ele é calculado. */
interface Grupo {
  modulo: IdDoModuloOpcional;
  indicadores: readonly Indicador[];
  quemAdministra: Permissao;
  ler: (
    tx: Transacao,
    contexto: { agora: Date; arvore: ArvoreDeLocais },
  ) => Promise<{ metas: Record<Indicador, number>; calculados: Calculados }>;
}

/** Os dois grupos, calculados como na avaliação: sem a conta, com a organização inteira. */
const GRUPOS: readonly Grupo[] = [
  {
    modulo: 'alertas',
    indicadores: INDICADORES_DOS_ALERTAS,
    quemAdministra: 'alertas.administrar',
    ler: lerIndicadores,
  },
  {
    modulo: 'operacao',
    indicadores: INDICADORES_DA_OPERACAO,
    quemAdministra: 'operacao.administrar',
    ler: lerIndicadoresDaOperacao,
  },
];

/** Avalia os indicadores da organização do contexto da transação, no momento dado. */
export async function avaliarIndicadores(
  tx: Transacao,
  { agora, enviar }: { agora: Date; enviar?: EnviarTarefa },
): Promise<void> {
  const [organizacao] = await tx
    .select({ desligados: organizacoes.modulosDesligados })
    .from(organizacoes);
  const ligados = GRUPOS.filter(({ modulo }) => !organizacao?.desligados.includes(modulo));
  if (ligados.length === 0) return;
  const arvore = await lerArvore(tx);
  const marcas = new Map(
    (
      await tx
        .select({
          indicador: indicadoresDaOrganizacao.indicador,
          fora: indicadoresDaOrganizacao.foraDaMetaDesde,
        })
        .from(indicadoresDaOrganizacao)
    ).map(({ indicador, fora }) => [indicador, fora]),
  );
  let acessos: Awaited<ReturnType<typeof carregarAcessosDaOrganizacao>> | undefined;

  const novas: NovaNotificacao[] = [];
  for (const grupo of ligados) {
    const { metas, calculados } = await grupo.ler(tx, { agora, arvore });
    const sairam: NotificacaoDoIndicador[] = [];
    for (const indicador of grupo.indicadores) {
      const { situacao, valor } = calculados[indicador] ?? { situacao: 'sem-dado', valor: null };
      const marcado = Boolean(marcas.get(indicador));
      if (situacao === 'fora' && !marcado) {
        await tx
          .insert(indicadoresDaOrganizacao)
          .values({ orgId: sql`app.current_org()`, indicador, foraDaMetaDesde: agora })
          .onConflictDoUpdate({
            target: [indicadoresDaOrganizacao.orgId, indicadoresDaOrganizacao.indicador],
            set: { foraDaMetaDesde: agora },
          });
        sairam.push(notificacaoDoIndicador(indicador, valor ?? 0, metas[indicador]));
      } else if (situacao !== 'fora' && marcado) {
        await tx
          .update(indicadoresDaOrganizacao)
          .set({ foraDaMetaDesde: null })
          .where(eq(indicadoresDaOrganizacao.indicador, indicador));
      }
    }
    if (sairam.length === 0) continue;
    acessos ??= await carregarAcessosDaOrganizacao(tx);
    for (const { id, acesso } of acessos) {
      if (!podeEm(acesso, grupo.quemAdministra, null, arvore)) continue;
      for (const { titulo, descricao, destino, origem } of sairam) {
        novas.push({
          contaId: id,
          severidade: 'atencao',
          titulo,
          descricao,
          origem,
          destino,
          alertaId: null,
        });
      }
    }
  }
  if (novas.length > 0) await notificar(tx, novas, agora, { enviar });
}

export function tarefasDosIndicadores({
  banco,
  agora,
  enviar,
}: ContextoDasTarefas): DefinicaoDeTarefa[] {
  const doDia: DefinicaoDeTarefa<unknown> = {
    nome: TAREFA_DOS_INDICADORES_DO_DIA,
    rotulo: 'Distribuição da avaliação diária dos indicadores',
    rotina: {
      nome: 'Avaliação dos indicadores',
      descricao: 'Calcula os indicadores e avisa quem administra os alertas quando um sai da meta.',
    },
    dados: z.unknown(),
    agenda: { cron: '0 7 * * *', fuso: FUSO_DOS_INDICADORES },
    opcoes: { deadLetter: FILA_DAS_FALHAS },
    async trabalho() {
      const dia = diaEmSaoPaulo(agora());
      for (const orgId of await organizacoesAtivas(banco)) {
        await enviar(
          TAREFA_DA_AVALIACAO_DOS_INDICADORES,
          { orgId },
          { chaveUnica: `${orgId}:${dia}`, unicaPor: DIA },
        );
      }
    },
  };

  const daOrganizacao: DefinicaoDeTarefa<{ orgId: string }> = {
    nome: TAREFA_DA_AVALIACAO_DOS_INDICADORES,
    rotulo: 'Avaliação dos indicadores de uma organização',
    dados: z.object({ orgId: z.uuid() }),
    opcoes: TENTATIVAS,
    async trabalho({ orgId }) {
      await naOrganizacao(banco, orgId, (tx) => avaliarIndicadores(tx, { agora: agora(), enviar }));
    },
  };

  return [doDia, daOrganizacao as DefinicaoDeTarefa];
}
