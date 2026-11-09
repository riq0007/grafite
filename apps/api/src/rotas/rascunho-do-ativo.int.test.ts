// O rascunho do cadastro do ativo pela API (spec cadastro-de-ativos, "Rascunho do cadastro do
// ativo"; change cadastro-em-etapas, design, decisões 6 e 7): um por conta, só dela, para quem edita
// ativos em algum escopo, até 256 KB, sem auditoria nem evento; o cadastro do ativo o apaga na mesma
// transação, e a anonimização da pessoa também.
import { eventos, naOrganizacao, pessoas, rascunhosDeCadastro } from '@grafite/db';
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

const host = 'grafite.rascunho-do-ativo.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const id = (nome: string) => ids[nome] ?? '';

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: [
      'ativos.editar',
      'catalogo.administrar',
      'pessoas.anonimizar',
      'acessos.administrar',
    ],
  });
  const editarAtivos = await criarPerfil(api, org, {
    nome: 'Editar ativos',
    permissoes: ['ativos.editar'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  // Bruno edita os ativos só em Jundiaí: o rascunho pede a permissão em algum escopo.
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: editarAtivos, contaId: bruno.id, localId: id('jundiai') });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  ids.ana = ana.id;
  ids.bruno = bruno.id;
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);

  const campo = (
    await cliente.enviar('POST', '/campos', como('ana'), { rotulo: 'IP', tipo: 'ip' })
  ).json().id as string;
  ids.ip = campo;
  ids.impressora = (
    await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), {
      nome: 'Impressora',
      icone: 'impressora',
      campos: [{ campoId: campo, obrigatorio: true }],
    })
  ).json().id as string;
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.delete(rascunhosDeCadastro);
    await tx.delete(eventos);
  });
});

/** Um rascunho como o cadastro em etapas guarda, com o pedido dado por cima. */
const rascunho = (extras: object = {}) => ({
  tipoId: id('impressora'),
  modeloId: null,
  valores: { 'ativo.patrimonio': 'PAT-0142', [id('ip')]: '10.0.4.12' },
  travas: { 'ativo.local': true },
  nomes: {},
  etapa: 'identificacao',
  origem: null,
  ...extras,
});

const ler = (usuario: string) => cliente.consultar('/ativos/rascunho', como(usuario));
const guardar = (usuario: string, pedido: object = rascunho()) =>
  cliente.enviar('PUT', '/ativos/rascunho', como(usuario), pedido);
const apagar = (usuario: string) => cliente.enviar('DELETE', '/ativos/rascunho', como(usuario));

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) => tx.select({ tipo: eventos.tipo }).from(eventos));

describe('o rascunho do cadastro do ativo', () => {
  it('sem rascunho, a leitura devolve nada', async () => {
    const r = await ler('ana');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ rascunho: null });
  });

  it('a conta guarda o rascunho e o lê de volta, com o momento em que foi guardado', async () => {
    const guardado = await guardar('ana');
    expect(guardado.statusCode).toBe(200);
    const { atualizadoEm } = guardado.json();
    expect(atualizadoEm).toBe(api.relogio.agora().toISOString());
    const r = await ler('ana');
    expect(r.json()).toEqual({ rascunho: { ...rascunho(), atualizadoEm } });
  });

  it('guardar de novo troca o rascunho inteiro: a conta tem um só', async () => {
    await guardar('ana');
    await guardar('ana', rascunho({ valores: {}, etapa: 'tipo' }));
    expect((await ler('ana')).json().rascunho).toMatchObject({ valores: {}, etapa: 'tipo' });
    const linhas = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select()
        .from(rascunhosDeCadastro)
        .where(eq(rascunhosDeCadastro.contaId, id('ana'))),
    );
    expect(linhas).toHaveLength(1);
  });

  it('outra conta da mesma organização não lê, não muda nem apaga o rascunho', async () => {
    await guardar('ana');
    expect((await ler('bruno')).json()).toEqual({ rascunho: null });
    await guardar('bruno', rascunho({ valores: { 'ativo.patrimonio': 'PAT-9' } }));
    expect(await apagar('bruno')).toMatchObject({ statusCode: 204 });
    expect((await ler('ana')).json().rascunho).toMatchObject({
      valores: { 'ativo.patrimonio': 'PAT-0142' },
    });
  });

  it('sem ativos.editar em nenhum escopo, a conta não lê, não guarda nem apaga', async () => {
    expect((await ler('carla')).statusCode).toBe(403);
    expect((await guardar('carla')).statusCode).toBe(403);
    expect((await apagar('carla')).statusCode).toBe(403);
  });

  it('confere a forma do rascunho, e não o catálogo', async () => {
    const r = await guardar('ana', rascunho({ tipoId: 'impressora', travas: { x: 'sim' } }));
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toMatchObject({
      tipoId: expect.any(String),
      'travas.x': expect.any(String),
    });
    // O valor ainda inválido para o campo fica: quem confere os valores é o cadastro.
    expect(
      (await guardar('ana', rascunho({ valores: { [id('ip')]: 'não é um IP' } }))).statusCode,
    ).toBe(200);
  });

  it('recusa o rascunho com mais de 256 KB', async () => {
    const r = await guardar(
      'ana',
      rascunho({
        valores: { 'ativo.patrimonio': 'x'.repeat(20_000) },
        nomes: Object.fromEntries(
          Array.from({ length: 600 }, (_, i) => [`n${i}`, 'y'.repeat(450)]),
        ),
      }),
    );
    expect(r.statusCode).toBe(413);
    expect(r.json().detail).toBe('O rascunho passa de 256 KB.');
    expect((await ler('ana')).json()).toEqual({ rascunho: null });
  });

  it('apagar tira o rascunho, e apagar de novo também responde 204', async () => {
    await guardar('ana');
    expect((await apagar('ana')).statusCode).toBe(204);
    expect((await ler('ana')).json()).toEqual({ rascunho: null });
    expect((await apagar('ana')).statusCode).toBe(204);
  });

  it('não vai à auditoria nem gera eventos', async () => {
    const guardado = await guardar('ana');
    const apagado = await apagar('ana');
    expect(await auditoriaDaRequisicao(api, org, guardado)).toEqual([]);
    expect(await auditoriaDaRequisicao(api, org, apagado)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });
});

describe('o rascunho no cadastro e na anonimização', () => {
  it('cadastrar o ativo apaga o rascunho da conta, e o cadastro recusado o mantém', async () => {
    await guardar('ana');
    await guardar('bruno');
    const recusado = await cliente.enviar('POST', '/ativos', como('ana'), {
      tipoId: id('impressora'),
      valores: {},
    });
    expect(recusado.statusCode).toBe(400);
    expect((await ler('ana')).json().rascunho).not.toBeNull();
    const cadastrado = await cliente.enviar('POST', '/ativos', como('ana'), {
      tipoId: id('impressora'),
      valores: { [id('ip')]: '10.0.4.12' },
    });
    expect(cadastrado.statusCode).toBe(201);
    expect((await ler('ana')).json()).toEqual({ rascunho: null });
    expect((await ler('bruno')).json().rascunho).not.toBeNull();
  });

  it('a anonimização da pessoa apaga o rascunho da conta dela', async () => {
    const eva = await criarConta(api, org, { usuario: 'eva', nome: 'Eva Prado' });
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(rascunhosDeCadastro).values({
        orgId: org,
        contaId: eva.id,
        cadastro: 'ativo',
        conteudo: rascunho(),
      }),
    );
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(pessoas).set({ situacao: 'inativa' }).where(eq(pessoas.id, eva.pessoaId)),
    );
    const r = await cliente.enviar('POST', `/pessoas/${eva.pessoaId}/anonimizacao`, como('ana'));
    expect(r.statusCode).toBe(200);
    const daEva = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(rascunhosDeCadastro).where(eq(rascunhosDeCadastro.contaId, eva.id)),
    );
    expect(daEva).toEqual([]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'pessoa.anonimizada',
        dados: { camposApagados: expect.arrayContaining(['rascunhos']) },
      },
    ]);
  });
});
