// As tarefas do servidor na fila (specs backup, https-interno e fila-de-tarefas; design do F2d,
// decisões 1, 11 e 14): agendadas só na produção e com a organização operadora, no fuso do servidor,
// uma de cada vez, e com a falha esgotada nas tarefas da operadora.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { naOrganizacao, tarefasComFalha } from '@grafite/db';
import { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { armazenamentoEmMemoria } from '../../test/dependencias.ts';
import { type ApiDeTeste, abrirApi, criarOrganizacao } from '../../test/integracao.ts';
import { tarefaDasFalhas } from '../fila/falhas.ts';
import { criarFila, type FilaDeTarefas } from '../fila/fila.ts';
import { type ContextoDasTarefas, tarefasDaApi } from '../fila/tarefas.ts';
import { type ServidorDaOperacao, TAREFAS_DO_SERVIDOR, tarefasDoServidor } from './tarefas.ts';

let boss: PgBoss;
let pasta: string;
const abertas: ApiDeTeste[] = [];
let enderecos = 0;

beforeAll(async () => {
  boss = new PgBoss({ connectionString: inject('urlApp'), schema: 'fila', migrate: false });
  await boss.start();
  // O banco de teste é um só: a fila do backup começa vazia.
  if (await boss.getQueue('backup')) await boss.deleteAllJobs('backup');
  pasta = await mkdtemp(join(tmpdir(), 'grafite-tarefas-do-servidor-'));
});

afterEach(async () => {
  for (const api of abertas.splice(0)) await api.fechar();
  for (const nome of Object.values(TAREFAS_DO_SERVIDOR)) await boss.unschedule(nome);
});

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await rm(pasta, { recursive: true, force: true });
});

/** Uma configuração de backup que nunca alcança um banco: o backup falha na hora. */
const backupQueFalha = (): NonNullable<ServidorDaOperacao['backup']> => ({
  destinos: [join(pasta, 'destino')],
  retencao: { diarios: 7, semanais: 4, mensais: 12 },
  janela: { inicio: '00:00', fim: '06:00' },
  teste: 'semanal',
  urlBackup: 'postgres://grafite_backup@127.0.0.1:1/grafite',
  urlRestauracao: 'postgres://postgres@127.0.0.1:1/postgres',
  pastaPgBin: pasta,
  exigirMarca: false,
});

/** A API com a fila, a operadora num endereço novo e as tarefas do servidor. */
async function apiDoServidor(
  ambiente: 'producao' | 'teste' | 'desenvolvimento',
  operacao: Partial<ServidorDaOperacao> = {},
) {
  enderecos += 1;
  const endereco = `grafite-${enderecos}.operadora.local`;
  const api = await abrirApi({
    ambiente,
    organizacaoOperadora: endereco,
    tarefas: tarefasDaApi,
    intervaloDaFila: 0.5,
    operacao: {
      pastaDosArquivos: pasta,
      backup: backupQueFalha(),
      certificadoVigiar: 'grafite.empresa.local',
      novasTentativas: { limite: 0, espera: 0 },
      ...operacao,
    },
  });
  abertas.push(api);
  const operadora = await criarOrganizacao(api, { nome: 'Operadora', enderecos: [endereco] });
  await api.app.ready();
  return { api, operadora };
}

const agendamentos = async () =>
  Object.fromEntries(
    (await boss.getSchedules())
      .filter((agendamento) =>
        (Object.values(TAREFAS_DO_SERVIDOR) as string[]).includes(agendamento.name),
      )
      .map(({ name, cron, timezone, data }) => [name, { cron, timezone, data }]),
  );

describe('agendamento das tarefas do servidor', () => {
  it('na produção, agenda o backup às 02:00 de São Paulo, o teste no domingo e a vigilância', async () => {
    const { operadora } = await apiDoServidor('producao');
    expect(await agendamentos()).toEqual({
      backup: {
        cron: '0 2 * * *',
        timezone: 'America/Sao_Paulo',
        data: { orgId: operadora, pedidoPor: 'agenda' },
      },
      'teste-de-restauracao': {
        cron: '0 3 * * 0',
        timezone: 'America/Sao_Paulo',
        data: { orgId: operadora },
      },
      'vigilancia-do-certificado': {
        cron: '0 8 * * *',
        timezone: 'America/Sao_Paulo',
        data: { orgId: operadora },
      },
    });
  });

  it.each(['teste', 'desenvolvimento'] as const)('no %s, não agenda nada', async (ambiente) => {
    await apiDoServidor('producao');
    expect(Object.keys(await agendamentos())).toHaveLength(3);
    await apiDoServidor(ambiente);
    expect(await agendamentos()).toEqual({});
  });

  it('sem o backup configurado, agenda só a vigilância do certificado', async () => {
    await apiDoServidor('producao', { backup: undefined });
    expect(Object.keys(await agendamentos())).toEqual(['vigilancia-do-certificado']);
  });
});

describe('um backup de cada vez', () => {
  let fila: FilaDeTarefas;

  afterEach(async () => {
    await fila?.parar();
  });

  it('o pedido com um backup rodando espera, e um terceiro não entra', async () => {
    const api = await abrirApi();
    abertas.push(api);
    const contexto: ContextoDasTarefas = {
      banco: api.banco,
      armazenamento: armazenamentoEmMemoria(),
      agora: () => new Date(),
      log: { info: () => {}, warn: () => {}, error: () => {} },
      enviar: async () => null,
    };
    const real = tarefasDoServidor(contexto, {
      ambiente: 'producao',
      versao: '1.2.3',
      pastaDosArquivos: pasta,
      backup: backupQueFalha(),
    }).find((tarefa) => tarefa.nome === 'backup');
    if (!real) throw new Error('O catálogo não tem o backup.');

    const historico: string[] = [];
    let liberar = () => {};
    const segura = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    let rodando = 0;
    fila = criarFila({
      conexao: inject('urlApp'),
      avisar: () => {},
      intervaloDeConsulta: 0.5,
      tarefas: [
        tarefaDasFalhas(contexto),
        {
          ...real,
          trabalho: async (dados: unknown) => {
            rodando += 1;
            historico.push(`começou com ${rodando} rodando`);
            if (historico.length === 1) await segura;
            rodando -= 1;
            historico.push(`terminou ${JSON.stringify(dados)}`);
          },
        },
      ],
    });
    await fila.iniciar();
    const orgId = '0199a3f0-0000-7000-8000-000000000001';

    expect(await fila.enviar('backup', { orgId, pedidoPor: 'agenda' })).not.toBeNull();
    await vi.waitFor(() => expect(historico).toEqual(['começou com 1 rodando']), {
      timeout: 15_000,
    });
    expect(await fila.enviar('backup', { orgId, pedidoPor: 'tela' })).not.toBeNull();
    expect(await fila.enviar('backup', { orgId, pedidoPor: 'tela' })).toBeNull();

    liberar();
    await vi.waitFor(() => expect(historico).toHaveLength(4), { timeout: 15_000 });
    expect(historico).toEqual([
      'começou com 1 rodando',
      `terminou {"orgId":"${orgId}","pedidoPor":"agenda"}`,
      'começou com 1 rodando',
      `terminou {"orgId":"${orgId}","pedidoPor":"tela"}`,
    ]);
  });
});

describe('a falha esgotada', () => {
  it('vai para as tarefas da organização operadora, e não para as das outras', async () => {
    // A fila do backup já existe, com as novas tentativas padrão, a 15 min uma da outra, e sem o
    // destino das falhas, como outro arquivo ou uma versão anterior a deixaria: a partida da API
    // deste teste aplica as opções dela, sem novas tentativas e com o destino.
    if (!(await boss.getQueue('backup'))) await boss.createQueue('backup', { policy: 'stately' });
    await boss.updateQueue('backup', { retryLimit: 2, retryDelay: 15 * 60, deadLetter: null });
    const { api, operadora } = await apiDoServidor('producao');
    const outra = await criarOrganizacao(api, {
      nome: 'Cliente',
      enderecos: [`grafite-${enderecos}.cliente.local`],
    });

    await boss.send('backup', { orgId: operadora, pedidoPor: 'tela' });

    const falhasDa = (orgId: string) =>
      naOrganizacao(api.banco, orgId, (tx) =>
        tx
          .select({ tarefa: tarefasComFalha.tarefa, erro: tarefasComFalha.erro })
          .from(tarefasComFalha),
      );
    await vi.waitFor(async () => expect(await falhasDa(operadora)).toHaveLength(1), {
      timeout: 20_000,
    });
    expect(await falhasDa(operadora)).toEqual([
      { tarefa: 'backup', erro: expect.stringMatching(/ECONNREFUSED/) },
    ]);
    expect(await falhasDa(outra)).toEqual([]);
    const { rows } = await api.dono.query(
      "select situacao, pedido_por from operacao.backups where situacao = 'falhou'",
    );
    expect(rows).toContainEqual({ situacao: 'falhou', pedido_por: 'tela' });
    await api.dono.query('delete from operacao.backups');
  });
});
