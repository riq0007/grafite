// O desempenho do resumo do local (change relacoes-vivas, design, "Riscos": as contagens custam): com
// 10 mil ativos e mil pessoas espalhados numa árvore de 221 locais, o resumo da raiz, com os ativos e
// as pessoas aqui e com os de dentro, para uma conta com o escopo num ramo (as contagens recortadas,
// o caminho mais caro), responde em menos de 300 ms no p95, como a lista dos ativos.
import { naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
} from '../../test/integracao.ts';

const host = 'grafite.resumos-desempenho.local';
const ATIVOS = 10_000;
const PESSOAS = 1_000;
const PEDIDOS = 20;

let api: ApiDeTeste;
let entrada: Entrada;
let cliente: ReturnType<typeof clienteDaApi>;
let raiz = '';

beforeAll(async () => {
  api = await abrirApi();
  const org = await criarOrganizacao(api, { nome: 'Empresa grande', enderecos: [host] });
  cliente = clienteDaApi(api, host);

  raiz = await criarLocal(api, org, { nome: 'Matriz', tipo: 'unidade' });
  const setores: string[] = [];
  const salas: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const setor = await criarLocal(api, org, { nome: `Setor ${i}`, paiId: raiz });
    setores.push(setor);
    for (let j = 1; j <= 10; j++) {
      salas.push(await criarLocal(api, org, { nome: `Sala ${i}.${j}`, paiId: setor }));
    }
  }

  const ver = await criarPerfil(api, org, {
    nome: 'Ver no setor',
    permissoes: ['ativos.ver', 'pessoas.ver'],
  });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: ver, contaId: bruno.id, localId: setores[0] ?? '' });
  entrada = await cliente.entrar('bruno');

  await naOrganizacao(api.banco, org, async (tx) => {
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Impressora',
        nomeNormalizado: 'impressora',
        icone: 'impressora',
      })
      .returning({ id: tiposDeAtivo.id });
    // Os ativos e as pessoas de uma vez, pelas salas, com um em cada vinte inativo. As salas vão
    // como um só parâmetro, no formato de array do PostgreSQL.
    const comoArray = `{${salas.join(',')}}`;
    await tx.execute(sql`
      insert into ativos (org_id, tipo_id, nome, busca, local_id, situacao)
      select ${org}, ${tipo?.id ?? ''}, 'Impressora ' || i, 'impressora ' || i,
        (${comoArray}::uuid[])[1 + i % ${salas.length}],
        case when i % 20 = 0 then 'inativo' else 'ativo' end
      from generate_series(1, ${ATIVOS}) as i
    `);
    await tx.execute(sql`
      insert into pessoas (org_id, nome, busca, local_id)
      select ${org}, 'Pessoa ' || i, 'pessoa ' || i, (${comoArray}::uuid[])[1 + i % ${salas.length}]
      from generate_series(1, ${PESSOAS}) as i
    `);
  });
  // As estatísticas em dia, como o autovacuum as deixa (o teste da lista dos ativos explica).
  await api.dono.query('analyze ativos');
  await api.dono.query('analyze pessoas');
}, 180_000);

afterAll(async () => {
  await api?.fechar();
});

it(`o resumo de um local com ${ATIVOS} ativos dentro, num escopo recortado, fica abaixo de 300 ms no p95`, async () => {
  const url = `/locais/${raiz}/resumo`;
  for (let vez = 0; vez < 3; vez++) await cliente.consultar(url, entrada);
  const tempos: number[] = [];
  for (let vez = 0; vez < PEDIDOS; vez++) {
    const inicio = performance.now();
    const r = await cliente.consultar(url, entrada);
    tempos.push(performance.now() - inicio);
    expect(r.statusCode).toBe(200);
    // Bruno vê um setor de vinte: os 500 ativos dele, sem os 50 inativos.
    expect(r.json().ativos.comOsDeDentro).toEqual({ quantos: 450, recortada: true });
    expect(r.json().pessoas.comOsDeDentro).toEqual({ quantos: 50, recortada: true });
  }
  tempos.sort((a, b) => a - b);
  const p95 = tempos[Math.ceil(PEDIDOS * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  console.info(
    `Resumo do local com ${ATIVOS} ativos: p95 de ${p95.toFixed(0)} ms em ${PEDIDOS} pedidos.`,
  );
  expect(p95).toBeLessThan(300);
}, 120_000);
