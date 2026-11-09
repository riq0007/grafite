// Os padrões da organização (specs preferencias-da-interface e auditoria; design do F2c, decisão 3):
// quem tem organizacao.editar muda a camada da organização como merge patch. A auditoria guarda
// cada ajuste que mudou, com o valor que valia antes e o que vale depois, e o evento vai para todas
// as sessões. Um campo inválido recusa o pedido inteiro.
import { eventos, naOrganizacao, organizacoes } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.padroes.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
let anaId = '';
let ana: Entrada;
let bruno: Entrada;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const perfil = await criarPerfil(api, org, {
    nome: 'Organização',
    permissoes: ['organizacao.editar'],
  });
  anaId = (await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' })).id;
  await atribuir(api, org, { perfilId: perfil, contaId: anaId });
  await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  ana = await cliente.entrar('ana');
  bruno = await cliente.entrar('bruno');
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.delete(eventos);
    await tx.update(organizacoes).set({ preferencias: {} });
  });
});

const mudar = (entrada: Entrada, mudancas: unknown) =>
  cliente.enviar('PATCH', '/organizacao/padroes', entrada, { mudancas });

const salvos = () =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx.select({ preferencias: organizacoes.preferencias }).from(organizacoes);
    return linha?.preferencias;
  });

const gravados = () => naOrganizacao(api.banco, org, (tx) => tx.select().from(eventos));

describe('PATCH /organizacao/padroes', () => {
  it('a conta sem organizacao.editar é recusada com 403, e a recusa é auditada', async () => {
    const r = await mudar(bruno, { aparencia: { tema: 'nevoa' } });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:sem-permissao',
      permissao: 'organizacao.editar',
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'permissao.recusada', dados: { permissao: 'organizacao.editar' } },
    ]);
    expect(await salvos()).toEqual({});
  });

  it('grava a mudança e a audita, com o valor que valia antes e o que vale depois', async () => {
    const r = await mudar(ana, { aparencia: { tema: 'nevoa' }, dock: { posicao: 'esquerda' } });
    expect(r.statusCode).toBe(200);
    const camada = { aparencia: { tema: 'nevoa' }, dock: { posicao: 'esquerda' } };
    expect(r.json()).toEqual(camada);
    expect(await salvos()).toEqual(camada);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'padroes.alterados',
        atorTipo: 'conta',
        atorContaId: anaId,
        alvoTipo: 'organizacao',
        alvoId: org,
        antes: { 'aparencia.tema': 'grafite', 'dock.posicao': 'embaixo' },
        depois: { 'aparencia.tema': 'nevoa', 'dock.posicao': 'esquerda' },
      },
    ]);
  });

  it('o null volta o ajuste ao padrão de fábrica, e a auditoria só traz o que mudou', async () => {
    await mudar(ana, { aparencia: { tema: 'nevoa', raio: 8 } });
    const r = await mudar(ana, { aparencia: { tema: null } });
    expect(r.json()).toEqual({ aparencia: { raio: 8 } });
    const [registro] = await auditoriaDaRequisicao(api, org, r);
    expect(registro?.antes).toEqual({ 'aparencia.tema': 'nevoa' });
    expect(registro?.depois).toEqual({ 'aparencia.tema': 'grafite' });
  });

  it('grava o evento padroes.mudaram para todas as sessões', async () => {
    await mudar(ana, { aparencia: { tema: 'nevoa' } });
    expect(await gravados()).toMatchObject([
      {
        tipo: 'padroes.mudaram',
        alvoTipo: 'organizacao',
        alvoId: org,
        todas: true,
        permissao: null,
        contas: null,
        sessoes: null,
      },
    ]);
  });

  it('sem sessão, o estado já traz os padrões novos', async () => {
    await mudar(ana, { aparencia: { tema: 'papel' } });
    const r = await cliente.consultar('/sessao', SEM_ENTRADA);
    expect(r.json().organizacao.preferencias).toEqual({ aparencia: { tema: 'papel' } });
  });

  it('um campo inválido recusa o pedido inteiro, sem auditoria nem evento', async () => {
    const r = await mudar(ana, { dock: { tamanho: 90 }, aparencia: { tema: 'papel' } });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:dados-invalidos',
      campos: { 'mudancas.dock.tamanho': 'Use de 28 a 64.' },
    });
    expect(await salvos()).toEqual({});
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
    expect(await gravados()).toEqual([]);
  });

  it('a mudança que não muda nada não grava auditoria nem evento', async () => {
    await mudar(ana, { aparencia: { tema: 'nevoa' } });
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    const r = await mudar(ana, { aparencia: { tema: 'nevoa' }, dock: { posicao: null } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ aparencia: { tema: 'nevoa' } });
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
    expect(await gravados()).toEqual([]);
  });
});
