// O desempenho dos alertas (change p3a-regras-e-alertas, design, riscos): com 10 mil ativos pingados
// e lidos pelo SNMP, 2 mil deles com o toner no fim, a avaliação da organização fica abaixo de 2 s, e
// a lista dos abertos, abaixo de 300 ms no p95. O pedido da lista passa pela API inteira, sem a rede.
// A primeira avaliação, que abre os 2 mil, notifica cada conta que os vê com uma notificação só,
// abaixo de 10 s (change p3b-notificacoes-no-servidor, design, riscos).
import { campos, naOrganizacao, notificacoes, tiposDeAtivo } from '@grafite/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { type AlertasDeTeste, criarColetor, montarAlertas } from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';
import { avaliarOrganizacao } from '../alertas/avaliacao.ts';

const host = 'grafite.alertas-desempenho.local';
const ATIVOS = 10_000;
const COM_TONER_NO_FIM = 2_000;
const AVALIACOES = 6;
const PEDIDOS = 20;

let api: ApiDeTeste;
let alertas: AlertasDeTeste;
let primeiraAvaliacao = Number.POSITIVE_INFINITY;

const avaliar = () =>
  naOrganizacao(api.banco, alertas.org, (tx) =>
    avaliarOrganizacao(tx, { agora: api.relogio.agora() }),
  );

beforeAll(async () => {
  api = await abrirApi();
  alertas = await montarAlertas(api, host);
  const { org, jundiai, campinas } = alertas;
  const coletor = await criarColetor(api, org, {
    faixas: ['10.0.0.0/16'],
    ultimoContatoEm: api.relogio.agora(),
  });
  await naOrganizacao(api.banco, org, async (tx) => {
    const [ip] = await tx
      .insert(campos)
      .values({ orgId: org, rotulo: 'IP', rotuloNormalizado: 'ip', tipo: 'ip' })
      .returning({ id: campos.id });
    const campoDoIp = ip?.id ?? '';
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Impressora',
        nomeNormalizado: 'impressora',
        icone: 'impressora',
        capacidades: ['rede.disponibilidade', 'snmp.suprimentos'],
        configuracaoDasCapacidades: {
          'rede.disponibilidade': { campoDoIp },
          'snmp.suprimentos': { campoDoIp },
        },
      })
      .returning({ id: tiposDeAtivo.id });
    // Os 10 mil ativos de uma vez, metade em Jundiaí e metade em Campinas, com o ping e a resposta
    // do SNMP de agora, e o toner de 2 mil deles em 5%.
    await tx.execute(sql`
      insert into ativos (org_id, tipo_id, nome, busca, local_id, valores)
      select ${org}, ${tipo?.id}, 'Impressora ' || i, 'impressora ' || i,
        case when i % 2 = 0 then ${jundiai}::uuid else ${campinas}::uuid end,
        jsonb_build_object(${campoDoIp}::text, '10.0.' || (i / 250) || '.' || (i % 250 + 1))
      from generate_series(1, ${ATIVOS}) as i
    `);
    const agora = api.relogio.agora();
    await tx.execute(sql`
      insert into estado_dos_ativos
        (org_id, ativo_id, metrica, item, momento, valor_texto, situacao, desde, coletor_id)
      select ${org}, a.id, m.metrica, '', ${agora}, m.valor, 'valida', ${agora}, ${coletor}
      from ativos a
      cross join (values ('rede.disponibilidade', 'online'), ('snmp.resposta', 'respondeu'))
        as m(metrica, valor)
      where a.org_id = ${org}
    `);
    await tx.execute(sql`
      insert into estado_dos_ativos
        (org_id, ativo_id, metrica, item, momento, valor_numero, situacao, detalhes, desde, coletor_id)
      select ${org}, a.id, 'impressora.suprimento', '1', ${agora}, 5, 'valida',
        '{"descricao": "Toner preto", "capacidade": 100, "nivel": 5}'::jsonb, ${agora}, ${coletor}
      from ativos a
      where a.org_id = ${org}
      order by a.id
      limit ${COM_TONER_NO_FIM}
    `);
  });
  // As estatísticas em dia, como o autovacuum as deixa (ver o teste de desempenho da lista).
  await api.dono.query('analyze ativos');
  await api.dono.query('analyze estado_dos_ativos');
  // A primeira avaliação abre os 2 mil alertas do toner e notifica quem os vê.
  const inicio = performance.now();
  await avaliar();
  primeiraAvaliacao = performance.now() - inicio;
  await api.dono.query('analyze alertas');
}, 300_000);

afterAll(async () => {
  await api?.fechar();
});

it(`a primeira avaliação abre os ${COM_TONER_NO_FIM} alertas e dá uma notificação só a cada conta, abaixo de 10 s`, async () => {
  console.info(`Primeira avaliação, com as notificações: ${primeiraAvaliacao.toFixed(0)} ms.`);
  expect(primeiraAvaliacao).toBeLessThan(10_000);
  const gravadas = await naOrganizacao(api.banco, alertas.org, (tx) =>
    tx.select({ contaId: notificacoes.contaId, titulo: notificacoes.titulo }).from(notificacoes),
  );
  const daAna = gravadas.filter(({ contaId }) => contaId === alertas.contas.ana.id);
  expect(daAna).toEqual([
    { contaId: alertas.contas.ana.id, titulo: `${COM_TONER_NO_FIM} alertas abertos` },
  ]);
});

it(`a avaliação de ${ATIVOS} ativos, com ${COM_TONER_NO_FIM} alertas abertos, fica abaixo de 2 s`, async () => {
  const tempos: number[] = [];
  for (let vez = 0; vez < AVALIACOES; vez++) {
    const inicio = performance.now();
    expect(await avaliar()).toEqual({ mudou: false });
    tempos.push(performance.now() - inicio);
  }
  tempos.sort((a, b) => a - b);
  const pior = tempos.at(-1) ?? Number.POSITIVE_INFINITY;
  const mediana = tempos[Math.floor(AVALIACOES / 2)] ?? Number.POSITIVE_INFINITY;
  console.info(
    `Avaliação de ${ATIVOS} ativos: mediana de ${mediana.toFixed(0)} ms e pior de ${pior.toFixed(0)} ms.`,
  );
  expect(mediana).toBeLessThan(2_000);
}, 120_000);

it(`a lista dos abertos, com ${COM_TONER_NO_FIM} alertas, fica abaixo de 300 ms no p95`, async () => {
  const listar = () => alertas.cliente.consultar('/alertas?limite=100', alertas.como('ana'));
  const primeira = await listar();
  expect(primeira.json().total).toBe(COM_TONER_NO_FIM);
  for (let vez = 0; vez < 3; vez++) await listar();
  const tempos: number[] = [];
  for (let vez = 0; vez < PEDIDOS; vez++) {
    const inicio = performance.now();
    const r = await listar();
    tempos.push(performance.now() - inicio);
    expect(r.statusCode).toBe(200);
  }
  tempos.sort((a, b) => a - b);
  const p95 = tempos[Math.ceil(PEDIDOS * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  console.info(`Lista de ${COM_TONER_NO_FIM} alertas abertos: p95 de ${p95.toFixed(0)} ms.`);
  expect(p95).toBeLessThan(300);
}, 120_000);
