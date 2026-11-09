// As notificações dos alertas na avaliação (spec notificacoes, "Notificações dos alertas"; change
// p3b-notificacoes-no-servidor, design, decisões 3 e 4): quem vê o alerta no escopo ganha a
// notificação quando ele abre, sem o silêncio, sem a conta inativa e sem repetir; mais de 5 de uma
// vez viram uma só; o evento vai só às contas notificadas.
import {
  contas,
  estadoDosAtivos,
  eventos,
  naOrganizacao,
  notificacoes,
  regrasDeAlerta,
  silenciosDosAtivos,
  alertas as tabelaDosAlertas,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type AlertasDeTeste,
  contatoDoColetor,
  criarAtivoDoTipo,
  criarColetor,
  criarTipo,
  gravarEstado,
  montarAlertas,
} from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';
import { avaliarOrganizacao } from './avaliacao.ts';

const host = 'grafite.notificacoes-dos-alertas.local';
const MINUTO = 60_000;

let api: ApiDeTeste;
let alertas: AlertasDeTeste;
let impressora = '';
let coletor = '';
let doRh = '';
let deCampinas = '';

beforeAll(async () => {
  api = await abrirApi();
  alertas = await montarAlertas(api, host);
  const { org } = alertas;
  coletor = await criarColetor(api, org, {
    nome: 'Coletor do CPD',
    ultimoContatoEm: api.relogio.agora(),
  });
  impressora = await criarTipo(api, org, {
    nome: 'Impressora',
    capacidades: ['snmp.suprimentos'],
  });
  doRh = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora do RH',
    patrimonio: 'PAT-00412',
    localId: alertas.jundiai,
  });
  deCampinas = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora de Campinas',
    patrimonio: 'PAT-00500',
    localId: alertas.campinas,
  });
  // A primeira avaliação cria as regras de fábrica, que os testes ajustam.
  await naOrganizacao(api.banco, org, (tx) =>
    avaliarOrganizacao(tx, { agora: api.relogio.agora() }),
  );
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await contatoDoColetor(api, alertas.org, coletor, api.relogio.agora());
  await naOrganizacao(api.banco, alertas.org, async (tx) => {
    await tx.delete(notificacoes);
    await tx.delete(estadoDosAtivos);
    await tx.delete(eventos);
    await tx.delete(tabelaDosAlertas);
    await tx.delete(silenciosDosAtivos);
    await tx
      .update(regrasDeAlerta)
      .set({ duracao: 0 })
      .where(eq(regrasDeAlerta.fabrica, 'toner-10'));
    await tx.update(contas).set({ situacao: 'ativa' });
  });
});

const toner = (ativoId: string, nivel: number) =>
  gravarEstado(api, alertas.org, {
    ativoId,
    coletorId: coletor,
    metrica: 'impressora.suprimento',
    item: '1',
    momento: api.relogio.agora(),
    valorNumero: nivel,
    detalhes: { descricao: 'Black Toner Cartridge', capacidade: 100, nivel },
  });

const avaliar = () =>
  naOrganizacao(api.banco, alertas.org, (tx) =>
    avaliarOrganizacao(tx, { agora: api.relogio.agora() }),
  );

/** As notificações gravadas, de quem são, pelo nome do usuário. */
async function notificadas() {
  const porConta = new Map(
    Object.entries(alertas.contas).map(([usuario, conta]) => [conta.id, usuario]),
  );
  const linhas = await naOrganizacao(api.banco, alertas.org, (tx) =>
    tx.select().from(notificacoes).orderBy(notificacoes.criadaEm, notificacoes.id),
  );
  return linhas.map((linha) => ({ ...linha, usuario: porConta.get(linha.contaId) }));
}

const usuarios = async () => (await notificadas()).map(({ usuario }) => usuario).sort();

describe('notificações dos alertas', () => {
  it('quem vê o alerta no local do ativo ganha a notificação dele, com o evento só para essas contas', async () => {
    await toner(doRh, 8);
    await avaliar();
    // Ana trata e Davi vê na organização inteira; Bruno trata só em Campinas; Carla não vê alertas.
    expect(await usuarios()).toEqual(['ana', 'davi']);
    const [alerta] = await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx.select({ id: tabelaDosAlertas.id }).from(tabelaDosAlertas),
    );
    expect((await notificadas())[0]).toMatchObject({
      severidade: 'critico',
      titulo: 'Black Toner Cartridge em 8%',
      descricao: 'Impressora do RH · PAT-00412',
      origem: 'Alertas',
      destino: `/ativos/${doRh}`,
      alertaId: alerta?.id,
      lidaEm: null,
      criadaEm: api.relogio.agora(),
    });
    const doTipo = await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx
        .select({ contas: eventos.contas })
        .from(eventos)
        .where(eq(eventos.tipo, 'notificacoes.mudaram')),
    );
    expect(doTipo).toHaveLength(1);
    expect([...(doTipo[0]?.contas ?? [])].sort()).toEqual(
      [alertas.contas.ana.id, alertas.contas.davi.id].sort(),
    );
  });

  it('a avaliação põe a entrega das notificações na fila, na transação dela', async () => {
    await toner(doRh, 8);
    const pedidas: Array<{ tarefa: string; dados: unknown }> = [];
    await naOrganizacao(api.banco, alertas.org, (tx) =>
      avaliarOrganizacao(tx, {
        agora: api.relogio.agora(),
        enviar: async (tarefa, dados, opcoes) => {
          expect(opcoes?.tx).toBe(tx);
          pedidas.push({ tarefa, dados });
          return null;
        },
      }),
    );
    const ids = (await notificadas()).map(({ id }) => id).sort();
    expect(pedidas).toEqual([
      { tarefa: 'entregar-notificacoes', dados: { orgId: alertas.org, ids: expect.any(Array) } },
    ]);
    const pedida = pedidas[0]?.dados as { ids: string[] } | undefined;
    expect([...(pedida?.ids ?? [])].sort()).toEqual(ids);
  });

  it('em Campinas, quem trata os alertas só lá também ganha', async () => {
    await toner(deCampinas, 5);
    await avaliar();
    expect(await usuarios()).toEqual(['ana', 'bruno', 'davi']);
  });

  it('o alerta que muda de texto, ou continua aberto, não notifica de novo', async () => {
    await toner(doRh, 8);
    await avaliar();
    await toner(doRh, 7);
    await avaliar();
    await avaliar();
    expect((await notificadas()).map(({ titulo }) => titulo)).toEqual([
      'Black Toner Cartridge em 8%',
      'Black Toner Cartridge em 8%',
    ]);
  });

  it('o alerta que se resolve e abre de novo notifica outra vez', async () => {
    await toner(doRh, 8);
    await avaliar();
    await toner(doRh, 80);
    await avaliar();
    await toner(doRh, 6);
    await avaliar();
    expect(
      (await notificadas()).filter(({ usuario }) => usuario === 'ana').map(({ titulo }) => titulo),
    ).toEqual(['Black Toner Cartridge em 8%', 'Black Toner Cartridge em 6%']);
  });

  it('o pendente notifica só quando abre, depois da duração da regra', async () => {
    await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx.update(regrasDeAlerta).set({ duracao: 5 }).where(eq(regrasDeAlerta.fabrica, 'toner-10')),
    );
    await toner(doRh, 8);
    await avaliar();
    expect(await notificadas()).toEqual([]);
    api.relogio.avancar(5 * MINUTO);
    await contatoDoColetor(api, alertas.org, coletor, api.relogio.agora());
    await toner(doRh, 8);
    await avaliar();
    expect(await usuarios()).toEqual(['ana', 'davi']);
  });

  it('o alerta que abre com o ativo silenciado não notifica, nem quando o silêncio termina', async () => {
    await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx.insert(silenciosDosAtivos).values({
        orgId: alertas.org,
        ativoId: doRh,
        ate: new Date(api.relogio.agora().getTime() + 10 * MINUTO),
        criadoPor: alertas.contas.ana.id,
      }),
    );
    await toner(doRh, 8);
    await avaliar();
    api.relogio.avancar(11 * MINUTO);
    await contatoDoColetor(api, alertas.org, coletor, api.relogio.agora());
    await toner(doRh, 8);
    await avaliar();
    expect(await notificadas()).toEqual([]);
  });

  it('a conta inativa não ganha a notificação', async () => {
    await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx.update(contas).set({ situacao: 'inativa' }).where(eq(contas.id, alertas.contas.davi.id)),
    );
    await toner(doRh, 8);
    await avaliar();
    expect(await usuarios()).toEqual(['ana']);
  });

  it('mais de 5 alertas de uma vez viram uma notificação só, com a severidade mais alta', async () => {
    const seis = [doRh];
    for (let i = 0; i < 5; i += 1) {
      seis.push(
        await criarAtivoDoTipo(api, alertas.org, {
          tipoId: impressora,
          nome: `Impressora ${i}`,
          localId: alertas.jundiai,
        }),
      );
    }
    for (const ativoId of seis) await toner(ativoId, 3);
    await avaliar();
    expect((await notificadas()).filter(({ usuario }) => usuario === 'ana')).toEqual([
      expect.objectContaining({
        severidade: 'critico',
        titulo: '6 alertas abertos',
        descricao: null,
        destino: '/alertas',
        alertaId: null,
      }),
    ]);
  });

  it('o alerta de um coletor só alcança quem vê os alertas na organização inteira', async () => {
    api.relogio.avancar(11 * MINUTO);
    await avaliar();
    const doColetor = (await notificadas()).filter(
      ({ titulo }) => titulo === 'Coletor sem contato',
    );
    expect(doColetor.map(({ usuario }) => usuario).sort()).toEqual(['ana', 'davi']);
    expect(doColetor[0]).toMatchObject({
      descricao: 'Coletor do CPD',
      destino: `/administracao/coletores/${coletor}`,
    });
  });
});
