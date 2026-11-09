// O desempenho da lista dos ativos (spec mestre, seção 2.3, critério 6; design do P1c, decisão 3): com
// 10 mil ativos, a página ordenada por uma coluna do JSONB, com dois filtros e a contagem, e a
// ordenada pelos Suprimentos, com o Total de páginas à vista (change p2b-impressoras-por-snmp), respondem
// em menos de 300 ms no p95. O pedido passa pela API inteira (a sessão, o acesso, o catálogo, a
// consulta e a contagem), sem a rede.
import { campos, camposDoTipo, naOrganizacao, segredos, tiposDeAtivo } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
} from '../../test/integracao.ts';
import { criarColetor } from '../coleta/coletores.ts';

const host = 'grafite.ativos-desempenho.local';
const ATIVOS = 10_000;
const PEDIDOS = 20;

let api: ApiDeTeste;
let entrada: Entrada;
let cliente: ReturnType<typeof clienteDaApi>;
let ip = '';
let criticidade = '';

beforeAll(async () => {
  api = await abrirApi();
  const org = await criarOrganizacao(api, { nome: 'Empresa grande', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const tudo = await criarPerfil(api, org, {
    nome: 'Ativos',
    permissoes: ['ativos.editar', 'ativos.restritos'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  entrada = await cliente.entrar('ana');

  await naOrganizacao(api.banco, org, async (tx) => {
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Impressora',
        nomeNormalizado: 'impressora',
        icone: 'impressora',
        capacidades: ['snmp.suprimentos', 'controlid.saude'],
      })
      .returning({ id: tiposDeAtivo.id });
    const novoCampo = async (rotulo: string, extras: Partial<typeof campos.$inferInsert>) => {
      const [campo] = await tx
        .insert(campos)
        .values({
          orgId: org,
          rotulo,
          rotuloNormalizado: normalizarTexto(rotulo),
          tipo: 'texto',
          ...extras,
        })
        .returning({ id: campos.id });
      return campo?.id ?? '';
    };
    ip = await novoCampo('IP', { tipo: 'ip' });
    criticidade = await novoCampo('Criticidade', {
      tipo: 'lista',
      configuracao: {
        opcoes: [
          { id: 'alta', rotulo: 'Alta', situacao: 'ativa' },
          { id: 'media', rotulo: 'Média', situacao: 'ativa' },
          { id: 'baixa', rotulo: 'Baixa', situacao: 'ativa' },
        ],
      },
    });
    const tipoId = tipo?.id ?? '';
    for (const [ordem, campoId] of [ip, criticidade].entries()) {
      await tx.insert(camposDoTipo).values({ orgId: org, tipoId, campoId, ordem });
    }
    // Os 10 mil ativos de uma vez, com o IP, a criticidade e o valor de compra variando.
    await tx.execute(sql`
      insert into ativos (org_id, tipo_id, nome, patrimonio, patrimonio_normalizado, busca, valores)
      select ${org}, ${tipoId}, 'Impressora ' || i, 'PAT-' || i, 'pat-' || i, 'impressora ' || i,
        jsonb_build_object(
          ${ip}::text, '10.' || (i % 250) || '.' || (i / 250 % 250) || '.' || (i % 7),
          ${criticidade}::text, (array['alta', 'media', 'baixa'])[1 + i % 3],
          'ativo.valor-de-compra', i % 5000
        )
      from generate_series(1, ${ATIVOS}) as i
    `);
    // O login do Control iD no cofre, com o valor cifrado de mentira: a lista só lê a situação dele.
    const [login] = await tx
      .insert(segredos)
      .values({
        orgId: org,
        nome: 'Admin dos controles',
        nomeNormalizado: 'admin dos controles',
        tipo: 'conta-administrativa',
        classificacao: 'equipamento',
        identificador: 'admin',
        conteudoCifrado: Buffer.from('cifrado'),
        chaveCifrada: Buffer.from('chave'),
        impressaoDaChaveMestra: '0123456789abcdef',
      })
      .returning({ id: segredos.id });
    // O tipo usa o IP nos suprimentos e na sondagem; cada ativo tem dois suprimentos, o total e a
    // sondagem.
    await tx
      .update(tiposDeAtivo)
      .set({
        configuracaoDasCapacidades: {
          'snmp.suprimentos': { campoDoIp: ip, versao: '2c', segredoId: null },
          'controlid.saude': { campoDoIp: ip, porta: 80, segredoId: login?.id ?? '' },
        },
      })
      .where(sql`${tiposDeAtivo.id} = ${tipoId}`);
    const coletor = await criarColetor(tx, {
      nome: 'Coletor',
      faixas: ['10.0.0.0/8'],
      token: `token-do-desempenho-${'x'.repeat(40)}`,
      ator: { tipo: 'sistema', descricao: 'Teste' },
      momento: api.relogio.agora(),
    });
    await tx.execute(sql`
      insert into estado_dos_ativos
        (org_id, ativo_id, metrica, item, momento, valor_numero, situacao, detalhes, desde, coletor_id)
      select a.org_id, a.id, m.metrica, m.item, now(), m.valor, 'valida', m.detalhes, now(), ${coletor.id}
      from ativos a
      cross join lateral (values
        ('impressora.suprimento', '1', (abs(hashtext(a.id::text)) % 101)::float,
          jsonb_build_object('descricao', 'Black', 'capacidade', 100, 'nivel', 50)),
        ('impressora.suprimento', '2', 60::float,
          jsonb_build_object('descricao', 'Drum', 'capacidade', 100, 'nivel', 60)),
        ('impressora.contador', '1', (abs(hashtext(a.id::text)) % 100000)::float, null::jsonb)
      ) as m(metrica, item, valor, detalhes)
      where a.org_id = ${org}
    `);
    await tx.execute(sql`
      insert into estado_dos_ativos
        (org_id, ativo_id, metrica, item, momento, valor_texto, situacao, desde, coletor_id)
      select a.org_id, a.id, 'controlid.sondagem', '', now(),
        (array['respondendo', 'login-recusado', 'sem-resposta'])[1 + abs(hashtext(a.id::text)) % 3],
        'valida', now(), ${coletor.id}
      from ativos a
      where a.org_id = ${org}
    `);
  });
  // As estatísticas em dia, como o autovacuum as deixa: sem elas, a organização nova, que não existia
  // na última análise, parece ter poucos ativos, e o plano escolhido para eles passa dos 300 ms.
  await api.dono.query('analyze ativos');
  await api.dono.query('analyze estado_dos_ativos');
}, 180_000);

afterAll(async () => {
  await api?.fechar();
});

it(`a página de ${ATIVOS} ativos, ordenada pelo IP, com dois filtros e a contagem, fica abaixo de 300 ms no p95`, async () => {
  const parametros = new URLSearchParams({
    ordem: ip,
    direcao: 'crescente',
    colunas: [ip, criticidade, 'ativo.valor-de-compra'].join(','),
    filtros: JSON.stringify([
      { chave: criticidade, operador: 'qualquer', valores: ['alta', 'media'] },
      { chave: 'ativo.valor-de-compra', operador: 'entre', de: 100 },
    ]),
    limite: '100',
  });
  const url = `/ativos?${parametros.toString()}`;
  // O aquecimento: a primeira consulta prepara o plano e o cache das páginas do banco.
  for (let vez = 0; vez < 3; vez++) await cliente.consultar(url, entrada);
  const tempos: number[] = [];
  for (let vez = 0; vez < PEDIDOS; vez++) {
    const inicio = performance.now();
    const r = await cliente.consultar(url, entrada);
    tempos.push(performance.now() - inicio);
    expect(r.statusCode).toBe(200);
    expect(r.json().itens).toHaveLength(100);
    expect(r.json().total).toBeGreaterThan(6000);
  }
  tempos.sort((a, b) => a - b);
  const p95 = tempos[Math.ceil(PEDIDOS * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  console.info(`Lista de ${ATIVOS} ativos: p95 de ${p95.toFixed(0)} ms em ${PEDIDOS} pedidos.`);
  expect(p95).toBeLessThan(300);
}, 120_000);

it(`a contagem da criticidade nos ${ATIVOS} ativos, com um filtro, fica abaixo de 300 ms no p95`, async () => {
  const parametros = new URLSearchParams({
    coluna: criticidade,
    filtros: JSON.stringify([{ chave: 'ativo.valor-de-compra', operador: 'entre', de: 100 }]),
  });
  const url = `/ativos/contagens?${parametros.toString()}`;
  for (let vez = 0; vez < 3; vez++) await cliente.consultar(url, entrada);
  const tempos: number[] = [];
  for (let vez = 0; vez < PEDIDOS; vez++) {
    const inicio = performance.now();
    const r = await cliente.consultar(url, entrada);
    tempos.push(performance.now() - inicio);
    expect(r.statusCode).toBe(200);
    expect(r.json().opcoes).toHaveLength(3);
  }
  tempos.sort((a, b) => a - b);
  const p95 = tempos[Math.ceil(PEDIDOS * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  console.info(`Contagem em ${ATIVOS} ativos: p95 de ${p95.toFixed(0)} ms em ${PEDIDOS} pedidos.`);
  expect(p95).toBeLessThan(300);
}, 120_000);

it(`a página de ${ATIVOS} ativos, ordenada pelos Suprimentos, com o Total de páginas à vista e o filtro até 20%, fica abaixo de 300 ms no p95`, async () => {
  const parametros = new URLSearchParams({
    ordem: 'coleta.suprimentos',
    direcao: 'crescente',
    colunas: ['coleta.suprimentos', 'coleta.paginas'].join(','),
    filtros: JSON.stringify([{ chave: 'coleta.suprimentos', operador: 'entre', ate: 20 }]),
    limite: '100',
  });
  const url = `/ativos?${parametros.toString()}`;
  for (let vez = 0; vez < 3; vez++) await cliente.consultar(url, entrada);
  const tempos: number[] = [];
  for (let vez = 0; vez < PEDIDOS; vez++) {
    const inicio = performance.now();
    const r = await cliente.consultar(url, entrada);
    tempos.push(performance.now() - inicio);
    expect(r.statusCode).toBe(200);
    expect(r.json().itens).toHaveLength(100);
  }
  tempos.sort((a, b) => a - b);
  const p95 = tempos[Math.ceil(PEDIDOS * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  console.info(
    `Suprimentos em ${ATIVOS} ativos: p95 de ${p95.toFixed(0)} ms em ${PEDIDOS} pedidos.`,
  );
  expect(p95).toBeLessThan(300);
}, 120_000);

it(`a página de ${ATIVOS} ativos, ordenada pelo Control iD, com o filtro das situações que pedem atenção, fica abaixo de 300 ms no p95`, async () => {
  const parametros = new URLSearchParams({
    ordem: 'coleta.control-id',
    direcao: 'crescente',
    colunas: ['coleta.control-id', 'coleta.suprimentos'].join(','),
    filtros: JSON.stringify([
      {
        chave: 'coleta.control-id',
        operador: 'qualquer',
        valores: ['sem-resposta', 'login-recusado'],
      },
    ]),
    limite: '100',
  });
  const url = `/ativos?${parametros.toString()}`;
  for (let vez = 0; vez < 3; vez++) await cliente.consultar(url, entrada);
  const tempos: number[] = [];
  for (let vez = 0; vez < PEDIDOS; vez++) {
    const inicio = performance.now();
    const r = await cliente.consultar(url, entrada);
    tempos.push(performance.now() - inicio);
    expect(r.statusCode).toBe(200);
    expect(r.json().itens).toHaveLength(100);
  }
  tempos.sort((a, b) => a - b);
  const p95 = tempos[Math.ceil(PEDIDOS * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  console.info(
    `Control iD em ${ATIVOS} ativos: p95 de ${p95.toFixed(0)} ms em ${PEDIDOS} pedidos.`,
  );
  expect(p95).toBeLessThan(300);
}, 120_000);
