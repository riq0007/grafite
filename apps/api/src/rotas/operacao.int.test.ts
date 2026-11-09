// As rotas da operação (specs backup e modulo-administracao; design do F2d, decisão 15): só na
// organização que opera o servidor e para quem tem backup.administrar; nas outras, 404 como o de um
// endereço que não existe.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { auditoria, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
} from '../../test/integracao.ts';
import { tarefasDaApi } from '../fila/tarefas.ts';
import { TAREFAS_DO_SERVIDOR } from '../operacao/tarefas.ts';

const OPERADORA = 'grafite.operadora-rotas.local';
const CLIENTE = 'grafite.cliente-rotas.local';
const SEM_BACKUP = 'grafite.sem-backup.local';

let api: ApiDeTeste;
let semBackup: ApiDeTeste;
let boss: PgBoss;
let pasta: string;
let operadora = '';
let destinoUm = '';
let ana: Entrada;
let bruno: Entrada;
let zeca: Entrada;
let carla: Entrada;
let cliente: ReturnType<typeof clienteDaApi>;

beforeAll(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-rotas-da-operacao-'));
  destinoUm = resolve(pasta, 'Backups Grafite');
  boss = new PgBoss({ connectionString: inject('urlApp'), schema: 'fila', migrate: false });
  await boss.start();
  api = await abrirApi({
    ambiente: 'producao',
    organizacaoOperadora: OPERADORA,
    tarefas: tarefasDaApi,
    // A fila liga, mas só volta a procurar tarefas depois dos testes: o backup pedido fica nela.
    intervaloDaFila: 600,
    operacao: {
      pastaDosArquivos: pasta,
      backup: {
        destinos: [destinoUm, resolve(pasta, 'nas')],
        retencao: { diarios: 7, semanais: 4, mensais: 12 },
        janela: { inicio: '00:00', fim: '06:00' },
        teste: 'semanal',
        urlBackup: 'postgres://grafite_backup@127.0.0.1:1/grafite',
        urlRestauracao: 'postgres://postgres@127.0.0.1:1/postgres',
        pastaPgBin: pasta,
        exigirMarca: false,
      },
    },
  });
  semBackup = await abrirApi({
    ambiente: 'producao',
    organizacaoOperadora: SEM_BACKUP,
    operacao: { pastaDosArquivos: pasta },
  });
  operadora = await criarOrganizacao(api, { nome: 'Operadora', enderecos: [OPERADORA] });
  const clienteId = await criarOrganizacao(api, { nome: 'Cliente', enderecos: [CLIENTE] });
  const semBackupId = await criarOrganizacao(api, { nome: 'Sem backup', enderecos: [SEM_BACKUP] });

  const backup = await criarPerfil(api, operadora, {
    nome: 'Backup',
    permissoes: ['backup.administrar'],
  });
  const daAna = await criarConta(api, operadora, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, operadora, { perfilId: backup, contaId: daAna.id });
  await criarConta(api, operadora, { usuario: 'bruno', nome: 'Bruno Costa' });
  const doCliente = await criarPerfil(api, clienteId, {
    nome: 'Backup',
    permissoes: ['backup.administrar'],
  });
  const doZeca = await criarConta(api, clienteId, { usuario: 'zeca', nome: 'Zeca Lima' });
  await atribuir(api, clienteId, { perfilId: doCliente, contaId: doZeca.id });
  const naSemBackup = await criarPerfil(api, semBackupId, {
    nome: 'Backup',
    permissoes: ['backup.administrar'],
  });
  const daCarla = await criarConta(api, semBackupId, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, semBackupId, { perfilId: naSemBackup, contaId: daCarla.id });

  cliente = clienteDaApi(api, OPERADORA);
  ana = await cliente.entrar('ana');
  bruno = await cliente.entrar('bruno');
  zeca = await clienteDaApi(api, CLIENTE).entrar('zeca');
  carla = await clienteDaApi(semBackup, SEM_BACKUP).entrar('carla');

  // Os registros: um backup feito com um destino que saiu da configuração, um removido pela
  // retenção, um que falhou e o último teste de restauração. Os de outros arquivos de teste saem antes.
  await api.dono.query('delete from operacao.testes_de_restauracao');
  await api.dono.query('delete from operacao.backups');
  await api.dono.query(
    `insert into operacao.backups
       (iniciado_em, terminado_em, situacao, pedido_por, tamanho, destinos, pasta, manifesto, removido_em)
     values
       ('2026-09-30T05:00Z', '2026-09-30T05:03Z', 'feito', 'agenda', 1000, '[]', '2026-09-30T0500Z', '{}', '2026-10-02T05:03Z'),
       ('2026-10-01T05:00Z', '2026-10-01T05:04Z', 'feito', 'agenda', 52428800, $1, '2026-10-01T0500Z', '{}', null)`,
    [
      JSON.stringify([
        { destino: destinoUm, situacao: 'gravado' },
        { destino: 'D:\\Antigo', situacao: 'gravado' },
      ]),
    ],
  );
  await api.dono.query(
    `insert into operacao.backups (iniciado_em, terminado_em, situacao, pedido_por, destinos, erro)
     values ('2026-10-02T05:00Z', '2026-10-02T05:01Z', 'falhou', 'tela', $1, 'O disco ficou sem espaço.')`,
    [
      JSON.stringify([
        { destino: destinoUm, situacao: 'falhou', erro: 'O disco ficou sem espaço.' },
      ]),
    ],
  );
  await api.dono.query(
    `insert into operacao.testes_de_restauracao (iniciado_em, terminado_em, backup_id, situacao, detalhes)
     select '2026-09-27T06:00Z', '2026-09-27T06:10Z', id, 'feito', '{"tabelas": 20, "linhas": 340, "arquivos": 4}'
       from operacao.backups where pasta = '2026-10-01T0500Z'`,
  );
});

afterAll(async () => {
  // O banco de teste é um só: os registros, a agenda e as tarefas da fila voltam ao que eram.
  await api?.dono?.query('delete from operacao.testes_de_restauracao');
  await api?.dono?.query('delete from operacao.backups');
  await api?.dono?.query("update operacao.agenda set horario = '02:00', dia_do_teste = 0");
  if (await boss?.getQueue('backup')) await boss?.deleteAllJobs('backup');
  await api?.fechar();
  await semBackup?.fechar();
  for (const nome of Object.values(TAREFAS_DO_SERVIDOR)) await boss?.unschedule(nome);
  await boss?.stop({ graceful: false });
  await rm(pasta, { recursive: true, force: true });
});

describe('GET /operacao/backups', () => {
  it('mostra os backups guardados do mais novo ao mais antigo, o próximo horário e o último teste', async () => {
    const r = await cliente.consultar('/operacao/backups', ana);
    expect(r.statusCode).toBe(200);
    const estado = r.json();
    expect(estado).toMatchObject({
      configurado: true,
      agenda: {
        horario: '02:00',
        diaDoTeste: 0,
        janela: { inicio: '00:00', fim: '06:00' },
        teste: 'semanal',
      },
      // 02:00 de São Paulo depois das 09:00 de 2 de outubro: 3 de outubro, 05:00 UTC.
      proximoBackup: '2026-10-03T05:00:00.000Z',
    });
    expect(estado.backups).toEqual([
      {
        id: expect.any(String),
        iniciadoEm: '2026-10-02T05:00:00.000Z',
        terminadoEm: '2026-10-02T05:01:00.000Z',
        situacao: 'falhou',
        pedidoPor: 'tela',
        tamanho: null,
        destinos: [{ destino: destinoUm, situacao: 'falhou', erro: 'O disco ficou sem espaço.' }],
        erro: 'O disco ficou sem espaço.',
      },
      {
        id: expect.any(String),
        iniciadoEm: '2026-10-01T05:00:00.000Z',
        terminadoEm: '2026-10-01T05:04:00.000Z',
        situacao: 'feito',
        pedidoPor: 'agenda',
        tamanho: 52428800,
        destinos: [{ destino: destinoUm, situacao: 'gravado', erro: null }],
        erro: null,
      },
    ]);
    expect(estado.ultimoTeste).toMatchObject({
      iniciadoEm: '2026-09-27T06:00:00.000Z',
      situacao: 'feito',
      erro: null,
      backup: { pasta: '2026-10-01T0500Z', iniciadoEm: '2026-10-01T05:00:00.000Z' },
      detalhes: { tabelas: 20, linhas: 340, arquivos: 4 },
    });
  });

  it('noutra organização responde 404, como um endereço que não existe, mesmo com a permissão', async () => {
    const naoExiste = await clienteDaApi(api, CLIENTE).consultar('/operacao/nada', zeca);
    const r = await clienteDaApi(api, CLIENTE).consultar('/operacao/backups', zeca);
    expect(r.statusCode).toBe(404);
    const { codigoDeRastreio: _, ...corpo } = r.json();
    const { codigoDeRastreio: __, ...corpoDoQueNaoExiste } = naoExiste.json();
    expect(corpo).toEqual(corpoDoQueNaoExiste);
  });

  it('sem a permissão, recusa com 403', async () => {
    const r = await cliente.consultar('/operacao/backups', bruno);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ permissao: 'backup.administrar' });
  });

  it('no servidor sem backup configurado, diz isso', async () => {
    const r = await clienteDaApi(semBackup, SEM_BACKUP).consultar('/operacao/backups', carla);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ configurado: false, proximoBackup: null });
  });
});

describe('POST /operacao/backups/pedidos', () => {
  it('põe o backup na fila e audita o pedido', async () => {
    const r = await cliente.enviar('POST', '/operacao/backups/pedidos', ana);
    expect(r.statusCode).toBe(202);
    expect(r.json()).toEqual({ jaNaFila: false });
    expect(await auditoriaDaRequisicao(api, operadora, r)).toMatchObject([
      { acao: 'backup.solicitado', alvoTipo: 'backup' },
    ]);
    const naFila = await boss.findJobs('backup', { data: { orgId: operadora, pedidoPor: 'tela' } });
    expect(naFila.filter((tarefa) => tarefa.state === 'created')).toHaveLength(1);
  });

  it('com um backup rodando, o pedido espera; um terceiro não entra de novo', async () => {
    const rodando = await boss.fetch('backup');
    expect(rodando).toHaveLength(1);

    const espera = await cliente.enviar('POST', '/operacao/backups/pedidos', ana);
    expect(espera.json()).toEqual({ jaNaFila: false });
    const terceiro = await cliente.enviar('POST', '/operacao/backups/pedidos', ana);
    expect(terceiro.statusCode).toBe(202);
    expect(terceiro.json()).toEqual({ jaNaFila: true });
    expect(await auditoriaDaRequisicao(api, operadora, terceiro)).toEqual([]);
  });

  it('no servidor sem backup configurado, recusa dizendo isso', async () => {
    const r = await clienteDaApi(semBackup, SEM_BACKUP).enviar(
      'POST',
      '/operacao/backups/pedidos',
      carla,
    );
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ detail: 'O backup não está configurado neste servidor.' });
  });
});

describe('PUT /operacao/agenda', () => {
  it('muda o horário e o dia do teste, audita o antes e o depois e reagenda', async () => {
    const r = await cliente.enviar('PUT', '/operacao/agenda', ana, {
      horario: '03:30',
      diaDoTeste: 6,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      agenda: { horario: '03:30', diaDoTeste: 6 },
      proximoBackup: '2026-10-03T06:30:00.000Z',
    });
    expect(await auditoriaDaRequisicao(api, operadora, r)).toMatchObject([
      {
        acao: 'agenda-do-backup.alterada',
        dados: {
          antes: { horario: '02:00', diaDoTeste: 0 },
          depois: { horario: '03:30', diaDoTeste: 6 },
        },
      },
    ]);
    const agendamentos = await boss.getSchedules('backup');
    expect(agendamentos.map(({ cron, timezone }) => ({ cron, timezone }))).toEqual([
      { cron: '30 3 * * *', timezone: 'America/Sao_Paulo' },
    ]);
    const [teste] = await boss.getSchedules('teste-de-restauracao');
    expect(teste?.cron).toBe('30 4 * * 6');
    const eventos = await naOrganizacao(api.banco, operadora, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'agenda-do-backup.alterada')),
    );
    expect(eventos).toHaveLength(1);
  });

  it('recusa o horário fora da janela da configuração', async () => {
    const r = await cliente.enviar('PUT', '/operacao/agenda', ana, {
      horario: '14:00',
      diaDoTeste: 0,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      campos: { horario: 'Escolha um horário entre 00:00 e 06:00.' },
    });
  });

  it.each([
    [{ horario: '3:30', diaDoTeste: 0 }, 'horario', 'Use o formato HH:MM, como 02:00.'],
    [{ horario: '03:30', diaDoTeste: 7 }, 'diaDoTeste', 'Escolha um dia da semana.'],
  ])('recusa %j', async (pedido, campo, mensagem) => {
    const r = await cliente.enviar('PUT', '/operacao/agenda', ana, pedido);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toMatchObject({ [campo]: mensagem });
  });
});
