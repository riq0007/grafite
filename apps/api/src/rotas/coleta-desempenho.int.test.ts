// O desempenho da configuração da coleta (spec coletor-local, "Configuração da coleta"; design do
// P2a, decisão 6): com 10 mil ativos com IP, a configuração de um coletor, com a escolha do coletor de
// cada ativo pela faixa mais específica, responde em menos de 300 ms no p95. O pedido passa pela API
// inteira (o endereço, o token, os alvos e as faixas), sem a rede.
import { campos, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  clienteDoColetor,
  criarOrganizacao,
} from '../../test/integracao.ts';
import { criarColetor } from '../coleta/coletores.ts';

const host = 'grafite.coleta-desempenho.local';
const ATIVOS = 10_000;
const PEDIDOS = 20;
const TOKEN = `token-do-desempenho-${'x'.repeat(40)}`;

let api: ApiDeTeste;

beforeAll(async () => {
  api = await abrirApi();
  const org = await criarOrganizacao(api, { nome: 'Empresa grande', enderecos: [host] });
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
        capacidades: ['rede.disponibilidade'],
        configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp } },
      })
      .returning({ id: tiposDeAtivo.id });
    await criarColetor(tx, {
      nome: 'Coletor da unidade',
      faixas: ['10.0.0.0/16'],
      token: TOKEN,
      ator: { tipo: 'sistema', descricao: 'Teste' },
      momento: api.relogio.agora(),
    });
    await criarColetor(tx, {
      nome: 'Coletor da expedição',
      faixas: ['10.0.5.0/24', '10.0.6.0/24'],
      token: `${TOKEN}-2`,
      ator: { tipo: 'sistema', descricao: 'Teste' },
      momento: api.relogio.agora(),
    });
    // Os 10 mil ativos de uma vez, com os IPs espalhados pela faixa do coletor da unidade.
    await tx.execute(sql`
      insert into ativos (org_id, tipo_id, nome, busca, valores)
      select ${org}, ${tipo?.id}, 'Impressora ' || i, 'impressora ' || i,
        jsonb_build_object(${campoDoIp}::text, '10.0.' || (i / 250) || '.' || (i % 250 + 1))
      from generate_series(1, ${ATIVOS}) as i
    `);
  });
  // As estatísticas em dia, como o autovacuum as deixa (ver o teste de desempenho da lista).
  await api.dono.query('analyze ativos');
}, 180_000);

afterAll(async () => {
  await api?.fechar();
});

it(`a configuração de um coletor entre ${ATIVOS} ativos fica abaixo de 300 ms no p95`, async () => {
  const coletor = clienteDoColetor(api, host, TOKEN);
  for (let vez = 0; vez < 3; vez++) await coletor.configuracao();
  const tempos: number[] = [];
  for (let vez = 0; vez < PEDIDOS; vez++) {
    const inicio = performance.now();
    const r = await coletor.configuracao();
    tempos.push(performance.now() - inicio);
    expect(r.statusCode).toBe(200);
    // Os de 10.0.5.x e 10.0.6.x ficam com o coletor da expedição, de faixa mais específica.
    expect(r.json().alvos).toHaveLength(ATIVOS - 500);
  }
  tempos.sort((a, b) => a - b);
  const p95 = tempos[Math.ceil(PEDIDOS * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  console.info(
    `Configuração entre ${ATIVOS} ativos: p95 de ${p95.toFixed(0)} ms em ${PEDIDOS} pedidos.`,
  );
  expect(p95).toBeLessThan(300);
}, 120_000);
