// O lado de lá das ligações pela API (spec ligacoes-de-ativos, "Ligação pelos campos do tipo ativo",
// "Acesso às ligações" e "Aba Ligados da ficha"; design do P1d, decisão 2): um grupo por campo do
// tipo ativo que aponta para o ativo, com o lado de lá, o total e até 100 ativos em ordem; as ligações
// livres; o ativo fora do acesso sem o id; o campo restrito só a quem vê os restritos no local do
// ativo que aponta; o campo tirado do tipo ou inativado, que some sem apagar os valores; e o p95 com
// 10 mil ativos.
import { ativos, campos, camposDoTipo, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.ativos-ligados.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};
const id = (chave: string) => ids[chave] ?? '';
const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['ativos.editar', 'ativos.restritos', 'catalogo.administrar'],
  });
  const ver = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['ativos.ver'] });
  const restritos = await criarPerfil(api, org, {
    nome: 'Restritos',
    permissoes: ['ativos.restritos'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: ver, contaId: bruno.id, localId: id('jundiai') });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: restritos, contaId: carla.id, localId: id('jundiai') });
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);

  const novo = async (caminho: string, pedido: object) =>
    (await cliente.enviar('POST', caminho, como('ana'), pedido)).json().id as string;
  ids.tipoComputador = await novo('/tipos-de-ativo', { nome: 'Computador', icone: 'computador' });
  ids.tipoNobreak = await novo('/tipos-de-ativo', { nome: 'Nobreak', icone: 'nobreak' });
  ids.campoComputador = await novo('/campos', {
    rotulo: 'Computador',
    tipo: 'ativo',
    configuracao: { tipos: [id('tipoComputador')], ladoDeLa: 'Monitores' },
  });
  ids.campoNobreak = await novo('/campos', { rotulo: 'Nobreak', tipo: 'ativo' });
  ids.campoCofre = await novo('/campos', { rotulo: 'Cofre', tipo: 'ativo', restrito: true });
  const comCampos = (...campoIds: string[]) =>
    campoIds.map((campoId) => ({ campoId, obrigatorio: false }));
  ids.tipoMonitor = await novo('/tipos-de-ativo', {
    nome: 'Monitor',
    icone: 'monitor',
    campos: comCampos(id('campoComputador'), id('campoCofre')),
  });
  ids.tipoSwitch = await novo('/tipos-de-ativo', {
    nome: 'Switch',
    icone: 'switch',
    campos: comCampos(id('campoNobreak')),
  });

  const ativo = (tipoId: string, nome: string, localId: string, valores: object = {}) =>
    novo('/ativos', {
      tipoId,
      valores: { 'ativo.nome': nome, 'ativo.local': localId, ...valores },
    });
  ids.pc = await ativo(id('tipoComputador'), 'PC do caixa', id('jundiai'), {
    'ativo.patrimonio': 'PAT-00150',
  });
  const doPc = { [id('campoComputador')]: id('pc') };
  ids.monitorB = await ativo(id('tipoMonitor'), 'Monitor B', id('jundiai'), doPc);
  ids.monitorA = await ativo(id('tipoMonitor'), 'Monitor A', id('jundiai'), doPc);
  ids.monitorDeCampinas = await ativo(id('tipoMonitor'), 'Monitor C', id('campinas'), doPc);
  ids.monitorDoCofre = await ativo(id('tipoMonitor'), 'Monitor do cofre', id('jundiai'), {
    [id('campoCofre')]: id('pc'),
  });
  ids.nobreak = await ativo(id('tipoNobreak'), 'Nobreak do rack', id('jundiai'), {
    'ativo.patrimonio': 'PAT-00700',
  });
  ids.switch = await ativo(id('tipoSwitch'), 'Switch do rack', id('jundiai'), {
    [id('campoNobreak')]: id('nobreak'),
  });
});

afterAll(async () => {
  await api?.fechar();
});

const ligados = async (ativoId: string, usuario = 'ana') => {
  const r = await cliente.consultar(`/ativos/${ativoId}/ligados`, como(usuario));
  expect(r.statusCode).toBe(200);
  return r.json();
};

const rotulos = (lista: { rotulo?: string; foraDoAcesso?: boolean }[]) =>
  lista.map((ativo) => (ativo.foraDoAcesso ? 'fora do acesso' : ativo.rotulo));

describe('pelos campos do tipo ativo', () => {
  it('um grupo por campo, com o lado de lá, o total e os ativos pelo nome', async () => {
    const { porCampos } = await ligados(id('pc'));
    expect(porCampos).toHaveLength(2);
    const [cofre, computador] = porCampos;
    expect(cofre).toMatchObject({
      campo: { id: ids.campoCofre, rotulo: 'Cofre', ladoDeLa: null },
      total: 1,
    });
    expect(computador).toMatchObject({
      campo: { id: ids.campoComputador, rotulo: 'Computador', ladoDeLa: 'Monitores' },
      total: 3,
    });
    expect(rotulos(computador.ativos)).toEqual(['Monitor A', 'Monitor B', 'Monitor C']);
    expect(computador.ativos[0]).toMatchObject({
      id: ids.monitorA,
      tipo: { nome: 'Monitor' },
      local: { caminho: 'Jundiaí' },
      situacao: 'ativo',
      imagem: null,
    });
    expect(computador.ativos[0]).not.toHaveProperty('valores');
  });

  it('o campo sem o lado de lá vem sem o nome dele', async () => {
    const { porCampos } = await ligados(id('nobreak'));
    expect(porCampos).toMatchObject([
      { campo: { rotulo: 'Nobreak', ladoDeLa: null }, total: 1, ativos: [{ id: ids.switch }] },
    ]);
  });

  it('o ativo fora do acesso vem sem o id, e o campo restrito só a quem vê os restritos', async () => {
    const deBruno = await ligados(id('pc'), 'bruno');
    expect(deBruno.porCampos).toHaveLength(1);
    expect(deBruno.porCampos[0].total).toBe(3);
    expect(rotulos(deBruno.porCampos[0].ativos)).toEqual([
      'Monitor A',
      'Monitor B',
      'fora do acesso',
    ]);
    expect(deBruno.porCampos[0].ativos[2]).toEqual({ foraDoAcesso: true });
    const deCarla = await ligados(id('pc'), 'carla');
    expect(
      deCarla.porCampos.map((grupo: { campo: { rotulo: string } }) => grupo.campo.rotulo),
    ).toEqual(['Cofre', 'Computador']);
  });

  it('o campo inativado ou tirado do tipo some, sem apagar os valores', async () => {
    const valorDoSwitch = async () => {
      const [linha] = await naOrganizacao(api.banco, org, (tx) =>
        tx
          .select({ valores: ativos.valores })
          .from(ativos)
          .where(eq(ativos.id, id('switch'))),
      );
      return linha?.valores[id('campoNobreak')];
    };
    await cliente.enviar('POST', `/campos/${id('campoNobreak')}/inativacao`, como('ana'));
    expect((await ligados(id('nobreak'))).porCampos).toEqual([]);
    expect(await valorDoSwitch()).toBe(ids.nobreak);
    await cliente.enviar('POST', `/campos/${id('campoNobreak')}/reativacao`, como('ana'));
    expect((await ligados(id('nobreak'))).porCampos).toHaveLength(1);

    await cliente.enviar('PATCH', `/tipos-de-ativo/${id('tipoSwitch')}`, como('ana'), {
      campos: [],
    });
    expect((await ligados(id('nobreak'))).porCampos).toEqual([]);
    expect(await valorDoSwitch()).toBe(ids.nobreak);
  });

  it('mostra até 100 ativos por campo, com o total', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx.execute(sql`
        insert into ativos (org_id, tipo_id, nome, local_id, busca, valores)
        select ${org}, ${id('tipoMonitor')}, 'Monitor extra ' || lpad(i::text, 3, '0'),
          ${id('jundiai')}, '', jsonb_build_object(${id('campoComputador')}::text, ${id('nobreak')}::text)
        from generate_series(1, 101) as i
      `),
    );
    const [grupo] = (await ligados(id('nobreak'))).porCampos;
    expect(grupo.total).toBe(101);
    expect(grupo.ativos).toHaveLength(100);
    expect(grupo.ativos[0].rotulo).toBe('Monitor extra 001');
  });
});

describe('ligações livres e acesso', () => {
  it('traz as ligações livres, com quem pode desfazer, e o que a conta pode fazer', async () => {
    const ligacao = await cliente.enviar('POST', `/ativos/${id('pc')}/ligacoes`, como('ana'), {
      outroId: id('nobreak'),
    });
    expect(ligacao.statusCode).toBe(201);
    const deAna = await ligados(id('pc'));
    expect(deAna.livres).toEqual([
      {
        id: ligacao.json().id,
        outro: expect.objectContaining({ id: ids.nobreak, rotulo: 'Nobreak do rack' }),
        permite: { desfazer: true },
      },
    ]);
    expect(deAna.permite).toEqual({ ligar: true });
    const deBruno = await ligados(id('pc'), 'bruno');
    expect(deBruno.livres[0].permite).toEqual({ desfazer: false });
    expect(deBruno.permite).toEqual({ ligar: false });
    // Do outro lado, a mesma ligação.
    expect((await ligados(id('nobreak'))).livres[0].outro).toMatchObject({ id: ids.pc });
  });

  it('pede ativos.ver no local do ativo', async () => {
    const fora = await cliente.consultar(
      `/ativos/${id('monitorDeCampinas')}/ligados`,
      como('bruno'),
    );
    expect(fora.statusCode).toBe(403);
    const inexistente = await cliente.consultar(
      '/ativos/0199a6e0-0000-7000-8000-000000000999/ligados',
      como('ana'),
    );
    expect(inexistente.statusCode).toBe(404);
  });
});

describe('desempenho', () => {
  const ATIVOS = 10_000;
  const PEDIDOS = 20;
  const outroHost = 'grafite.ativos-ligados-desempenho.local';
  let entrada: Entrada;
  let outroCliente: ReturnType<typeof clienteDaApi>;
  let alvo = '';

  beforeAll(async () => {
    const grande = await criarOrganizacao(api, { nome: 'Empresa grande', enderecos: [outroHost] });
    outroCliente = clienteDaApi(api, outroHost);
    const perfil = await criarPerfil(api, grande, {
      nome: 'Ativos',
      permissoes: ['ativos.editar', 'ativos.restritos'],
    });
    const conta = await criarConta(api, grande, { usuario: 'ana', nome: 'Ana Souza' });
    await atribuir(api, grande, { perfilId: perfil, contaId: conta.id });
    entrada = await outroCliente.entrar('ana');
    await naOrganizacao(api.banco, grande, async (tx) => {
      const [tipo] = await tx
        .insert(tiposDeAtivo)
        .values({ orgId: grande, nome: 'Monitor', nomeNormalizado: 'monitor', icone: 'monitor' })
        .returning({ id: tiposDeAtivo.id });
      const campoIds: string[] = [];
      for (const rotulo of ['Computador', 'Mesa']) {
        const [campo] = await tx
          .insert(campos)
          .values({
            orgId: grande,
            rotulo,
            rotuloNormalizado: normalizarTexto(rotulo),
            tipo: 'ativo',
          })
          .returning({ id: campos.id });
        campoIds.push(campo?.id ?? '');
      }
      const tipoId = tipo?.id ?? '';
      for (const [ordem, campoId] of campoIds.entries()) {
        await tx.insert(camposDoTipo).values({ orgId: grande, tipoId, campoId, ordem });
      }
      // Os 10 mil ativos, cada um apontando, pelos dois campos, para um dos 100 primeiros.
      await tx.execute(sql`
        insert into ativos (org_id, tipo_id, nome, busca)
        select ${grande}, ${tipoId}, 'Monitor ' || i, 'monitor ' || i
        from generate_series(1, ${ATIVOS}) as i
      `);
      await tx.execute(sql`
        with numerados as (
          select id, row_number() over (order by id) as n from ativos where org_id = ${grande}
        ),
        alvos as (select n, id from numerados where n <= 100)
        update ativos set valores = jsonb_build_object(
          ${campoIds[0]}::text, pelo_computador.id::text,
          ${campoIds[1]}::text, pela_mesa.id::text
        )
        from numerados, alvos as pelo_computador, alvos as pela_mesa
        where ativos.id = numerados.id
          and pelo_computador.n = 1 + numerados.n % 100
          and pela_mesa.n = 1 + (numerados.n + 7) % 100
      `);
      const { rows } = await tx.execute<{ id: string }>(
        sql`select id from ativos where org_id = ${grande} order by id limit 1`,
      );
      alvo = rows[0]?.id ?? '';
    });
    await api.dono.query('analyze ativos');
  }, 180_000);

  it(`o lado de lá de um ativo entre ${ATIVOS} fica abaixo de 300 ms no p95`, async () => {
    const url = `/ativos/${alvo}/ligados`;
    for (let vez = 0; vez < 3; vez++) await outroCliente.consultar(url, entrada);
    const tempos: number[] = [];
    for (let vez = 0; vez < PEDIDOS; vez++) {
      const inicio = performance.now();
      const r = await outroCliente.consultar(url, entrada);
      tempos.push(performance.now() - inicio);
      expect(r.statusCode).toBe(200);
      expect(r.json().porCampos).toHaveLength(2);
      expect(r.json().porCampos[0].total).toBe(100);
    }
    tempos.sort((a, b) => a - b);
    const p95 = tempos[Math.ceil(PEDIDOS * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    console.info(
      `Lado de lá entre ${ATIVOS} ativos: p95 de ${p95.toFixed(0)} ms em ${PEDIDOS} pedidos.`,
    );
    expect(p95).toBeLessThan(300);
  }, 120_000);
});
