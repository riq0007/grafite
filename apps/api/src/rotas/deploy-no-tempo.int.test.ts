// O Deploy no tempo pela API (spec distribuicao-de-software, "Deploy pelo agente do GLPI", "Quando
// instalar" e "Acordar os agentes"; change software-por-pacote, design, decisões 7, 8 e 8a): o
// `getJobs` só com o pedido que pode seguir; o `expiration` do CONTACT e do INVENTORY, até uma hora
// depois do próximo momento do pedido, e o `volta_ate` do agente; e a tarefa periódica, que chama as
// máquinas que não foram chamadas nas últimas 2 horas. O relógio começa às 15:00 de São Paulo.
import {
  agentes,
  ativos,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  pacotesDeSoftware,
  tiposDeAtivo,
  tokensDosAgentes,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';
import { hashDoToken } from '../agentes/agentes.ts';
import { TAREFA_DOS_AGENDADOS, tarefasDoSoftware } from '../software/acordar.ts';

const host = 'grafite.deploy-no-tempo.local';
const TOKEN = 'token-do-deploy-no-tempo-0123456789abcdef';
const ENDERECO = `/agentes/glpi/${TOKEN}`;
const FUSO = 'America/Sao_Paulo';
const MINUTO = 60_000;
const HORA = 60 * MINUTO;
let api: ApiDeTeste;
let org = '';
const maquinas: Record<string, string> = {};

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

/** O CONTACT ou o INVENTORY do agente, em JSON puro. */
const falar = (deviceid: string, action: 'contact' | 'inventory') =>
  api.app.inject({
    method: 'POST',
    url: ENDERECO,
    headers: { host, 'content-type': 'application/json' },
    payload: { action, deviceid, ...(action === 'inventory' ? { content: {} } : {}) },
  });

/** O `getJobs` do Deploy do agente. */
const pedirAsTarefas = (deviceid: string) =>
  api.app.inject({
    method: 'GET',
    url: `${ENDERECO}?action=getJobs&machineid=${deviceid}`,
    headers: { host },
  });

const maquina = (chave: string) =>
  naOrg(async (tx) => {
    const [linha] = await tx
      .select()
      .from(maquinasDasDistribuicoes)
      .where(eq(maquinasDasDistribuicoes.id, maquinas[chave] ?? ''));
    return linha;
  });

const agente = (deviceid: string) =>
  naOrg(async (tx) => {
    const [linha] = await tx.select().from(agentes).where(eq(agentes.deviceid, deviceid));
    return linha;
  });

/**
 * Uma volta da tarefa periódica, com o chamado simulado: o 10.8.0.13 não responde. O banco é o de
 * todos os arquivos dos testes, e a tarefa passa por todas as organizações dele: a volta devolve
 * só os IPs das máquinas desta que ficaram com o chamado do momento, lidos do banco pela
 * organização, e confere que o agente de cada uma recebeu o chamado.
 */
async function chamarOsAgendados() {
  const chamados: string[] = [];
  const [tarefa] = tarefasDoSoftware({
    banco: api.banco,
    armazenamento: api.armazenamento,
    agora: api.relogio.agora,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    enviar: async () => null,
    acordar: async (ip) => {
      chamados.push(ip);
      return ip !== '10.8.0.13';
    },
  }).filter(({ nome }) => nome === TAREFA_DOS_AGENDADOS);
  if (!tarefa) throw new Error('A tarefa dos agendados não está no catálogo.');
  await tarefa.trabalho(undefined, {
    tarefaId: 'teste',
    tentativa: 0,
    sinal: new AbortController().signal,
  });
  const momento = api.relogio.agora();
  const marcadas = await naOrg((tx) =>
    tx
      .select({ ip: agentes.ip })
      .from(maquinasDasDistribuicoes)
      .innerJoin(agentes, eq(agentes.id, maquinasDasDistribuicoes.agenteId))
      .where(eq(maquinasDasDistribuicoes.chamadaEm, momento)),
  );
  const ips = marcadas.map(({ ip }) => ip ?? '').sort();
  // Contém, e não igual: os agentes das outras organizações do banco também são chamados.
  expect(chamados).toEqual(expect.arrayContaining(ips));
  return ips;
}

beforeAll(async () => {
  api = await abrirApi();
  // 18:00 UTC: 15:00 em São Paulo.
  api.relogio.avancar(6 * HORA);
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await naOrg(async (tx) => {
    await tx
      .insert(tokensDosAgentes)
      .values({ orgId: org, hashDoToken: hashDoToken(TOKEN), criadoPor: ana.id });
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Computador',
        nomeNormalizado: normalizarTexto('Computador'),
        icone: 'computador',
      })
      .returning({ id: tiposDeAtivo.id });
    const [pacote] = await tx
      .insert(pacotesDeSoftware)
      .values({
        orgId: org,
        nome: '7-Zip 24.08',
        nomeNormalizado: normalizarTexto('7-Zip 24.08'),
        nomeNoInventarioNormalizado: normalizarTexto('7-Zip'),
        versao: '24.08',
        comando: 'msiexec /i "7z2408-x64.msi" /qn',
      })
      .returning({ id: pacotesDeSoftware.id });
    const distribuicao = async (
      quando: 'agora' | 'noite' | 'dia',
      aPartirDe: Date | null = null,
    ) => {
      const [linha] = await tx
        .insert(distribuicoes)
        .values({
          orgId: org,
          pacoteId: pacote?.id ?? '',
          criadaPor: ana.id,
          criadaEm: new Date('2026-10-02T11:00:00.000Z'),
          quando,
          aPartirDe,
          fuso: quando === 'agora' ? null : FUSO,
        })
        .returning({ id: distribuicoes.id });
      return linha?.id ?? '';
    };
    const daNoite = await distribuicao('noite');
    // 17:00 em São Paulo.
    const doDia = await distribuicao('dia', new Date('2026-10-02T20:00:00.000Z'));
    const deAgora = await distribuicao('agora');
    const emDia = new Date('2026-10-02T11:00:00.000Z');
    for (const [chave, distribuicaoId, ip, ultimoContato, chamadaEm] of [
      ['n1', daNoite, '10.8.0.1', emDia, null],
      ['p1', daNoite, '10.8.0.11', emDia, null],
      // Chamada às 21:05 de São Paulo.
      ['p2', daNoite, '10.8.0.12', emDia, new Date('2026-10-03T00:05:00.000Z')],
      ['p3', daNoite, '10.8.0.13', emDia, null],
      ['p4', daNoite, null, emDia, null],
      ['p5', daNoite, '10.8.0.15', new Date('2026-09-28T11:00:00.000Z'), null],
      ['d1', doDia, '10.8.0.2', emDia, null],
      ['a1', deAgora, '10.8.0.3', emDia, null],
    ] as const) {
      const [ativo] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: tipo?.id ?? '',
          busca: '',
          nome: `Estação ${chave.toUpperCase()}`,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      const [doAtivo] = await tx
        .insert(agentes)
        .values({
          orgId: org,
          deviceid: `${chave}-2024`,
          nome: chave,
          ip,
          ultimoContato,
          // Com o inventário lido, o CONTACT não troca o IP pelo de quem chama.
          ultimoInventario: emDia,
          ativoId: ativo?.id,
        })
        .returning({ id: agentes.id });
      const [linha] = await tx
        .insert(maquinasDasDistribuicoes)
        .values({
          orgId: org,
          distribuicaoId,
          ativoId: ativo?.id ?? '',
          agenteId: doAtivo?.id ?? '',
          chamadaEm,
          chamadaRespondeu: chamadaEm ? true : null,
        })
        .returning({ id: maquinasDasDistribuicoes.id });
      maquinas[chave] = linha?.id ?? '';
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

describe('o Deploy no tempo', () => {
  it('Fora da janela da noite: o getJobs não traz o pedido, e o CONTACT dá "480m"', async () => {
    const contato = await falar('n1-2024', 'contact');
    expect(contato.statusCode, contato.body).toBe(200);
    expect(contato.json()).toMatchObject({ status: 'ok', expiration: '480m' });
    // 23:00 em São Paulo: as 15:00 mais 480 minutos.
    expect((await agente('n1-2024'))?.voltaAte).toEqual(new Date('2026-10-03T02:00:00.000Z'));
    expect((await pedirAsTarefas('n1-2024')).json()).toEqual({});
    expect((await maquina('n1'))?.situacao).toBe('aguardando');
    const inventario = await falar('n1-2024', 'inventory');
    expect(inventario.statusCode, inventario.body).toBe(200);
    expect(inventario.json()).toEqual({ status: 'ok', expiration: '480m' });
  });

  it('o dia marcado dá até uma hora depois dele, e o agente sem pedido, as 24 horas', async () => {
    expect((await falar('d1-2024', 'contact')).json()).toMatchObject({ expiration: '180m' });
    expect((await agente('d1-2024'))?.voltaAte).toEqual(new Date('2026-10-02T21:00:00.000Z'));
    expect((await pedirAsTarefas('d1-2024')).json()).toEqual({});
    expect((await falar('livre-2024', 'contact')).json()).toMatchObject({ expiration: 24 });
    expect((await agente('livre-2024'))?.voltaAte).toEqual(new Date('2026-10-03T18:00:00.000Z'));
  });

  it('o pedido de agora segue no getJobs, com as 24 horas no CONTACT', async () => {
    expect((await falar('a1-2024', 'contact')).json()).toMatchObject({ expiration: 24 });
    const tarefas = await pedirAsTarefas('a1-2024');
    expect(tarefas.json().jobs).toEqual([expect.objectContaining({ uuid: maquinas.a1 })]);
    expect((await maquina('a1'))?.situacao).toBe('em-andamento');
  });

  it('Agentes acordados na janela: a tarefa periódica chama as que não foram chamadas nas últimas 2 horas', async () => {
    const [tarefa] = tarefasDoSoftware({
      banco: api.banco,
      armazenamento: api.armazenamento,
      agora: api.relogio.agora,
      log: { info: () => {}, warn: () => {}, error: () => {} },
      enviar: async () => null,
    }).filter(({ nome }) => nome === TAREFA_DOS_AGENDADOS);
    expect(tarefa?.agenda).toEqual({ cron: '*/15 * * * *', fuso: FUSO });

    // 15:00 em São Paulo: só o dia marcado ainda não chegou, e a noite, fora da janela.
    expect(await chamarOsAgendados()).toEqual([]);

    // 22:05 em São Paulo. Fora: a chamada às 21:05, a sem IP, a sem contato e a em andamento.
    api.relogio.avancar(7 * HORA + 5 * MINUTO);
    expect(await chamarOsAgendados()).toEqual(['10.8.0.1', '10.8.0.11', '10.8.0.13', '10.8.0.2']);
    expect(await maquina('p1')).toMatchObject({
      chamadaEm: new Date('2026-10-03T01:05:00.000Z'),
      chamadaRespondeu: true,
      log: ['Chamado às 22:05'],
    });
    expect(await maquina('p3')).toMatchObject({
      chamadaRespondeu: false,
      log: ['Chamado às 22:05, sem resposta'],
    });
    expect((await maquina('p2'))?.log).toEqual([]);

    // O agente que respondeu pede as tarefas na hora, dentro da janela.
    const tarefas = await pedirAsTarefas('n1-2024');
    expect(tarefas.json().jobs).toEqual([expect.objectContaining({ uuid: maquinas.n1 })]);

    // 22:20: ninguém de novo.
    api.relogio.avancar(15 * MINUTO);
    expect(await chamarOsAgendados()).toEqual([]);

    // 00:10: as que aguardam, chamadas há mais de 2 horas.
    api.relogio.avancar(HORA + 50 * MINUTO);
    expect(await chamarOsAgendados()).toEqual(['10.8.0.11', '10.8.0.12', '10.8.0.13', '10.8.0.2']);
    expect((await maquina('p3'))?.log).toEqual([
      'Chamado às 22:05, sem resposta',
      'Chamado às 00:10, sem resposta',
    ]);
  });
});
