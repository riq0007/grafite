// As tarefas com falha (spec fila-de-tarefas; design do F2c, decisão 15): a lista da organização,
// só para quem administra as tarefas, da falha mais recente, paginada pelo cursor de (falhou_em, id).
// "Tentar de novo" tira a linha, audita e põe a tarefa de volta na fila numa transação só: se algo
// falha, a tarefa continua na lista e não entra na fila. As rotinas (change
// regras-indicadores-e-tarefas, design, decisão 4) vêm da agenda da fila, com a última execução e a
// próxima; a rotina agendada para outra organização, como o backup do servidor, fica de fora.
import { type Banco, naOrganizacao, tarefasComFalha } from '@grafite/db';
import { agendaEmTexto, proximaExecucao } from '@grafite/domain';
import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import { Cursor, decodificarCursor, Limite, pagina } from '../paginacao.ts';
import { conflito, naoEncontrado, ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const TarefaComFalha = z
  .object({
    id: z.uuid(),
    /** O nome técnico da tarefa. */
    tarefa: z.string(),
    /** O nome em pt-BR, como "Manutenção diária". */
    nome: z.string(),
    tentativas: z.number().int().min(1),
    /** A mensagem do último erro, sem a pilha. */
    erro: z.string(),
    /** Quando a última tentativa falhou. */
    falhouEm: z.iso.datetime(),
  })
  .meta({ id: 'TarefaComFalha' });

const ListaDeTarefasComFalha = z
  .object({ itens: z.array(TarefaComFalha), proximo: z.string().nullable() })
  .meta({ id: 'ListaDeTarefasComFalha' });

const RotinaDaFila = z
  .object({
    /** O nome técnico da tarefa agendada. */
    tarefa: z.string(),
    /** O nome em pt-BR, como "Manutenção diária". */
    nome: z.string(),
    /** O que a rotina faz, numa frase. */
    descricao: z.string(),
    /** Quando ela roda, como "Todo dia às 03:30". */
    agenda: z.string(),
    /** A última execução que a fila ainda guarda, ou nenhuma. */
    ultima: z
      .object({
        momento: z.iso.datetime(),
        situacao: z.enum(['concluida', 'em-andamento', 'falhou']),
      })
      .nullable(),
    /** A próxima execução, quando a agenda é de um padrão que o Grafite usa. */
    proxima: z.iso.datetime().nullable(),
  })
  .meta({ id: 'RotinaDaFila' });

const ListaDeRotinas = z.object({ rotinas: z.array(RotinaDaFila) }).meta({ id: 'ListaDeRotinas' });

/** A situação da execução na fila, em três: concluída, em andamento (na fila ou rodando) ou falhou. */
const SITUACAO_DA_EXECUCAO: Record<string, 'concluida' | 'em-andamento' | 'falhou'> = {
  completed: 'concluida',
  created: 'em-andamento',
  retry: 'em-andamento',
  active: 'em-andamento',
  failed: 'falhou',
  cancelled: 'falhou',
};

const FiltrosDaLista = z.object({ cursor: Cursor.optional(), limite: Limite });

const ParametrosDaTarefa = z.object({ id: z.uuid({ error: 'Tarefa não encontrada.' }) });

/** A chave da ordem: o momento da falha com a precisão do banco e o id, que desempata. */
const ChaveDaFalha = z.tuple([z.string(), z.uuid()]);

/** A fila não está rodando, como no encerramento da API (503 `fila-indisponivel`). */
export const filaIndisponivel = () =>
  new ProblemaDaApi({
    codigo: 'fila-indisponivel',
    status: 503,
    titulo: 'Fila indisponível',
    detalhe: 'A fila de tarefas não está funcionando agora. Tente de novo em alguns minutos.',
  });

export const rotasDasTarefas: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  /** Sem ela, como no contrato e nos testes que não tratam da fila, nada volta à fila. */
  fila?: FilaDeTarefas;
}> = async (app, { banco, agora, fila }) => {
  app.get(
    '/tarefas/rotinas',
    {
      config: { permissao: 'tarefas.administrar' },
      schema: {
        summary: 'As rotinas que rodam sozinhas, com a agenda, a última execução e a próxima',
        response: { 200: ListaDeRotinas, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const momento = agora();
      const linhas = await naOrganizacao(banco, orgId, async (tx) => {
        const resultado = await tx.execute<{
          name: string;
          cron: string;
          timezone: string | null;
          org: string | null;
          state: string | null;
          momento: Date | string | null;
        }>(sql`
          select s.name, s.cron, s.timezone, s.data->>'orgId' as org, j.state,
            coalesce(j.completed_on, j.started_on, j.created_on) as momento
          from fila.schedule s
          left join fila.job j on j.name = s.name and j.id = s.last_job_id
        `);
        return resultado.rows;
      });
      const rotinas = linhas
        .filter((linha) => linha.org === null || linha.org === orgId)
        .map((linha) => {
          const fuso = linha.timezone ?? 'UTC';
          const sobre = fila?.rotina(linha.name);
          const proxima = proximaExecucao(linha.cron, fuso, momento);
          return {
            tarefa: linha.name,
            nome: sobre?.nome ?? fila?.rotulo(linha.name) ?? linha.name,
            descricao: sobre?.descricao ?? '',
            agenda: agendaEmTexto(linha.cron),
            ultima:
              linha.state && linha.momento
                ? {
                    momento: new Date(linha.momento).toISOString(),
                    situacao: SITUACAO_DA_EXECUCAO[linha.state] ?? 'em-andamento',
                  }
                : null,
            proxima: proxima?.toISOString() ?? null,
          };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return { rotinas };
    },
  );

  app.get(
    '/tarefas-com-falha',
    {
      config: { permissao: 'tarefas.administrar' },
      schema: {
        summary: 'As tarefas da organização que falharam em todas as tentativas',
        querystring: FiltrosDaLista,
        response: { 200: ListaDeTarefasComFalha, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      sessaoDa(requisicao);
      const { cursor, limite } = requisicao.query;
      const depoisDe = cursor ? decodificarCursor(cursor, ChaveDaFalha) : null;
      const linhas = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        tx
          .select({
            id: tarefasComFalha.id,
            tarefa: tarefasComFalha.tarefa,
            tentativas: tarefasComFalha.tentativas,
            erro: tarefasComFalha.erro,
            falhouEm: tarefasComFalha.falhouEm,
            falhouEmExato: sql<string>`to_char(${tarefasComFalha.falhouEm} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          })
          .from(tarefasComFalha)
          .where(
            depoisDe
              ? sql`(${tarefasComFalha.falhouEm}, ${tarefasComFalha.id}) < (${depoisDe[0]}::timestamptz, ${depoisDe[1]}::uuid)`
              : undefined,
          )
          .orderBy(desc(tarefasComFalha.falhouEm), desc(tarefasComFalha.id))
          .limit(limite + 1),
      );
      const { linhas: daPagina, proximo } = pagina(linhas, limite, (linha) => [
        linha.falhouEmExato,
        linha.id,
      ]);
      return {
        itens: daPagina.map((linha) => ({
          id: linha.id,
          tarefa: linha.tarefa,
          nome: fila?.rotulo(linha.tarefa) ?? linha.tarefa,
          tentativas: linha.tentativas,
          erro: linha.erro,
          falhouEm: linha.falhouEm.toISOString(),
        })),
        proximo,
      };
    },
  );

  // A tarefa volta com as tentativas do começo. A auditoria grava o evento `tarefas.mudaram`, e a
  // tarefa entra na fila pela mesma transação (a opção `db` do pg-boss).
  app.post(
    '/tarefas-com-falha/:id/repeticao',
    {
      config: { permissao: 'tarefas.administrar' },
      schema: {
        summary: 'Pôr de novo na fila uma tarefa com falha',
        params: ParametrosDaTarefa,
        response: {
          204: z.null(),
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
          409: RespostaDeProblema,
          503: RespostaDeProblema,
        },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      if (!fila?.rodando()) throw filaIndisponivel();
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [falha] = await tx
          .delete(tarefasComFalha)
          .where(eq(tarefasComFalha.id, requisicao.params.id))
          .returning();
        if (!falha) throw naoEncontrado('Tarefa não encontrada.');
        if (!fila.rotulo(falha.tarefa)) {
          throw conflito('Esta tarefa não existe nesta versão do Grafite e não volta à fila.');
        }
        await registrarNaAuditoria(tx, {
          acao: 'tarefa.repetida',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'tarefa', id: falha.id },
          dados: { tarefa: falha.tarefa, erro: falha.erro, tentativas: falha.tentativas },
          origem: origemDa(requisicao),
          momento: agora(),
        });
        await fila.enviar(falha.tarefa, falha.dados, { tx });
      });
      return resposta.code(204).send(null);
    },
  );
};
