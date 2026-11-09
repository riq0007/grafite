// A tela de backup (specs backup e modulo-administracao; design do F2d, decisão 15): os backups
// guardados, o próximo horário e o último teste de restauração; o pedido de um backup na hora; e a
// mudança do horário e do dia do teste, dentro dos limites da configuração do servidor. Só existe na
// organização que opera o servidor e para quem tem backup.administrar: nas outras, responde como um
// endereço que não existe. A restauração não passa por aqui, só pelo comando de operação.
import {
  agendaDaOperacao,
  type Banco,
  backups,
  naOrganizacao,
  testesDeRestauracao,
} from '@grafite/db';
import { desc, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import { lerAgendaDaOperacao, proximoHorario } from '../operacao/agenda.ts';
import {
  agendarTarefasDoServidor,
  FUSO_DO_SERVIDOR,
  type ServidorDaOperacao,
  TAREFAS_DO_SERVIDOR,
} from '../operacao/tarefas.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';
import { filaIndisponivel } from './tarefas.ts';

/** Quantos backups a tela mostra, do mais novo ao mais antigo. */
const BACKUPS_NA_TELA = 100;

const DestinoDoBackup = z
  .object({
    destino: z.string(),
    situacao: z.enum(['gravado', 'falhou']),
    erro: z.string().nullable(),
  })
  .meta({ id: 'DestinoDoBackup' });

const BackupDaLista = z
  .object({
    id: z.uuid(),
    iniciadoEm: z.iso.datetime(),
    terminadoEm: z.iso.datetime().nullable(),
    situacao: z.enum(['em-andamento', 'feito', 'falhou']),
    pedidoPor: z.enum(['agenda', 'tela', 'comando']),
    /** Os bytes do dump, do zip e do manifesto. */
    tamanho: z.number().int().nullable(),
    /** Só os destinos que a configuração tem hoje. */
    destinos: z.array(DestinoDoBackup),
    erro: z.string().nullable(),
  })
  .meta({ id: 'BackupDaLista' });

const TesteDeRestauracao = z
  .object({
    id: z.uuid(),
    iniciadoEm: z.iso.datetime(),
    terminadoEm: z.iso.datetime().nullable(),
    situacao: z.enum(['em-andamento', 'feito', 'falhou']),
    erro: z.string().nullable(),
    /** O backup testado; nulo quando não havia nenhum pronto. */
    backup: z
      .object({ id: z.uuid(), pasta: z.string().nullable(), iniciadoEm: z.iso.datetime() })
      .nullable(),
    /** As contagens conferidas com o manifesto. */
    detalhes: z.object({
      tabelas: z.number().int().optional(),
      linhas: z.number().int().optional(),
      arquivos: z.number().int().optional(),
    }),
  })
  .meta({ id: 'TesteDeRestauracao' });

const AgendaDoBackup = z
  .object({
    /** `HH:MM`, no fuso do servidor. */
    horario: z.string(),
    /** 0 é domingo. */
    diaDoTeste: z.number().int().min(0).max(6),
    /** A janela em que o horário pode ficar, da configuração do servidor. */
    janela: z.object({ inicio: z.string(), fim: z.string() }),
    /** A frequência do teste de restauração, da configuração do servidor. */
    teste: z.enum(['semanal', 'diario']),
  })
  .meta({ id: 'AgendaDoBackup' });

const EstadoDoBackup = z
  .object({
    /** O servidor tem o backup configurado; sem ele, a tela só diz isso. */
    configurado: z.boolean(),
    agenda: AgendaDoBackup,
    /** O próximo backup agendado; nulo fora da produção ou sem o backup configurado. */
    proximoBackup: z.iso.datetime().nullable(),
    backups: z.array(BackupDaLista),
    ultimoTeste: TesteDeRestauracao.nullable(),
  })
  .meta({ id: 'EstadoDoBackup' });

const RespostaDoPedido = z
  .object({
    /** Um backup já esperava na fila: o pedido não pôs outro. */
    jaNaFila: z.boolean(),
  })
  .meta({ id: 'PedidoDeBackup' });

const MudancaDaAgenda = z
  .object({
    horario: z
      .string({ error: 'Use o formato HH:MM, como 02:00.' })
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, { error: 'Use o formato HH:MM, como 02:00.' }),
    diaDoTeste: z
      .number({ error: 'Escolha um dia da semana.' })
      .int({ error: 'Escolha um dia da semana.' })
      .min(0, { error: 'Escolha um dia da semana.' })
      .max(6, { error: 'Escolha um dia da semana.' }),
  })
  .meta({ id: 'MudancaDaAgenda' });

const JANELA_PADRAO = { inicio: '00:00', fim: '06:00' };

const naoConfigurado = () => conflito('O backup não está configurado neste servidor.');

export interface DependenciasDaOperacao {
  banco: Banco;
  agora: () => Date;
  fila?: FilaDeTarefas;
  /** O servidor e o backup dele; sem ele, a tela diz que o backup não está configurado. */
  servidor?: ServidorDaOperacao;
}

export const rotasDaOperacao: FastifyPluginAsyncZod<DependenciasDaOperacao> = async (
  app,
  { banco, agora, fila, servidor },
) => {
  // Fora da organização que opera o servidor, as rotas nem existem: a mesma resposta de um endereço
  // desconhecido, antes da sessão e da permissão.
  app.addHook('onRequest', async (requisicao) => {
    if (!requisicao.organizacao?.operaOServidor) throw naoEncontrado('Este endereço não existe.');
  });

  async function estado(): Promise<z.infer<typeof EstadoDoBackup>> {
    const config = servidor?.backup;
    const agenda = await lerAgendaDaOperacao(banco);
    const configurados = new Set(config?.destinos ?? []);
    const linhas = await banco
      .select()
      .from(backups)
      .where(isNull(backups.removidoEm))
      .orderBy(desc(backups.iniciadoEm))
      .limit(BACKUPS_NA_TELA);
    const [teste] = await banco
      .select({
        teste: testesDeRestauracao,
        backup: { id: backups.id, pasta: backups.pasta, iniciadoEm: backups.iniciadoEm },
      })
      .from(testesDeRestauracao)
      .leftJoin(backups, eq(backups.id, testesDeRestauracao.backupId))
      .orderBy(desc(testesDeRestauracao.iniciadoEm))
      .limit(1);
    const agendado = config !== undefined && servidor?.ambiente === 'producao';
    return {
      configurado: config !== undefined,
      agenda: {
        horario: agenda.horario,
        diaDoTeste: agenda.diaDoTeste,
        janela: config?.janela ?? JANELA_PADRAO,
        teste: config?.teste ?? 'semanal',
      },
      proximoBackup: agendado
        ? proximoHorario(agenda.horario, FUSO_DO_SERVIDOR, agora()).toISOString()
        : null,
      backups: linhas.map((linha) => ({
        id: linha.id,
        iniciadoEm: linha.iniciadoEm.toISOString(),
        terminadoEm: linha.terminadoEm?.toISOString() ?? null,
        situacao: linha.situacao,
        pedidoPor: linha.pedidoPor,
        tamanho: linha.tamanho ?? null,
        destinos: lerDestinos(linha.destinos).filter(({ destino }) => configurados.has(destino)),
        erro: linha.erro,
      })),
      ultimoTeste: teste
        ? {
            id: teste.teste.id,
            iniciadoEm: teste.teste.iniciadoEm.toISOString(),
            terminadoEm: teste.teste.terminadoEm?.toISOString() ?? null,
            situacao: teste.teste.situacao,
            erro: teste.teste.erro,
            backup: teste.backup
              ? {
                  id: teste.backup.id,
                  pasta: teste.backup.pasta,
                  iniciadoEm: teste.backup.iniciadoEm.toISOString(),
                }
              : null,
            detalhes: lerDetalhes(teste.teste.detalhes),
          }
        : null,
    };
  }

  app.get(
    '/operacao/backups',
    {
      config: { permissao: 'backup.administrar' },
      schema: {
        summary: 'Os backups guardados, o próximo horário e o último teste de restauração',
        response: { 200: EstadoDoBackup, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      sessaoDa(requisicao);
      return estado();
    },
  );

  // O pedido entra na fila pela transação da auditoria: com um backup rodando, ele espera; com um
  // já esperando, a fila não põe outro, e nada é auditado.
  app.post(
    '/operacao/backups/pedidos',
    {
      config: { permissao: 'backup.administrar' },
      schema: {
        summary: 'Fazer um backup agora',
        response: {
          202: RespostaDoPedido,
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
          409: RespostaDeProblema,
          503: RespostaDeProblema,
        },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      if (!servidor?.backup) throw naoConfigurado();
      if (!fila?.rodando()) throw filaIndisponivel();
      const orgId = requisicao.organizacao?.id ?? '';
      const jaNaFila = await naOrganizacao(banco, orgId, async (tx) => {
        const tarefa = await fila.enviar(
          TAREFAS_DO_SERVIDOR.backup,
          { orgId, pedidoPor: 'tela' },
          { tx },
        );
        if (!tarefa) return true;
        await registrarNaAuditoria(tx, {
          acao: 'backup.solicitado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'backup' },
          dados: {},
          origem: origemDa(requisicao),
          momento: agora(),
        });
        return false;
      });
      return resposta.code(202).send({ jaNaFila });
    },
  );

  app.put(
    '/operacao/agenda',
    {
      config: { permissao: 'backup.administrar' },
      schema: {
        summary: 'Mudar o horário do backup e o dia do teste de restauração',
        body: MudancaDaAgenda,
        response: {
          200: EstadoDoBackup,
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
          409: RespostaDeProblema,
        },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const config = servidor?.backup;
      if (!servidor || !config) throw naoConfigurado();
      const { horario, diaDoTeste } = requisicao.body;
      const { inicio, fim } = config.janela;
      if (horario < inicio || horario > fim) {
        throw dadosInvalidos({ horario: `Escolha um horário entre ${inicio} e ${fim}.` });
      }
      const orgId = requisicao.organizacao?.id ?? '';
      await naOrganizacao(banco, orgId, async (tx) => {
        const [antes] = await tx
          .select({ horario: agendaDaOperacao.horario, diaDoTeste: agendaDaOperacao.diaDoTeste })
          .from(agendaDaOperacao)
          .for('update');
        await tx.update(agendaDaOperacao).set({ horario, diaDoTeste, atualizadaEm: agora() });
        await registrarNaAuditoria(tx, {
          acao: 'agenda-do-backup.alterada',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'agenda-do-backup' },
          dados: { antes: antes ?? null, depois: { horario, diaDoTeste } },
          origem: origemDa(requisicao),
          momento: agora(),
        });
      });
      if (fila?.rodando()) {
        await agendarTarefasDoServidor(
          fila,
          { horario, diaDoTeste },
          { ...servidor, orgOperadoraId: orgId },
        );
      }
      return estado();
    },
  );
};

function lerDestinos(destinos: unknown): z.infer<typeof DestinoDoBackup>[] {
  const lidos = z
    .array(
      z.object({
        destino: z.string(),
        situacao: z.enum(['gravado', 'falhou']),
        erro: z.string().optional(),
      }),
    )
    .safeParse(destinos);
  return lidos.success ? lidos.data.map((d) => ({ ...d, erro: d.erro ?? null })) : [];
}

function lerDetalhes(detalhes: unknown): z.infer<typeof TesteDeRestauracao>['detalhes'] {
  const lidos = TesteDeRestauracao.shape.detalhes.safeParse(detalhes);
  return lidos.success ? lidos.data : {};
}
