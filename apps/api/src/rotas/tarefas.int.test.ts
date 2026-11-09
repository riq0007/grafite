// As tarefas com falha (spec fila-de-tarefas; design do F2c, decisão 15): a tarefa que falha em
// todas as tentativas entra na lista da organização dela, com o evento, e quem administra as
// tarefas a vê, paginada, e a põe de novo na fila, na mesma transação da auditoria. A tarefa da
// instalação, sem organização, vai para o log. As tarefas que falham existem só aqui.
import { eventos, naOrganizacao, tarefasComFalha } from '@grafite/db';
import { and, eq, sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { z } from 'zod';
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
import { type DefinicaoDeTarefa, tarefasDaApi } from '../fila/tarefas.ts';

const host = 'grafite.tarefas.local';
const hostDaOutra = 'grafite.tarefas-outra.local';

let api: ApiDeTeste;
let org = '';
let outra = '';
let cliente: ReturnType<typeof clienteDaApi>;
/** Administra as tarefas. */
let ana: Entrada;
/** Sem permissão. */
let bruno: Entrada;
/** Administra as tarefas na outra organização. */
let zeca: Entrada;
const registros: { dados: object; mensagem: string }[] = [];
let tentativasDaPassageira = 0;

/** As tarefas que só os testes têm: uma que falha uma vez, uma que sempre falha e uma da instalação. */
const tarefasDoTeste: DefinicaoDeTarefa[] = [
  {
    nome: 'teste-passageira',
    rotulo: 'Tarefa passageira do teste',
    dados: z.object({ orgId: z.uuid() }),
    opcoes: { retryLimit: 1, retryDelay: 0, deadLetter: 'tarefas-com-falha' },
    async trabalho() {
      tentativasDaPassageira += 1;
      if (tentativasDaPassageira === 1) throw new Error('Falha passageira.');
    },
  },
  {
    nome: 'teste-que-falha',
    rotulo: 'Tarefa que falha do teste',
    dados: z.object({ orgId: z.uuid() }),
    opcoes: { retryLimit: 1, retryDelay: 0, deadLetter: 'tarefas-com-falha' },
    async trabalho() {
      throw new Error(`O disco encheu. ${'x'.repeat(600)}`);
    },
  },
  {
    nome: 'teste-da-instalacao',
    rotulo: 'Tarefa da instalação do teste',
    dados: z.object({}),
    opcoes: { retryLimit: 0, deadLetter: 'tarefas-com-falha' },
    async trabalho() {
      throw new Error('A instalação falhou.');
    },
  },
];

beforeAll(async () => {
  api = await abrirApi({
    tarefas: (contexto) => [
      ...tarefasDaApi({
        ...contexto,
        log: {
          info: () => {},
          warn: (dados, mensagem) => registros.push({ dados, mensagem }),
          error: (dados, mensagem) => registros.push({ dados, mensagem }),
        },
      }),
      ...tarefasDoTeste,
    ],
    intervaloDaFila: 0.5,
  });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  outra = await criarOrganizacao(api, { nome: 'Outra', enderecos: [hostDaOutra] });
  cliente = clienteDaApi(api, host);
  const administrar = await criarPerfil(api, org, {
    nome: 'Tarefas',
    permissoes: ['tarefas.administrar'],
  });
  const daAna = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administrar, contaId: daAna.id });
  await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  const naOutra = await criarPerfil(api, outra, {
    nome: 'Tarefas',
    permissoes: ['tarefas.administrar'],
  });
  const doZeca = await criarConta(api, outra, { usuario: 'zeca', nome: 'Zeca Lima' });
  await atribuir(api, outra, { perfilId: naOutra, contaId: doZeca.id });
  ana = await cliente.entrar('ana');
  bruno = await cliente.entrar('bruno');
  zeca = await clienteDaApi(api, hostDaOutra).entrar('zeca');
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.delete(tarefasComFalha);
    await tx.delete(eventos);
  });
});

/** Põe uma tarefa na fila da API, como as tarefas fazem. */
async function enviar(tarefa: string, dados: object) {
  const boss = new PgBoss({ connectionString: inject('urlApp'), schema: 'fila', migrate: false });
  await boss.start();
  try {
    return await boss.send(tarefa, dados);
  } finally {
    await boss.stop({ graceful: false });
  }
}

const daLista = (orgId = org) =>
  naOrganizacao(api.banco, orgId, (tx) => tx.select().from(tarefasComFalha));

/** Uma tarefa com falha gravada direto, como se a fila a tivesse registrado. */
const falhaGravada = (falhouEm: Date, tarefa = 'manutencao') =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(tarefasComFalha)
      .values({
        orgId: org,
        tarefa,
        dados: { orgId: org },
        tentativas: 6,
        erro: 'O banco não respondeu.',
        falhouEm,
      })
      .returning({ id: tarefasComFalha.id });
    return linha?.id ?? '';
  });

/** Quantas tarefas da organização estão na fila, esperando para rodar. */
const naFila = async (tarefa: string) => {
  const { rows } = await api.banco.execute<{ quantas: number }>(
    sql`select count(*)::int as quantas from fila.job
        where name = ${tarefa} and data->>'orgId' = ${org} and state in ('created', 'retry', 'active')`,
  );
  return rows[0]?.quantas ?? 0;
};

describe('a falha das tarefas', () => {
  it('a manutenção tenta de novo 5 vezes, a partir de 1 min, dobrando até 1 h, e as falhas vão para a lista', async () => {
    const boss = new PgBoss({ connectionString: inject('urlApp'), schema: 'fila', migrate: false });
    await boss.start();
    try {
      expect(await boss.getQueue('manutencao')).toMatchObject({
        retryLimit: 5,
        retryDelay: 60,
        retryBackoff: true,
        retryDelayMax: 3600,
        deadLetter: 'tarefas-com-falha',
      });
      expect(await boss.getQueue('manutencao-diaria')).toMatchObject({
        deadLetter: 'tarefas-com-falha',
      });
    } finally {
      await boss.stop({ graceful: false });
    }
  });

  it('a falha passageira roda de novo, conclui e não entra na lista', async () => {
    await enviar('teste-passageira', { orgId: org });
    await vi.waitFor(() => expect(tentativasDaPassageira).toBe(2), { timeout: 15_000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await daLista()).toEqual([]);
  });

  it('a falha final entra só na lista da organização, com o erro cortado e o evento', async () => {
    await enviar('teste-que-falha', { orgId: org });
    await vi.waitFor(async () => expect(await daLista()).toHaveLength(1), { timeout: 15_000 });
    const [falha] = await daLista();
    expect(falha).toMatchObject({
      tarefa: 'teste-que-falha',
      dados: { orgId: org },
      tentativas: 2,
      falhouEm: api.relogio.agora(),
    });
    expect(falha?.erro).toHaveLength(500);
    expect(falha?.erro.startsWith('O disco encheu.')).toBe(true);
    expect(await daLista(outra)).toEqual([]);
    const gravados = await naOrganizacao(api.banco, org, (tx) => tx.select().from(eventos));
    expect(gravados).toMatchObject([
      {
        tipo: 'tarefas.mudaram',
        alvoTipo: 'tarefa',
        alvoId: falha?.id,
        permissao: 'tarefas.administrar',
      },
    ]);
  });

  it('a tarefa da instalação vai para o log, com o código e o erro, e não entra em lista nenhuma', async () => {
    const codigo = await enviar('teste-da-instalacao', {});
    await vi.waitFor(
      () =>
        expect(registros).toContainEqual({
          dados: { tarefa: 'teste-da-instalacao', codigo, erro: 'A instalação falhou.' },
          mensagem: 'tarefa da instalação com falha',
        }),
      { timeout: 15_000 },
    );
    expect(await daLista()).toEqual([]);
  });
});

describe('GET /tarefas-com-falha', () => {
  it('lista as tarefas com falha, da mais recente, com o nome em pt-BR, por cursor', async () => {
    const agora = api.relogio.agora().getTime();
    const antiga = await falhaGravada(new Date(agora - 3000));
    const media = await falhaGravada(new Date(agora - 2000), 'teste-que-falha');
    const nova = await falhaGravada(new Date(agora - 1000));
    const primeira = await cliente.consultar('/tarefas-com-falha?limite=2', ana);
    expect(primeira.statusCode).toBe(200);
    expect(primeira.json().itens).toEqual([
      {
        id: nova,
        tarefa: 'manutencao',
        nome: 'Manutenção diária',
        tentativas: 6,
        erro: 'O banco não respondeu.',
        falhouEm: new Date(agora - 1000).toISOString(),
      },
      expect.objectContaining({ id: media, nome: 'Tarefa que falha do teste' }),
    ]);
    const segunda = await cliente.consultar(
      `/tarefas-com-falha?limite=2&cursor=${encodeURIComponent(primeira.json().proximo)}`,
      ana,
    );
    expect(segunda.json().itens.map((item: { id: string }) => item.id)).toEqual([antiga]);
    expect(segunda.json().proximo).toBeNull();
  });

  it('sem tarefas.administrar, recusa com 403', async () => {
    const r = await cliente.consultar('/tarefas-com-falha', bruno);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ permissao: 'tarefas.administrar' });
  });

  it('a lista de outra organização não traz estas', async () => {
    await falhaGravada(api.relogio.agora());
    const r = await clienteDaApi(api, hostDaOutra).consultar('/tarefas-com-falha', zeca);
    expect(r.json().itens).toEqual([]);
  });
});

describe('POST /tarefas-com-falha/:id/repeticao', () => {
  it('põe a tarefa de novo na fila, tira da lista e audita, numa transação só', async () => {
    const id = await falhaGravada(api.relogio.agora());
    const antes = await naFila('manutencao');
    const r = await cliente.enviar('POST', `/tarefas-com-falha/${id}/repeticao`, ana);
    expect(r.statusCode).toBe(204);
    expect(await daLista()).toEqual([]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'tarefa.repetida',
        alvoTipo: 'tarefa',
        alvoId: id,
        dados: { tarefa: 'manutencao', erro: 'O banco não respondeu.', tentativas: 6 },
      },
    ]);
    // A manutenção roda logo, então ela pode já ter terminado: vale ter entrado na fila.
    const { rows } = await api.banco.execute<{ quantas: number }>(
      sql`select count(*)::int as quantas from fila.job where name = 'manutencao' and data->>'orgId' = ${org}`,
    );
    expect(rows[0]?.quantas).toBeGreaterThan(antes);
    const gravados = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(eventos).where(eq(eventos.tipo, 'tarefas.mudaram')),
    );
    expect(gravados).toHaveLength(1);
  });

  it('se a transação falha, a tarefa continua na lista e não entra na fila', async () => {
    const id = await falhaGravada(api.relogio.agora());
    const { rows: antes } = await api.banco.execute<{ quantas: number }>(
      sql`select count(*)::int as quantas from fila.job where name = 'manutencao' and data->>'orgId' = ${org}`,
    );
    await api.dono.query(
      "create function public.falhar_no_teste() returns trigger language plpgsql as $$ begin raise exception 'falha do teste'; end $$",
    );
    // Adiado, o gatilho falha no commit, depois de a tarefa ir para a fila: só a mesma transação a
    // tira de lá.
    await api.dono.query(
      "create constraint trigger falhar_no_teste after insert on public.auditoria deferrable initially deferred for each row when (new.acao = 'tarefa.repetida') execute function public.falhar_no_teste()",
    );
    try {
      const r = await cliente.enviar('POST', `/tarefas-com-falha/${id}/repeticao`, ana);
      expect(r.statusCode).toBe(500);
    } finally {
      await api.dono.query('drop trigger falhar_no_teste on public.auditoria');
      await api.dono.query('drop function public.falhar_no_teste()');
    }
    expect((await daLista()).map((linha) => linha.id)).toEqual([id]);
    const { rows: depois } = await api.banco.execute<{ quantas: number }>(
      sql`select count(*)::int as quantas from fila.job where name = 'manutencao' and data->>'orgId' = ${org}`,
    );
    expect(depois[0]?.quantas).toBe(antes[0]?.quantas);
  });

  it('a tarefa que saiu do catálogo nesta versão não volta à fila: 409, e ela fica na lista', async () => {
    const id = await falhaGravada(api.relogio.agora(), 'tarefa-removida');
    const r = await cliente.enviar('POST', `/tarefas-com-falha/${id}/repeticao`, ana);
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:conflito' });
    expect((await daLista()).map((linha) => linha.id)).toEqual([id]);
  });

  it('com a fila parada, recusa com 503, e a tarefa fica na lista', async () => {
    const semFila = await abrirApi({ relogio: api.relogio });
    try {
      const id = await falhaGravada(api.relogio.agora());
      const r = await clienteDaApi(semFila, host).enviar(
        'POST',
        `/tarefas-com-falha/${id}/repeticao`,
        ana,
      );
      expect(r.statusCode).toBe(503);
      expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:fila-indisponivel' });
      expect((await daLista()).map((linha) => linha.id)).toEqual([id]);
    } finally {
      await semFila.fechar();
    }
  });

  it('sem tarefas.administrar, recusa com 403; e a tarefa de outra organização não existe aqui', async () => {
    const id = await falhaGravada(api.relogio.agora());
    expect(
      (await cliente.enviar('POST', `/tarefas-com-falha/${id}/repeticao`, bruno)).statusCode,
    ).toBe(403);
    const pelaOutra = await clienteDaApi(api, hostDaOutra).enviar(
      'POST',
      `/tarefas-com-falha/${id}/repeticao`,
      zeca,
    );
    expect(pelaOutra.statusCode).toBe(404);
    expect(
      await naOrganizacao(api.banco, org, (tx) =>
        tx
          .select()
          .from(tarefasComFalha)
          .where(and(eq(tarefasComFalha.id, id))),
      ),
    ).toHaveLength(1);
  });
});

describe('rotinas', () => {
  it('Rotinas: o nome, o que faz, a agenda, a última execução e a próxima', async () => {
    const r = await cliente.consultar('/tarefas/rotinas', ana);
    expect(r.statusCode).toBe(200);
    const rotinas = r.json().rotinas as { nome: string; agenda: string; proxima: string | null }[];
    expect(rotinas.find((rotina) => rotina.nome === 'Manutenção diária')).toMatchObject({
      agenda: 'Todo dia às 03:30',
      descricao: expect.stringContaining('Apaga o que venceu'),
      proxima: expect.any(String),
    });
    expect(rotinas.map((rotina) => rotina.nome)).toEqual(
      expect.arrayContaining(['Avaliação dos indicadores', 'Backups do Control iD']),
    );
    expect(rotinas.find((rotina) => rotina.nome === 'Backups do Control iD')?.agenda).toBe(
      'A cada 5 minutos',
    );
  });

  it('quem não administra as tarefas não vê as rotinas', async () => {
    expect((await cliente.consultar('/tarefas/rotinas', bruno)).statusCode).toBe(403);
  });
});
