// A inativação e a reativação dos ativos pela API (spec cadastro-de-ativos; design do P1b, decisões 8
// e 9): para quem tem `ativos.editar` no local do ativo, com a auditoria e o evento; a repetida não
// grava nada.
import { eventos, naOrganizacao } from '@grafite/db';
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

const host = 'grafite.ativos-situacao.local';

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
    permissoes: ['ativos.editar', 'catalogo.administrar'],
  });
  const editar = await criarPerfil(api, org, { nome: 'Editar', permissoes: ['ativos.editar'] });
  const ver = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['ativos.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: editar, contaId: bruno.id, localId: id('jundiai') });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: ver, contaId: carla.id });
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);
  const tipo = await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), {
    nome: 'Impressora',
    icone: 'impressora',
  });
  const ativo = async (localId: string) =>
    (
      await cliente.enviar('POST', '/ativos', como('ana'), {
        tipoId: tipo.json().id,
        valores: { 'ativo.local': localId },
      })
    ).json().id as string;
  ids.emJundiai = await ativo(id('jundiai'));
  ids.emCampinas = await ativo(id('campinas'));
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const acao = (ativoId: string, caminho: 'inativacao' | 'reativacao', usuario = 'ana') =>
  cliente.enviar('POST', `/ativos/${ativoId}/${caminho}`, como(usuario));

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select({ tipo: eventos.tipo, alvoId: eventos.alvoId, locais: eventos.locais }).from(eventos),
  );

describe('inativação e reativação', () => {
  it('inativa com a auditoria e o evento, e a repetida não grava nada', async () => {
    const r = await acao(id('emJundiai'), 'inativacao');
    expect(r.statusCode).toBe(200);
    expect(r.json().situacao).toBe('inativo');
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'ativo.inativado',
        alvoId: ids.emJundiai,
        antes: { situacao: 'ativo' },
        depois: { situacao: 'inativo', campos: { Local: 'Jundiaí' } },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'ativos.mudaram', alvoId: ids.emJundiai, locais: [id('jundiai')] },
    ]);
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    const repetida = await acao(id('emJundiai'), 'inativacao');
    expect(repetida.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, repetida)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('reativa como estava, com a auditoria', async () => {
    const r = await acao(id('emJundiai'), 'reativacao', 'bruno');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ situacao: 'ativo', uso: 'em-uso' });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'ativo.reativado', antes: { situacao: 'inativo' }, depois: { situacao: 'ativo' } },
    ]);
  });

  it('pede ativos.editar no local do ativo', async () => {
    expect((await acao(id('emCampinas'), 'inativacao', 'bruno')).statusCode).toBe(403);
    expect((await acao(id('emJundiai'), 'inativacao', 'carla')).statusCode).toBe(403);
    expect((await acao('0199a6e0-0000-7000-8000-000000000999', 'inativacao')).statusCode).toBe(404);
  });
});
