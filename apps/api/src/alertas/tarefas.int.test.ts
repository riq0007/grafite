// As tarefas dos alertas (spec alertas, "Avaliação a cada minuto"; change p3a-regras-e-alertas,
// design, decisão 5): a partida do servidor agenda a distribuição a cada minuto, que põe uma
// avaliação por organização com a chave do minuto; a avaliação de uma organização roda o motor; e a
// mudança de uma regra põe a avaliação dela na fila, para valer logo.
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import {
  alertasDa,
  criarAtivoDoTipo,
  criarColetor,
  criarTipo,
  gravarEstado,
  montarAlertas,
} from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi, criarOrganizacao } from '../../test/integracao.ts';
import { type ContextoDasTarefas, tarefasDaApi } from '../fila/tarefas.ts';
import { tarefasDosAlertas } from './tarefas.ts';

let api: ApiDeTeste;

beforeAll(async () => {
  api = await abrirApi();
});

afterAll(async () => {
  await api?.fechar();
});

const silencioso = { info: () => {}, warn: () => {}, error: () => {} };
const sinal = new AbortController().signal;

function contexto(enviar: ContextoDasTarefas['enviar'] = vi.fn(async () => null)) {
  return {
    banco: api.banco,
    armazenamento: api.armazenamento,
    agora: api.relogio.agora,
    log: silencioso,
    enviar,
  } satisfies ContextoDasTarefas;
}

function tarefa(nome: string, de = contexto()) {
  const encontrada = tarefasDosAlertas(de).find((t) => t.nome === nome);
  if (!encontrada) throw new Error(`Falta a tarefa ${nome}.`);
  return encontrada;
}

/** Uma organização com uma impressora com o toner em 8%. */
async function comToner(host: string) {
  const org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const impressora = await criarTipo(api, org, { capacidades: ['snmp.suprimentos'] });
  const ativoId = await criarAtivoDoTipo(api, org, { tipoId: impressora, nome: 'Impressora' });
  await gravarEstado(api, org, {
    ativoId,
    coletorId: await criarColetor(api, org, { ultimoContatoEm: api.relogio.agora() }),
    metrica: 'impressora.suprimento',
    item: '1',
    momento: api.relogio.agora(),
    valorNumero: 8,
    detalhes: { descricao: 'Toner preto' },
  });
  return org;
}

describe('tarefas dos alertas', () => {
  it('a distribuição põe uma avaliação por organização, com a chave do minuto', async () => {
    const org = await criarOrganizacao(api, {
      nome: 'Empresa',
      enderecos: ['grafite.tarefas-dos-alertas.local'],
    });
    const enviados: { tarefa: string; dados: unknown; chaveUnica?: string; unicaPor?: number }[] =
      [];
    const distribuicao = tarefa(
      'alertas-a-cada-minuto',
      contexto(async (nome, dados, opcoes) => {
        enviados.push({
          tarefa: nome,
          dados,
          chaveUnica: opcoes?.chaveUnica,
          unicaPor: opcoes?.unicaPor,
        });
        return null;
      }),
    );
    await distribuicao.trabalho(null, { tarefaId: 't', tentativa: 0, sinal });
    const minuto = api.relogio.agora().toISOString().slice(0, 16);
    expect(enviados).toContainEqual({
      tarefa: 'avaliar-alertas',
      dados: { orgId: org },
      chaveUnica: `${org}:${minuto}`,
      unicaPor: 60,
    });
  });

  it('a avaliação de uma organização roda o motor', async () => {
    const org = await comToner('grafite.tarefas-motor.local');
    await tarefa('avaliar-alertas').trabalho(
      { orgId: org },
      { tarefaId: 't', tentativa: 0, sinal },
    );
    expect((await alertasDa(api, org)).map((alerta) => alerta.texto)).toEqual([
      'Toner preto em 8%',
    ]);
  });

  it('a partida do servidor agenda a distribuição a cada minuto', async () => {
    const comAgenda = await abrirApi({ tarefas: tarefasDaApi, agendarAlertas: true });
    const boss = new PgBoss({ connectionString: inject('urlApp'), schema: 'fila', migrate: false });
    await comAgenda.app.ready();
    await boss.start();
    try {
      expect(await boss.getSchedules('alertas-a-cada-minuto')).toMatchObject([
        { cron: '* * * * *', timezone: 'America/Sao_Paulo' },
      ]);
    } finally {
      // A agenda fica no banco dos testes: sem ela, nenhuma outra fila distribui avaliações.
      await boss.unschedule('alertas-a-cada-minuto');
      await boss.stop({ graceful: false });
      await comAgenda.fechar();
    }
  });

  it('a mudança de uma regra põe a avaliação na fila, e o alerta abre logo', async () => {
    const comFila = await abrirApi({ tarefas: tarefasDaApi, intervaloDaFila: 1 });
    try {
      await comFila.app.ready();
      const alertas = await montarAlertas(comFila, 'grafite.tarefas-regra.local');
      const impressora = await criarTipo(comFila, alertas.org, {
        capacidades: ['snmp.suprimentos'],
      });
      const ativoId = await criarAtivoDoTipo(comFila, alertas.org, { tipoId: impressora });
      await gravarEstado(comFila, alertas.org, {
        ativoId,
        coletorId: await criarColetor(comFila, alertas.org, {
          ultimoContatoEm: comFila.relogio.agora(),
        }),
        metrica: 'impressora.suprimento',
        item: '1',
        momento: comFila.relogio.agora(),
        valorNumero: 40,
        detalhes: { descricao: 'Toner preto' },
      });
      const r = await alertas.cliente.enviar('POST', '/regras-de-alerta', alertas.como('ana'), {
        nome: 'Toner em 50% ou menos',
        condicao: 'toner.nivel',
        parametros: { limite: 50, folga: 5 },
        duracao: 0,
        severidade: 'info',
        escopo: { tipo: 'organizacao', id: null },
      });
      expect(r.statusCode).toBe(201);
      await vi.waitFor(
        async () => {
          const abertos = await alertasDa(comFila, alertas.org);
          expect(abertos.map((alerta) => alerta.texto)).toEqual(['Toner preto em 40%']);
        },
        { timeout: 20_000, interval: 250 },
      );
    } finally {
      await comFila.fechar();
    }
  });
});
