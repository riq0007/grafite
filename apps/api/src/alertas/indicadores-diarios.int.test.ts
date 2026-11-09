// A avaliação diária dos indicadores (spec indicadores, "Indicador fora da meta avisa", e auditoria,
// "Meta de indicador registrada"; change p3d-indicadores, design, decisão 4): às 07:00 de São Paulo,
// cada organização avalia os indicadores com todos os alertas dela e notifica quem administra os
// alertas quando um sai da meta, uma vez a cada saída.
import { auditoria, indicadoresDaOrganizacao, naOrganizacao, notificacoes } from '@grafite/db';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  type AlertasDeTeste,
  criarAlerta,
  criarAtivoDoTipo,
  criarRegra,
  criarTipo,
  desligarModulos,
  montarAlertas,
} from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';
import { criarFila } from '../fila/fila.ts';
import { type ContextoDasTarefas, type DefinicaoDeTarefa, tarefasDaApi } from '../fila/tarefas.ts';
import {
  TAREFA_DA_AVALIACAO_DOS_INDICADORES,
  TAREFA_DOS_INDICADORES_DO_DIA,
  tarefasDosIndicadores,
} from './indicadores-diarios.ts';

const host = 'grafite.indicadores-diarios.local';
const ORGANIZACAO = { tipo: 'organizacao', id: null } as const;
const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

let api: ApiDeTeste;
let alertas: AlertasDeTeste;

beforeAll(async () => {
  api = await abrirApi();
  alertas = await montarAlertas(api, host);
  const { org } = alertas;
  const impressora = await criarTipo(api, org, {
    nome: 'Impressora',
    capacidades: ['snmp.suprimentos'],
  });
  const toner = await criarRegra(api, org, {
    nome: 'Toner em 10% ou menos',
    condicao: 'toner.nivel',
    parametros: { limite: 10, folga: 5 },
    duracao: 0,
    severidade: 'critico',
    escopo: ORGANIZACAO,
  });
  // Três toners trocados, em três impressoras, depois de 2 dias, 3,2 dias e 4 dias: a mediana fica
  // em 3,2 dias, acima da meta de fábrica de 2 dias.
  for (const [indice, dias] of [2, 3.2, 4].entries()) {
    const ativoId = await criarAtivoDoTipo(api, org, {
      tipoId: impressora,
      nome: `Impressora ${indice + 1}`,
      localId: alertas.jundiai,
    });
    const abriu = new Date(api.relogio.agora().getTime() - 10 * DIA);
    await criarAlerta(api, org, {
      regraId: toner,
      ativoId,
      item: '1',
      texto: 'Black Toner Cartridge em 8%',
      abertoHa: (10 * DIA) / MINUTO,
      situacao: 'resolvido',
      resolvidoEm: new Date(abriu.getTime() + dias * DIA),
      comoTerminou: 'voltou-ao-normal',
    });
  }
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, alertas.org, async (tx) => {
    await tx.delete(notificacoes);
    await tx.delete(indicadoresDaOrganizacao);
  });
});

/** O contexto das tarefas, com o `enviar` dado. */
const contextoDasTarefas = (enviar: ContextoDasTarefas['enviar']): ContextoDasTarefas => ({
  banco: api.banco,
  armazenamento: api.armazenamento,
  agora: api.relogio.agora,
  log: { info: () => {}, warn: () => {}, error: () => {} },
  enviar,
});

/** As tarefas dos indicadores com um contexto que guarda o que elas põem na fila. */
function tarefas() {
  const enviadas: Array<{ tarefa: string; dados: unknown; chave?: string }> = [];
  const contexto = contextoDasTarefas(async (tarefa, dados, opcoes) => {
    enviadas.push({ tarefa, dados, chave: opcoes?.chaveUnica });
    return null;
  });
  const porNome = new Map(tarefasDosIndicadores(contexto).map((tarefa) => [tarefa.nome, tarefa]));
  const execucao = { tarefaId: 'teste', tentativa: 0, sinal: new AbortController().signal };
  return {
    enviadas,
    tarefa: (nome: string) => porNome.get(nome) as DefinicaoDeTarefa,
    avaliar: () =>
      (porNome.get(TAREFA_DA_AVALIACAO_DOS_INDICADORES) as DefinicaoDeTarefa).trabalho(
        { orgId: alertas.org },
        execucao,
      ),
  };
}

const notificacoesGravadas = () =>
  naOrganizacao(api.banco, alertas.org, (tx) =>
    tx
      .select({
        contaId: notificacoes.contaId,
        severidade: notificacoes.severidade,
        titulo: notificacoes.titulo,
        descricao: notificacoes.descricao,
        origem: notificacoes.origem,
        destino: notificacoes.destino,
        alertaId: notificacoes.alertaId,
      })
      .from(notificacoes),
  );

const mudarMeta = (meta: number) =>
  naOrganizacao(api.banco, alertas.org, (tx) =>
    tx
      .insert(indicadoresDaOrganizacao)
      .values({ orgId: alertas.org, indicador: 'toner', meta })
      .onConflictDoUpdate({
        target: [indicadoresDaOrganizacao.orgId, indicadoresDaOrganizacao.indicador],
        set: { meta },
      }),
  );

describe('avaliação diária dos indicadores', () => {
  it('fica agendada às 07:00 de São Paulo, com a execução perdida recuperada uma vez', async () => {
    const fila = criarFila({
      conexao: inject('urlApp'),
      tarefas: tarefasDaApi(contextoDasTarefas(async () => null)),
      avisar: () => {},
    });
    await fila.iniciar();
    const boss = new PgBoss({ connectionString: inject('urlApp'), schema: 'fila', migrate: false });
    await boss.start();
    try {
      expect(await boss.getSchedules(TAREFA_DOS_INDICADORES_DO_DIA)).toMatchObject([
        { cron: '0 7 * * *', timezone: 'America/Sao_Paulo', options: { missed: 'once' } },
      ]);
    } finally {
      await boss.stop({ graceful: false });
      await fila.parar();
    }
  });

  it('a distribuição das 07:00 põe uma avaliação por organização, com a chave do dia', async () => {
    const { tarefa, enviadas } = tarefas();
    expect(tarefa(TAREFA_DOS_INDICADORES_DO_DIA).agenda).toEqual({
      cron: '0 7 * * *',
      fuso: 'America/Sao_Paulo',
    });
    await tarefa(TAREFA_DOS_INDICADORES_DO_DIA).trabalho(undefined, {
      tarefaId: 'teste',
      tentativa: 0,
      sinal: new AbortController().signal,
    });
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      api.relogio.agora(),
    );
    expect(enviadas).toContainEqual({
      tarefa: TAREFA_DA_AVALIACAO_DOS_INDICADORES,
      dados: { orgId: alertas.org },
      chave: `${alertas.org}:${dia}`,
    });
  });

  it('Toner sai da meta: notifica quem administra os alertas, com a entrega pelos canais', async () => {
    const { avaliar, enviadas } = tarefas();
    const auditadosAntes = await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx.select({ id: auditoria.id }).from(auditoria),
    );
    await avaliar();
    expect(await notificacoesGravadas()).toEqual([
      {
        contaId: alertas.contas.ana.id,
        severidade: 'atencao',
        titulo: 'Tempo de atendimento do toner fora da meta: 3,2 dias, com a meta de 2 dias',
        descricao:
          'Deixe toner de reserva nos locais que mais esperam, ou suba o limite da regra do toner para o alerta abrir antes.',
        origem: 'Alertas',
        destino: '/alertas/indicadores?foco=indicador-toner',
        alertaId: null,
      },
    ]);
    expect(enviadas.map(({ tarefa }) => tarefa)).toContain('entregar-notificacoes');
    const [marca] = await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx.select({ fora: indicadoresDaOrganizacao.foraDaMetaDesde }).from(indicadoresDaOrganizacao),
    );
    expect(marca?.fora).toEqual(api.relogio.agora());
    // Avaliação diária: nada entra na auditoria.
    const auditadosDepois = await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx.select({ id: auditoria.id }).from(auditoria),
    );
    expect(auditadosDepois).toHaveLength(auditadosAntes.length);
  });

  it('Continua fora da meta: a avaliação do dia seguinte não notifica de novo', async () => {
    await tarefas().avaliar();
    await naOrganizacao(api.banco, alertas.org, (tx) => tx.delete(notificacoes));
    api.relogio.avancar(DIA);
    await tarefas().avaliar();
    expect(await notificacoesGravadas()).toEqual([]);
  });

  it('Volta e sai de novo: depois de voltar à meta, a nova saída notifica', async () => {
    await tarefas().avaliar();
    await mudarMeta(5 * 24 * 60);
    await tarefas().avaliar();
    const [dentro] = await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx.select({ fora: indicadoresDaOrganizacao.foraDaMetaDesde }).from(indicadoresDaOrganizacao),
    );
    expect(dentro?.fora).toBeNull();
    await naOrganizacao(api.banco, alertas.org, (tx) => tx.delete(notificacoes));
    await mudarMeta(2 * 24 * 60);
    await tarefas().avaliar();
    expect((await notificacoesGravadas()).map(({ titulo }) => titulo)).toEqual([
      'Tempo de atendimento do toner fora da meta: 3,2 dias, com a meta de 2 dias',
    ]);
  });

  it('com o Operação desligado, os indicadores dos alertas continuam avaliados', async () => {
    await desligarModulos(api, alertas.org, ['operacao']);
    try {
      await tarefas().avaliar();
      expect((await notificacoesGravadas()).map(({ titulo }) => titulo)).toEqual([
        'Tempo de atendimento do toner fora da meta: 3,2 dias, com a meta de 2 dias',
      ]);
    } finally {
      await desligarModulos(api, alertas.org, []);
    }
  });

  it('Módulo desligado: não avalia nem notifica', async () => {
    await desligarModulos(api, alertas.org, ['alertas']);
    try {
      await tarefas().avaliar();
      expect(await notificacoesGravadas()).toEqual([]);
      expect(
        await naOrganizacao(api.banco, alertas.org, (tx) =>
          tx.select().from(indicadoresDaOrganizacao),
        ),
      ).toEqual([]);
    } finally {
      await desligarModulos(api, alertas.org, []);
    }
  });
});
