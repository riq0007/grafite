// Os backups do Control iD pela API (spec backup-do-control-id e coletor-local, "Pedidos ao
// coletor"; change p5a-backup-do-control-id, design, decisões 2 a 9): o pedido pela ficha e o
// repetido, o coletor que busca e responde com o ZIP ou a falha, a resposta de outro coletor, o
// conteúdo, a foto, o download, quem só vê, a exclusão, a agenda, a expiração e a retenção.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ativos,
  auditoria,
  backupsDoControlId,
  campos,
  naOrganizacao,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { ziparArquivos } from '@grafite/operacao';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type CofreDeTeste, montarCofre } from '../../test/cofre.ts';
import { type ApiDeTeste, abrirApi, atribuir, criarPerfil, novoIp } from '../../test/integracao.ts';
import { gerarCodigoTotp } from '../acesso/totp.ts';
import { criarColetor } from '../coleta/coletores.ts';
import { agendarEExpirar } from '../controlid/backups.ts';

const host = 'grafite.backups-control-id.local';
const TOKEN = `token-do-coletor-dos-backups-${'x'.repeat(40)}`;
const OUTRO_TOKEN = `token-de-outro-coletor-${'y'.repeat(40)}`;
const SENHA = 's3nha-dos-controles';

let api: ApiDeTeste;
let cofre: CofreDeTeste;
let org = '';
let pasta = '';
const ids: Record<string, string> = {};
const id = (nome: string) => ids[nome] ?? '';

/** Os pedidos de um coletor, como ele faz. */
const doColetor = (token: string) => {
  const headers = {
    host,
    authorization: `Bearer ${token}`,
    'x-grafite-versao-do-coletor': '0.4.0',
  };
  return {
    pedidos: () =>
      api.app.inject({ method: 'GET', url: '/coleta/pedidos', remoteAddress: novoIp(), headers }),
    arquivo: (pedido: string, conteudo: Buffer) =>
      api.app.inject({
        method: 'PUT',
        url: `/coleta/pedidos/${pedido}/arquivo`,
        remoteAddress: novoIp(),
        headers: { ...headers, 'content-type': 'application/zip' },
        payload: conteudo,
      }),
    falha: (pedido: string, mensagem: string) =>
      api.app.inject({
        method: 'POST',
        url: `/coleta/pedidos/${pedido}/falha`,
        remoteAddress: novoIp(),
        headers,
        payload: { mensagem },
      }),
  };
};

/** Um ZIP no formato do PMG, com as categorias e as fotos dadas. */
async function zipDoBackup({
  erroNaBiometria = false,
}: {
  erroNaBiometria?: boolean;
} = {}): Promise<Buffer> {
  const dir = await mkdtemp(join(pasta, 'zip-'));
  const tabelas: Record<string, unknown[]> = {
    users: [
      { id: 1, name: 'Marina Alves', registration: '4821', password: 'x', salt: 'y' },
      { id: 2, name: 'Rafael Costa', registration: '4822' },
    ],
    groups: [{ id: 10, name: 'Expedição' }],
    user_groups: [{ user_id: 1, group_id: 10 }],
    cards: [{ id: 100, value: 1234567, user_id: 1 }],
    templates: erroNaBiometria ? [] : [{ id: 7, user_id: 1, finger_position: 1 }],
    access_rules: [{ id: 5, name: 'Horário comercial', type: 1, priority: 0 }],
    group_access_rules: [{ group_id: 10, access_rule_id: 5 }],
    time_zones: [{ id: 3, name: 'Comercial' }],
    time_spans: [{ id: 30, time_zone_id: 3, start: 28800, end: 64800, mon: 1, fri: 1 }],
    access_rule_time_zones: [{ access_rule_id: 5, time_zone_id: 3 }],
  };
  const categorias = Object.entries(tabelas).map(([categoria, linhas]) =>
    categoria === 'templates' && erroNaBiometria
      ? { category: categoria, status: 'ERRO', count: 0, error: 'HTTP 500' }
      : { category: categoria, status: 'OK', count: linhas.length },
  );
  categorias.push({ category: 'face_images', status: 'OK', count: 1 });
  const nomes: string[] = [];
  for (const [categoria, linhas] of Object.entries(tabelas)) {
    await writeFile(join(dir, `${categoria}.json`), JSON.stringify(linhas));
    nomes.push(`${categoria}.json`);
  }
  await writeFile(
    join(dir, 'metadata.json'),
    JSON.stringify({
      version: 'grafite-controlid-1',
      system_info: { serial: '0M0100/123', firmware: '6.4.2', product_name: 'iDFace' },
      categories: categorias,
    }),
  );
  await writeFile(join(dir, 'device_info.json'), JSON.stringify({ serial: '0M0100/123' }));
  await mkdir(join(dir, 'face_images'));
  await writeFile(join(dir, 'face_images', 'user_1.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  nomes.push('metadata.json', 'device_info.json', 'face_images/user_1.jpg');
  const destino = join(dir, 'backup.zip');
  await ziparArquivos(dir, nomes, destino);
  return readFile(destino);
}

async function tipo(nome: string, capacidades: string[], configuracao: Record<string, unknown>) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        icone: 'generico',
        capacidades,
        configuracaoDasCapacidades: configuracao,
      })
      .returning({ id: tiposDeAtivo.id });
    return linha?.id ?? '';
  });
}

async function controle(tipoId: string, ip: string | null, patrimonio: string) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId,
        busca: '',
        patrimonio,
        localId: cofre.jundiai,
        valores: ip === null ? {} : { [id('ip')]: ip },
      } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    return linha?.id ?? '';
  });
}

beforeAll(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-backups-'));
  api = await abrirApi();
  cofre = await montarCofre(api, host);
  org = cofre.org;
  await naOrganizacao(api.banco, org, async (tx) => {
    const [ip] = await tx
      .insert(campos)
      .values({ orgId: org, rotulo: 'IP', rotuloNormalizado: 'ip', tipo: 'ip' })
      .returning({ id: campos.id });
    ids.ip = ip?.id ?? '';
  });
  const r = await cofre.cliente.enviar('POST', '/cofre/segredos', cofre.como('ana'), {
    nome: 'Admin dos controles',
    tipo: 'conta-administrativa',
    classificacao: 'equipamento',
    identificador: 'admin',
    ativoIds: [],
    valor: SENHA,
  });
  expect(r.statusCode, r.body).toBe(201);
  ids.login = r.json().id;
  ids.tipo = await tipo('Controle de acesso', ['controlid.saude', 'controlid.backup'], {
    'controlid.saude': { campoDoIp: id('ip'), porta: 80, segredoId: id('login') },
    'controlid.backup': { horario: '02:00' },
  });
  ids.pat778 = await controle(id('tipo'), '10.0.7.78', 'PAT-00778');
  ids.pat779 = await controle(id('tipo'), '10.0.7.79', 'PAT-00779');
  ids.semIp = await controle(id('tipo'), null, 'PAT-00780');
  ids.longe = await controle(id('tipo'), '172.16.0.9', 'PAT-00781');
  await naOrganizacao(api.banco, org, async (tx) => {
    await criarColetor(tx, {
      nome: 'Coletor de Jundiaí',
      faixas: ['10.0.7.0/24'],
      token: TOKEN,
      ator: { tipo: 'sistema', descricao: 'Teste' },
      momento: api.relogio.agora(),
    });
    await criarColetor(tx, {
      nome: 'Coletor de outra rede',
      faixas: ['10.9.0.0/16'],
      token: OUTRO_TOKEN,
      ator: { tipo: 'sistema', descricao: 'Teste' },
      momento: api.relogio.agora(),
    });
  });
  const faz = await criarPerfil(api, org, {
    nome: 'Backup do Control iD',
    permissoes: ['controlid.backup'],
  });
  const ve = await criarPerfil(api, org, { nome: 'Vê backups', permissoes: ['controlid.ver'] });
  await atribuir(api, org, { perfilId: faz, contaId: cofre.contas.ana.id });
  await atribuir(api, org, { perfilId: ve, contaId: cofre.contas.carla.id });
});

afterAll(async () => {
  await api?.fechar();
  if (pasta) await rm(pasta, { recursive: true, force: true });
});

const pedir = (ativoId: string, quem: 'ana' | 'carla' = 'ana') =>
  cofre.cliente.enviar('POST', `/ativos/${ativoId}/backups-do-control-id`, cofre.como(quem));

describe('o backup pedido e o coletor', () => {
  it('Backup pedido pela ficha, e o Pedido repetido', async () => {
    const r = await pedir(id('pat778'));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      origem: 'manual',
      situacao: 'na-fila',
      pedidoPor: 'Ana Souza',
    });
    ids.primeiro = r.json().id;
    const repetido = await pedir(id('pat778'));
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().detail).toBe('Já há um backup deste controle na fila.');
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ acao: auditoria.acao })
        .from(auditoria)
        .where(and(eq(auditoria.alvoId, id('primeiro')))),
    );
    expect(registros.map((registro) => registro.acao)).toContain('backup-do-control-id.pedido');
  });

  it('o controle sem IP e o que nenhum coletor alcança ficam como Falha, com o motivo', async () => {
    const semIp = await pedir(id('semIp'));
    expect(semIp.json()).toMatchObject({
      situacao: 'falha',
      erro: 'O controle está sem o IP que a saúde do Control iD usa.',
    });
    const longe = await pedir(id('longe'));
    expect(longe.json()).toMatchObject({
      situacao: 'falha',
      erro: 'Nenhum coletor alcança o IP deste controle.',
    });
  });

  it('Backup buscado pelo coletor da rede, e a Resposta de outro coletor', async () => {
    const r = await doColetor(TOKEN).pedidos();
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().pedidos).toEqual([
      {
        id: id('primeiro'),
        tipo: 'backup',
        ativoId: id('pat778'),
        backupId: null,
        categorias: null,
        rotulo: 'Controle de acesso',
        ip: '10.0.7.78',
        porta: 80,
        usuario: 'admin',
        senha: SENHA,
      },
    ]);
    expect((await doColetor(TOKEN).pedidos()).json().pedidos).toEqual([]);
    const deOutro = await doColetor(OUTRO_TOKEN).arquivo(id('primeiro'), await zipDoBackup());
    expect(deOutro.statusCode).toBe(409);
  });

  it('Backup completo: o ZIP fica guardado, com os registros, as fotos e o modelo', async () => {
    const r = await doColetor(TOKEN).arquivo(id('primeiro'), await zipDoBackup());
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ situacao: 'sucesso' });
    const lido = await cofre.cliente.consultar(
      `/controlid/backups/${id('primeiro')}`,
      cofre.como('ana'),
    );
    expect(lido.json()).toMatchObject({
      situacao: 'sucesso',
      temArquivo: true,
      registros: 11,
      fotos: 1,
      serie: '0M0100/123',
      firmware: '6.4.2',
      modelo: 'iDFace',
      coletor: 'Coletor de Jundiaí',
    });
  });

  it('Pessoa procurada no backup, com a foto, sem a senha', async () => {
    const r = await cofre.cliente.consultar(
      `/controlid/backups/${id('primeiro')}/conteudo?aba=pessoas&busca=marina`,
      cofre.como('carla'),
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().total).toBe(1);
    expect(r.json().linhas[0]).toEqual({
      id: '1',
      titulo: 'Marina Alves',
      detalhes: [
        { rotulo: 'Matrícula', valor: '4821' },
        { rotulo: 'Cartões', valor: '1234567' },
        { rotulo: 'Grupos', valor: 'Expedição' },
        { rotulo: 'Digitais', valor: '1' },
      ],
      foto: true,
    });
    expect(JSON.stringify(r.json())).not.toContain('salt');
    const horarios = await cofre.cliente.consultar(
      `/controlid/backups/${id('primeiro')}/conteudo?aba=horarios`,
      cofre.como('carla'),
    );
    expect(horarios.json().linhas[0].detalhes).toEqual([
      { rotulo: 'Intervalo', valor: 'Seg, Sex · 08:00 às 18:00' },
    ]);
    const foto = await cofre.cliente.consultar(
      `/controlid/backups/${id('primeiro')}/fotos/1`,
      cofre.como('carla'),
    );
    expect(foto.statusCode).toBe(200);
    expect(foto.headers['content-type']).toBe('image/jpeg');
  });

  it('ZIP baixado, com o nome do controle e a data, e a auditoria', async () => {
    const r = await cofre.cliente.consultar(
      `/controlid/backups/${id('primeiro')}/arquivo`,
      cofre.como('carla'),
    );
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/zip');
    expect(String(r.headers['content-disposition'])).toContain(
      'controlid-pat-00778-2026-10-02-0900.zip',
    );
  });

  it('Login recusado: a falha do coletor fica no backup', async () => {
    const r = await pedir(id('pat779'));
    const pedido = r.json().id as string;
    ids.recusado = pedido;
    await doColetor(TOKEN).pedidos();
    const falha = await doColetor(TOKEN).falha(pedido, 'O controle recusou o login do cofre.');
    expect(falha.json()).toEqual({ situacao: 'falha' });
    const lido = await cofre.cliente.consultar(`/controlid/backups/${pedido}`, cofre.como('ana'));
    expect(lido.json()).toMatchObject({
      situacao: 'falha',
      erro: 'O controle recusou o login do cofre.',
      temArquivo: false,
    });
  });

  it('Quem só vê: lê a lista, sem pedir nem apagar', async () => {
    const lista = await cofre.cliente.consultar('/controlid/backups', cofre.como('carla'));
    expect(lista.statusCode).toBe(200);
    expect(lista.json().podeFazer).toBe(false);
    expect(lista.json().itens.every((item: { podeApagar: boolean }) => !item.podeApagar)).toBe(
      true,
    );
    expect((await pedir(id('pat779'), 'carla')).statusCode).toBe(403);
    const apagar = await cofre.cliente.enviar(
      'DELETE',
      `/controlid/backups/${id('primeiro')}`,
      cofre.como('carla'),
    );
    expect(apagar.statusCode).toBe(403);
  });

  it('Histórico na ficha, do mais novo para o mais antigo', async () => {
    const r = await cofre.cliente.consultar(
      `/ativos/${id('pat778')}/backups-do-control-id`,
      cofre.como('ana'),
    );
    expect(r.json()).toMatchObject({ podeFazer: true, horario: '02:00' });
    expect(r.json().itens.map((item: { id: string }) => item.id)).toEqual([id('primeiro')]);
  });
});

describe('a agenda, a expiração e a retenção', () => {
  it('Agenda depois de um servidor parado e Coletor desligado', async () => {
    // 08:00 em São Paulo: o agendado das 02:00 entra uma vez só.
    const as8 = new Date('2026-10-03T11:00:00.000Z');
    const feito = await naOrganizacao(api.banco, org, (tx) => agendarEExpirar(tx, as8));
    expect(feito.agendados).toBeGreaterThan(0);
    const de779 = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ origem: backupsDoControlId.origem, situacao: backupsDoControlId.situacao })
        .from(backupsDoControlId)
        .where(
          and(
            eq(backupsDoControlId.ativoId, id('pat779')),
            eq(backupsDoControlId.origem, 'agendado'),
          ),
        ),
    );
    expect(de779).toEqual([{ origem: 'agendado', situacao: 'na-fila' }]);
    const deNovo = await naOrganizacao(api.banco, org, (tx) =>
      agendarEExpirar(tx, new Date('2026-10-03T11:05:00.000Z')),
    );
    expect(deNovo.agendados).toBe(0);
    // Às 10:00, 2 horas depois, o agendado que o coletor não buscou vira Falha.
    const as10 = await naOrganizacao(api.banco, org, (tx) =>
      agendarEExpirar(tx, new Date('2026-10-03T13:00:00.000Z')),
    );
    expect(as10.expirados).toBeGreaterThan(0);
    const expirado = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ situacao: backupsDoControlId.situacao, erro: backupsDoControlId.erro })
        .from(backupsDoControlId)
        .where(
          and(
            eq(backupsDoControlId.ativoId, id('pat779')),
            eq(backupsDoControlId.origem, 'agendado'),
          ),
        ),
    );
    expect(expirado).toEqual([
      { situacao: 'falha', erro: 'O coletor não buscou o pedido em 2 horas.' },
    ]);
  });

  it('Oitavo dia: o backup novo tira o que sai pela retenção, com o arquivo', async () => {
    const agora = api.relogio.agora();
    const dias = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60_000);
    const antigos = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .insert(backupsDoControlId)
        .values(
          [3, 9, 10, 40, 41].map((n) => ({
            orgId: org,
            ativoId: id('pat778'),
            origem: 'agendado' as const,
            situacao: 'sucesso' as const,
            pedidoEm: dias(n),
            concluidoEm: dias(n),
          })),
        )
        .returning({ id: backupsDoControlId.id }),
    );
    const r = await pedir(id('pat778'));
    await doColetor(TOKEN).pedidos();
    const fim = await doColetor(TOKEN).arquivo(
      r.json().id,
      await zipDoBackup({ erroNaBiometria: true }),
    );
    expect(fim.json()).toEqual({ situacao: 'parcial' });
    const ficaram = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ id: backupsDoControlId.id })
        .from(backupsDoControlId)
        .where(eq(backupsDoControlId.ativoId, id('pat778'))),
    );
    const restantes = new Set(ficaram.map((linha) => linha.id));
    // O de 10 dias (22/09) não é o último da semana de 21 a 27/09, que é o de 9 dias, nem o de
    // setembro: sai. O de 41 dias (22/08) não é o último de agosto, que é o de 40 dias: sai.
    const ficou = (i: number) => restantes.has(antigos[i]?.id ?? '');
    expect([0, 1, 2, 3, 4].map(ficou)).toEqual([true, true, false, true, false]);
  });

  // O primeiro saiu pela retenção, com o backup novo do mesmo dia; a falha do PAT-00779 é apagada.
  it('Backup apagado: sai com o arquivo', async () => {
    const r = await cofre.cliente.enviar(
      'DELETE',
      `/controlid/backups/${id('recusado')}`,
      cofre.como('ana'),
    );
    expect(r.statusCode, r.body).toBe(204);
    const lido = await cofre.cliente.consultar(
      `/controlid/backups/${id('recusado')}`,
      cofre.como('ana'),
    );
    expect(lido.statusCode).toBe(404);
  });

  // O manual que termina depois do agendado passa a ser o do dia, e a retenção apaga o agendado
  // ("Dois backups no mesmo dia"): a agenda, uma vez por dia, não pede outro no mesmo dia.
  it('Dois backups no mesmo dia: o manual depois do horário vale como o do dia', async () => {
    // 05/10, 15:00 em São Paulo: o manual terminou, e o agendado das 02:00 já saiu pela retenção.
    const [manual] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .insert(backupsDoControlId)
        .values({
          orgId: org,
          ativoId: id('pat779'),
          origem: 'manual',
          situacao: 'sucesso',
          pedidoEm: new Date('2026-10-05T18:00:00.000Z'),
          concluidoEm: new Date('2026-10-05T18:00:30.000Z'),
        })
        .returning({ id: backupsDoControlId.id }),
    );
    const as1505 = new Date('2026-10-05T18:05:00.000Z');
    await naOrganizacao(api.banco, org, (tx) => agendarEExpirar(tx, as1505));
    const agendadosDoDia = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ id: backupsDoControlId.id })
        .from(backupsDoControlId)
        .where(
          and(
            eq(backupsDoControlId.ativoId, id('pat779')),
            eq(backupsDoControlId.origem, 'agendado'),
            eq(backupsDoControlId.pedidoEm, as1505),
          ),
        ),
    );
    expect(agendadosDoDia).toEqual([]);
    // Os agendados dos outros controles e o manual saem, para não pesar nos testes seguintes.
    await naOrganizacao(api.banco, org, async (tx) => {
      await tx.delete(backupsDoControlId).where(eq(backupsDoControlId.pedidoEm, as1505));
      await tx.delete(backupsDoControlId).where(eq(backupsDoControlId.id, manual?.id ?? ''));
    });
  });
});

// As operações e o comparador (change p5b-comparacao-e-restauracao).
describe('as operações no controle e o comparador', () => {
  let backupBom = '';

  beforeAll(async () => {
    const restaura = await criarPerfil(api, org, {
      nome: 'Restauração do Control iD',
      permissoes: ['controlid.restaurar'],
    });
    await atribuir(api, org, { perfilId: restaura, contaId: cofre.contas.ana.id });
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ id: backupsDoControlId.id })
        .from(backupsDoControlId)
        .where(
          and(
            eq(backupsDoControlId.ativoId, id('pat778')),
            eq(backupsDoControlId.situacao, 'parcial'),
          ),
        ),
    );
    backupBom = linha?.id ?? '';
  });

  const operar = (corpo: object, quem: 'ana' | 'carla' = 'ana') =>
    cofre.cliente.enviar(
      'POST',
      `/controlid/backups/${backupBom}/operacoes`,
      cofre.como(quem),
      corpo,
    );

  it('Operação na fila, a Operação repetida e o coletor que responde', async () => {
    const r = await operar({ tipo: 'comparacao', ativo: id('pat778') });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ tipo: 'comparacao', situacao: 'na-fila' });
    const repetida = await operar({ tipo: 'comparacao', ativo: id('pat778') });
    expect(repetida.statusCode).toBe(409);
    expect(repetida.json().detail).toBe('Já há uma operação aberta neste controle.');
    const pedidos = (await doColetor(TOKEN).pedidos()).json().pedidos;
    expect(pedidos).toEqual([
      expect.objectContaining({ id: r.json().id, tipo: 'comparacao', backupId: backupBom }),
    ]);
    const zip = await api.app.inject({
      method: 'GET',
      url: `/coleta/pedidos/${r.json().id}/arquivo`,
      remoteAddress: novoIp(),
      headers: { host, authorization: `Bearer ${TOKEN}` },
    });
    expect(zip.statusCode).toBe(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    const fim = await api.app.inject({
      method: 'POST',
      url: `/coleta/pedidos/${r.json().id}/resultado`,
      remoteAddress: novoIp(),
      headers: { host, authorization: `Bearer ${TOKEN}` },
      payload: {
        categorias: [
          {
            categoria: 'users',
            situacao: 'ok',
            iguais: 1,
            soNoBackup: 1,
            soNoControle: 0,
            divergentes: 0,
          },
        ],
      },
    });
    expect(fim.json()).toEqual({ situacao: 'sucesso' });
    const lista = await cofre.cliente.consultar(
      `/ativos/${id('pat778')}/operacoes-do-control-id`,
      cofre.como('ana'),
    );
    expect(lista.json().itens[0]).toMatchObject({
      situacao: 'sucesso',
      resultado: [
        expect.objectContaining({ categoria: 'users', soNoBackup: 1, rotulo: 'Usuários' }),
      ],
    });
    expect(lista.json()).toMatchObject({ podeRestaurar: true, podeComparar: true });
  });

  it('Sem o código do app: a restauração é recusada, e com o código certo entra na fila', async () => {
    const errado = await operar({ tipo: 'restauracao', ativo: id('pat778'), codigo: '000000' });
    expect(errado.statusCode).toBe(403);
    expect(errado.json().detail).toBe('Código incorreto.');
    // O passo do código da entrada já foi usado: o seguinte vale.
    api.relogio.avancar(60_000);
    const certo = await operar({
      tipo: 'restauracao',
      ativo: id('pat778'),
      categorias: ['users', 'cards'],
      codigo: gerarCodigoTotp(cofre.contas.ana.chaveDoApp as Buffer, api.relogio.agora().getTime()),
    });
    expect(certo.statusCode, certo.body).toBe(201);
    expect(certo.json()).toMatchObject({
      tipo: 'restauracao',
      situacao: 'na-fila',
      categorias: [
        { categoria: 'users', rotulo: 'Usuários' },
        { categoria: 'cards', rotulo: 'Cartões' },
      ],
    });
  });

  it('Backup do PMG contra o CSV do controle: o comparador cruza as pessoas e os cartões', async () => {
    const csv = [
      'cid_data',
      'users',
      'id,name,registration',
      '1,Marina Alves,4821',
      '2,Rafael C.,4822',
      '3,Nova pessoa,4823',
      '',
      'cards',
      'id,value,user_id',
      '100,1234567,1',
      '',
    ].join('\n');
    const enviado = await cofre.cliente.enviarBytes(
      'POST',
      '/controlid/comparador/arquivos',
      cofre.como('carla'),
      Buffer.from(csv),
      'text/csv',
    );
    expect(enviado.statusCode, enviado.body).toBe(200);
    expect(enviado.json()).toMatchObject({ pessoas: 3, cartoes: 1 });
    const r = await cofre.cliente.enviar('POST', '/controlid/comparador', cofre.como('carla'), {
      a: { backup: backupBom },
      b: { arquivo: enviado.json().id },
    });
    expect(r.statusCode, r.body).toBe(200);
    const pessoas = r.json().tabelas[0];
    expect(pessoas).toMatchObject({
      tabela: 'users',
      rotulo: 'Pessoas',
      identicos: 1,
      divergentes: [
        {
          id: '2',
          nome: 'Rafael Costa',
          campos: [{ campo: 'name', a: 'Rafael Costa', b: 'Rafael C.' }],
        },
      ],
      soEmA: [],
      soEmB: [{ id: '3', nome: 'Nova pessoa' }],
    });
    const formato = await cofre.cliente.enviarBytes(
      'POST',
      '/controlid/comparador/arquivos',
      cofre.como('carla'),
      Buffer.from('oi'),
      'application/octet-stream',
    );
    expect(formato.statusCode).toBe(400);
    expect(formato.json().campos.arquivo).toBe(
      'Envie um ZIP de backup ou o CSV exportado pelo controle.',
    );
  });
});
