// As visões de tabela pela API (spec visoes-de-tabela; design do P1c, decisões 5 e 6): as da
// organização, que só quem define os padrões cria, edita e remove, com a auditoria; as de cada conta,
// que só a dona vê, sem a auditoria; o nome único, os limites, a definição conferida pelo domínio, a
// tabela que segue o módulo dela e o evento para todas as sessões ou só para as da conta.
import { eventos, mudancasDasVisoes, naOrganizacao, pessoas, visoes } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.visoes.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const contas: Record<string, string> = {};
let jundiai = '';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

const DEFINICAO = {
  colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.patrimonio', largura: 2000 }],
  ordenacao: { chave: 'ativo.patrimonio', direcao: 'crescente' },
  filtros: [{ chave: 'ativo.situacao', operador: 'situacao', situacao: 'ativos' }],
};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  const administra = await criarPerfil(api, org, {
    nome: 'Administra',
    permissoes: ['organizacao.editar', 'ativos.ver'],
  });
  const ver = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['ativos.ver'] });
  const anonimiza = await criarPerfil(api, org, {
    nome: 'Anonimiza',
    // Quem administra os acessos: a anonimização não deixa a organização sem ninguém.
    permissoes: ['pessoas.anonimizar', 'acessos.administrar'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administra, contaId: ana.id });
  await atribuir(api, org, { perfilId: anonimiza, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: ver, contaId: bruno.id, localId: jundiai });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: ver, contaId: carla.id });
  await criarConta(api, org, { usuario: 'dani', nome: 'Dani Lima' });
  contas.ana = ana.id;
  contas.bruno = bruno.id;
  contas.carla = carla.id;
  for (const usuario of ['ana', 'bruno', 'carla', 'dani'])
    entradas[usuario] = await cliente.entrar(usuario);
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.delete(mudancasDasVisoes);
    await tx.delete(visoes);
    await tx.delete(eventos);
  });
});

const listar = (usuario: string) => cliente.consultar('/visoes?tabela=ativos', como(usuario));

const criar = (
  usuario: string,
  nome: string,
  extras: { compartilhada?: boolean; definicao?: unknown } = {},
) =>
  cliente.enviar('POST', '/visoes', como(usuario), {
    tabela: 'ativos',
    nome,
    definicao: DEFINICAO,
    ...extras,
  });

/** Uma visão direto no banco, para chegar perto dos limites sem 50 pedidos. */
function incluir(nome: string, contaId: string | null) {
  return naOrganizacao(api.banco, org, async (tx) => {
    await tx.insert(visoes).values({
      orgId: org,
      tabela: 'ativos',
      contaId,
      nome,
      nomeNormalizado: normalizarTexto(nome),
      definicao: DEFINICAO,
    });
  });
}

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select({ tipo: eventos.tipo, todas: eventos.todas, contas: eventos.contas }).from(eventos),
  );

describe('as visões da tabela', () => {
  it('a conta cria a própria visão, com a definição conferida, sem a auditoria e com o evento só para ela', async () => {
    const r = await criar('bruno', '  Meus notebooks ');
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({
      id: expect.any(String),
      nome: 'Meus notebooks',
      compartilhada: false,
      definicao: {
        ...DEFINICAO,
        colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.patrimonio', largura: 800 }],
      },
      permite: { editar: true },
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'visoes.mudaram', todas: false, contas: [contas.bruno] },
    ]);
  });

  it('a lista traz as da organização e as da própria conta, e não as das outras', async () => {
    await incluir('Da organização', null);
    await incluir('Do Bruno', contas.bruno ?? '');
    await incluir('Da Carla', contas.carla ?? '');
    const doBruno = await listar('bruno');
    expect(doBruno.statusCode).toBe(200);
    expect(doBruno.json().permite).toEqual({ compartilhar: false });
    expect(
      doBruno
        .json()
        .visoes.map((visao: { nome: string; compartilhada: boolean; permite: object }) => [
          visao.nome,
          visao.compartilhada,
          visao.permite,
        ]),
    ).toEqual([
      ['Da organização', true, { editar: false }],
      ['Do Bruno', false, { editar: true }],
    ]);
    const daAna = await listar('ana');
    expect(daAna.json().permite).toEqual({ compartilhar: true });
    expect(
      daAna
        .json()
        .visoes.map((visao: { nome: string; permite: object }) => [visao.nome, visao.permite]),
    ).toEqual([['Da organização', { editar: true }]]);
  });

  it('só quem define os padrões compartilha, com a auditoria e o evento para todas as sessões', async () => {
    const semPermissao = await criar('bruno', 'Impressoras', { compartilhada: true });
    expect(semPermissao.statusCode).toBe(403);
    expect(await auditoriaDaRequisicao(api, org, semPermissao)).toMatchObject([
      { acao: 'permissao.recusada', dados: { permissao: 'organizacao.editar' } },
    ]);
    const r = await criar('ana', 'Impressoras de Jundiaí', {
      compartilhada: true,
      definicao: {
        ...DEFINICAO,
        filtros: [{ chave: 'ativo.local', operador: 'em', local: jundiai }],
      },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ compartilhada: true, permite: { editar: true } });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'visao.criada',
        alvoTipo: 'visao',
        alvoId: r.json().id,
        depois: {
          tabela: 'ativos',
          nome: 'Impressoras de Jundiaí',
          colunas: ['Ativo', 'Patrimônio'],
          ordenacao: 'Patrimônio, crescente',
          filtros: ['Local: em Jundiaí'],
        },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'visoes.mudaram', todas: true, contas: null },
    ]);
  });

  it('o nome é único entre as da organização e, à parte, entre as de cada conta', async () => {
    await incluir('Notebooks', null);
    await incluir('Switches', contas.bruno ?? '');
    const daOrganizacao = await criar('ana', 'notebooks', { compartilhada: true });
    expect(daOrganizacao.statusCode).toBe(409);
    expect(daOrganizacao.json().campos).toEqual({ nome: 'Já existe uma visão com este nome.' });
    const daConta = await criar('bruno', 'SWITCHES');
    expect(daConta.statusCode).toBe(409);
    expect(daConta.json().campos).toEqual({ nome: 'Já existe uma visão com este nome.' });
    expect((await criar('bruno', 'Notebooks')).statusCode).toBe(201);
    expect((await criar('carla', 'Switches')).statusCode).toBe(201);
  });

  it('recusa o nome vazio, o longo, a definição inválida e a tabela desconhecida', async () => {
    const vazio = await criar('bruno', '   ');
    expect(vazio.statusCode).toBe(400);
    expect(vazio.json().campos).toEqual({ nome: 'Dê um nome à visão.' });
    const longo = await criar('bruno', 'x'.repeat(61));
    expect(longo.json().campos).toEqual({ nome: 'Use até 60 caracteres.' });
    const filtros = await criar('bruno', 'Filtros', {
      definicao: { ...DEFINICAO, filtros: [{ chave: 'a', operador: 'contem', texto: ' ' }] },
    });
    expect(filtros.statusCode).toBe(400);
    expect(filtros.json().campos).toEqual({ definicao: 'Digite o texto do filtro.' });
    const tabela = await cliente.enviar('POST', '/visoes', como('bruno'), {
      tabela: 'pessoas',
      nome: 'Pessoas',
      definicao: DEFINICAO,
    });
    expect(tabela.statusCode).toBe(400);
    expect(tabela.json().campos).toEqual({ tabela: 'Tabela desconhecida.' });
  });

  it('cada conta tem até 50 visões, e duas criações juntas no limite não passam dele', async () => {
    for (let numero = 1; numero <= 49; numero++)
      await incluir(`Visão ${numero}`, contas.bruno ?? '');
    const [uma, outra] = await Promise.all([criar('bruno', 'A'), criar('bruno', 'B')]);
    expect([uma?.statusCode, outra?.statusCode].sort()).toEqual([201, 409]);
    const recusada = uma?.statusCode === 409 ? uma : outra;
    expect(recusada?.json().detail).toBe(
      'Você já tem 50 visões nesta tabela. Remova uma para criar outra.',
    );
  });

  it('a organização tem até 100 visões', async () => {
    for (let numero = 1; numero <= 100; numero++) await incluir(`Visão ${numero}`, null);
    const r = await criar('ana', 'Mais uma', { compartilhada: true });
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe(
      'A organização já tem 100 visões nesta tabela. Remova uma para criar outra.',
    );
  });

  it('a dona edita a própria visão; a de outra conta não existe para ela', async () => {
    const criada = await criar('bruno', 'Notebooks');
    const id = criada.json().id;
    const r = await cliente.enviar('PATCH', `/visoes/${id}`, como('bruno'), {
      nome: 'Notebooks da engenharia',
      definicao: { ...DEFINICAO, ordenacao: null },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      nome: 'Notebooks da engenharia',
      definicao: { ordenacao: null },
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
    const daCarla = await cliente.enviar('PATCH', `/visoes/${id}`, como('carla'), {
      nome: 'Minha',
    });
    expect(daCarla.statusCode).toBe(404);
    expect((await cliente.enviar('DELETE', `/visoes/${id}`, como('carla'))).statusCode).toBe(404);
  });

  it('a visão da organização só muda com a permissão, e a edição e a remoção vão para a auditoria', async () => {
    const criada = await criar('ana', 'Impressoras', { compartilhada: true });
    const id = criada.json().id;
    const semPermissao = await cliente.enviar('PATCH', `/visoes/${id}`, como('bruno'), {
      nome: 'Minhas impressoras',
    });
    expect(semPermissao.statusCode).toBe(403);
    expect((await cliente.enviar('DELETE', `/visoes/${id}`, como('bruno'))).statusCode).toBe(403);
    const editada = await cliente.enviar('PATCH', `/visoes/${id}`, como('ana'), {
      definicao: { ...DEFINICAO, colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.local' }] },
    });
    expect(editada.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, editada)).toMatchObject([
      {
        acao: 'visao.alterada',
        antes: { colunas: ['Ativo', 'Patrimônio'] },
        depois: { colunas: ['Ativo', 'Local'] },
      },
    ]);
    const removida = await cliente.enviar('DELETE', `/visoes/${id}`, como('ana'));
    expect(removida.statusCode).toBe(204);
    expect(await auditoriaDaRequisicao(api, org, removida)).toMatchObject([
      { acao: 'visao.removida', antes: { nome: 'Impressoras' } },
    ]);
    const restantes = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(visoes).where(eq(visoes.id, id)),
    );
    expect(restantes).toEqual([]);
  });

  it('a dona remove a própria visão, sem a auditoria', async () => {
    const id = (await criar('bruno', 'Notebooks')).json().id;
    const r = await cliente.enviar('DELETE', `/visoes/${id}`, como('bruno'));
    expect(r.statusCode).toBe(204);
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
    expect((await listar('bruno')).json().visoes).toEqual([]);
  });

  it('pede a permissão de ver a tabela, e segue o módulo dela', async () => {
    const semVer = await listar('dani');
    expect(semVer.statusCode).toBe(403);
    expect(await auditoriaDaRequisicao(api, org, semVer)).toMatchObject([
      { acao: 'permissao.recusada', dados: { permissao: 'ativos.ver' } },
    ]);
    expect((await criar('dani', 'Minha')).statusCode).toBe(403);
    await cliente.enviar('PUT', '/organizacao/modulos/ativos', como('ana'), { ligado: false });
    try {
      const desligado = await listar('ana');
      expect(desligado.statusCode).toBe(403);
      expect(desligado.json()).toMatchObject({
        type: 'urn:grafite:problema:modulo-desligado',
        detail: 'O módulo Ativos está desligado nesta organização.',
      });
      expect((await criar('bruno', 'Notebooks')).statusCode).toBe(403);
    } finally {
      await cliente.enviar('PUT', '/organizacao/modulos/ativos', como('ana'), { ligado: true });
    }
  });
});

// As mudanças da conta sobre a visão de fábrica e as da organização (change visoes-da-conta, design,
// decisão 2): guardadas para a conta, sem a auditoria, com o evento só para as sessões dela.
const COM_IP = {
  colunas: [{ chave: 'ativo.rotulo' }, { chave: 'c-ip', largura: 140 }],
  ordenacao: null,
  filtros: [],
};

const gravarMudancas = (usuario: string, visao: string, definicao: unknown = COM_IP) =>
  cliente.enviar('PUT', '/visoes/mudancas', como(usuario), { tabela: 'ativos', visao, definicao });

describe('as mudanças da conta', () => {
  it('grava as mudanças na de fábrica, sem a auditoria, com o evento só para a conta, e a lista as traz', async () => {
    const r = await gravarMudancas('bruno', 'fabrica');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      visao: 'fabrica',
      definicao: COM_IP,
      atualizadaEm: expect.any(String),
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'visoes.mudaram', todas: false, contas: [contas.bruno] },
    ]);
    expect((await listar('bruno')).json().mudancas).toEqual([
      { visao: 'fabrica', definicao: COM_IP, atualizadaEm: expect.any(String) },
    ]);
    // As de outra conta não aparecem.
    expect((await listar('carla')).json().mudancas).toEqual([]);
  });

  it('gravar de novo troca as mudanças, uma por visão', async () => {
    const impressoras = (await criar('ana', 'Impressoras', { compartilhada: true })).json().id;
    await gravarMudancas('bruno', impressoras);
    const segunda = { ...COM_IP, ordenacao: { chave: 'ativo.rotulo', direcao: 'crescente' } };
    expect((await gravarMudancas('bruno', impressoras, segunda)).statusCode).toBe(200);
    expect((await listar('bruno')).json().mudancas).toEqual([
      { visao: impressoras, definicao: segunda, atualizadaEm: expect.any(String) },
    ]);
  });

  it('recusa a visão de outra conta, a própria e a definição inválida', async () => {
    const daCarla = (await criar('carla', 'Da Carla')).json().id;
    expect((await gravarMudancas('bruno', daCarla)).statusCode).toBe(404);
    const doBruno = (await criar('bruno', 'Do Bruno')).json().id;
    const propria = await gravarMudancas('bruno', doBruno);
    expect(propria.statusCode).toBe(409);
    expect(propria.json().detail).toBe('A visão é sua: as mudanças ficam nela.');
    const invalida = await gravarMudancas('bruno', 'fabrica', { colunas: 'x' });
    expect(invalida.statusCode).toBe(400);
    expect(invalida.json().campos).toEqual({ definicao: 'A definição da visão não é válida.' });
    expect((await gravarMudancas('dani', 'fabrica')).statusCode).toBe(403);
  });

  it('restaura uma visão, ou todas da tabela, com o evento só para a conta', async () => {
    const impressoras = (await criar('ana', 'Impressoras', { compartilhada: true })).json().id;
    await gravarMudancas('bruno', 'fabrica');
    await gravarMudancas('bruno', impressoras);
    await gravarMudancas('carla', 'fabrica');
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    const uma = await cliente.enviar(
      'DELETE',
      `/visoes/mudancas?tabela=ativos&visao=${impressoras}`,
      como('bruno'),
    );
    expect(uma.statusCode).toBe(204);
    expect((await listar('bruno')).json().mudancas.map((m: { visao: string }) => m.visao)).toEqual([
      'fabrica',
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'visoes.mudaram', todas: false, contas: [contas.bruno] },
    ]);
    const todas = await cliente.enviar('DELETE', '/visoes/mudancas?tabela=ativos', como('bruno'));
    expect(todas.statusCode).toBe(204);
    expect((await listar('bruno')).json().mudancas).toEqual([]);
    // As de Carla ficam.
    expect((await listar('carla')).json().mudancas).toHaveLength(1);
  });

  it('remover a visão da organização apaga as mudanças de todos sobre ela', async () => {
    const impressoras = (await criar('ana', 'Impressoras', { compartilhada: true })).json().id;
    await gravarMudancas('bruno', impressoras);
    await gravarMudancas('carla', impressoras);
    expect((await cliente.enviar('DELETE', `/visoes/${impressoras}`, como('ana'))).statusCode).toBe(
      204,
    );
    expect((await listar('bruno')).json().mudancas).toEqual([]);
    expect((await listar('carla')).json().mudancas).toEqual([]);
  });
});

describe('a publicação na visão da organização', () => {
  it('grava as mudanças da conta na visão, com a auditoria, e apaga as mudanças dela', async () => {
    const impressoras = (await criar('ana', 'Impressoras', { compartilhada: true })).json().id;
    await gravarMudancas('ana', impressoras);
    await gravarMudancas('carla', impressoras);
    const r = await cliente.enviar('POST', `/visoes/${impressoras}/publicar`, como('ana'));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id: impressoras, compartilhada: true, definicao: COM_IP });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([{ acao: 'visao.alterada' }]);
    expect((await listar('ana')).json().mudancas).toEqual([]);
    // As mudanças de Carla continuam, sobre a visão nova.
    expect((await listar('carla')).json().mudancas).toHaveLength(1);
    const daCarla = (await listar('carla'))
      .json()
      .visoes.find((v: { id: string }) => v.id === impressoras);
    expect(daCarla.definicao).toEqual(COM_IP);
  });

  it('pede organizacao.editar, as mudanças da conta e uma visão da organização', async () => {
    const impressoras = (await criar('ana', 'Impressoras', { compartilhada: true })).json().id;
    await gravarMudancas('carla', impressoras);
    const semPermissao = await cliente.enviar(
      'POST',
      `/visoes/${impressoras}/publicar`,
      como('carla'),
    );
    expect(semPermissao.statusCode).toBe(403);
    const semMudancas = await cliente.enviar(
      'POST',
      `/visoes/${impressoras}/publicar`,
      como('ana'),
    );
    expect(semMudancas.statusCode).toBe(409);
    expect(semMudancas.json().detail).toBe('Não há mudanças suas nesta visão.');
    const daAna = (await criar('ana', 'Da Ana')).json().id;
    const daConta = await cliente.enviar('POST', `/visoes/${daAna}/publicar`, como('ana'));
    expect(daConta.statusCode).toBe(409);
    expect(daConta.json().detail).toBe('A visão é sua: as mudanças ficam nela.');
  });
});

describe('as visões na anonimização', () => {
  it('a anonimização remove as visões da conta da pessoa, e não as da organização que ela criou', async () => {
    const eva = await criarConta(api, org, { usuario: 'eva', nome: 'Eva Prado' });
    await incluir('Da Eva', eva.id);
    await incluir('Compartilhada', null);
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(mudancasDasVisoes).values({
        orgId: org,
        contaId: eva.id,
        tabela: 'ativos',
        visaoId: null,
        definicao: COM_IP,
      }),
    );
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(pessoas).set({ situacao: 'inativa' }).where(eq(pessoas.id, eva.pessoaId)),
    );
    const r = await cliente.enviar('POST', `/pessoas/${eva.pessoaId}/anonimizacao`, como('ana'));
    expect(r.statusCode).toBe(200);
    const restantes = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ nome: visoes.nome }).from(visoes),
    );
    expect(restantes).toEqual([{ nome: 'Compartilhada' }]);
    const mudancasDaEva = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(mudancasDasVisoes).where(eq(mudancasDasVisoes.contaId, eva.id)),
    );
    expect(mudancasDaEva).toEqual([]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'pessoa.anonimizada', dados: { camposApagados: expect.arrayContaining(['visoes']) } },
    ]);
  });
});
