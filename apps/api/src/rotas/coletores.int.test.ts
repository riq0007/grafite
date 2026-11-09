// Os coletores da organização pela API (spec coletor-local, "Coletor da organização", e
// modulo-administracao, "Tela de coletores"; design do P2a, decisão 2): quem administra os coletores
// cadastra, edita, troca o token, inativa e reativa; o token aparece uma vez só e o banco guarda só
// o hash; as faixas ficam na forma canônica; e cada mudança vai para a auditoria, com o evento.
import { createHash } from 'node:crypto';
import { coletores, eventos, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
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

const host = 'grafite.coletores.local';
const outroHost = 'grafite.coletores-b.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
let deOutraOrganizacao = '';
const entradas: Record<string, Entrada> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const coleta = await criarPerfil(api, org, {
    nome: 'Coleta',
    permissoes: ['coletores.administrar'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: coleta, contaId: ana.id });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  for (const usuario of ['ana', 'carla']) entradas[usuario] = await cliente.entrar(usuario);

  const outra = await criarOrganizacao(api, { nome: 'Outra', enderecos: [outroHost] });
  const outroCliente = clienteDaApi(api, outroHost);
  const daOutra = await criarPerfil(api, outra, {
    nome: 'Coleta',
    permissoes: ['coletores.administrar'],
  });
  const bia = await criarConta(api, outra, { usuario: 'bia', nome: 'Bia Lima' });
  await atribuir(api, outra, { perfilId: daOutra, contaId: bia.id });
  const r = await outroCliente.enviar('POST', '/coletores', await outroCliente.entrar('bia'), {
    nome: 'Coletor da outra',
    faixas: [],
  });
  deOutraOrganizacao = r.json().coletor.id;
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const cadastrar = (pedido: object, usuario = 'ana') =>
  cliente.enviar('POST', '/coletores', como(usuario), pedido);
const editar = (id: string, pedido: object) =>
  cliente.enviar('PATCH', `/coletores/${id}`, como('ana'), pedido);
const acao = (id: string, caminho: string, usuario = 'ana') =>
  cliente.enviar('POST', `/coletores/${id}/${caminho}`, como(usuario));

const hash = (token: string) => createHash('sha256').update(token).digest();

const hashGuardado = async (id: string) => {
  const [linha] = await naOrganizacao(api.banco, org, (tx) =>
    tx.select({ tokenHash: coletores.tokenHash }).from(coletores).where(eq(coletores.id, id)),
  );
  return linha?.tokenHash;
};

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ tipo: eventos.tipo, alvoTipo: eventos.alvoTipo, permissao: eventos.permissao })
      .from(eventos),
  );

let nomes = 0;
async function coletorNovo(pedido: object = {}) {
  nomes += 1;
  const r = await cadastrar({ nome: `Coletor ${nomes}`, faixas: [], ...pedido });
  expect(r.statusCode).toBe(201);
  return r.json() as { coletor: { id: string; nome: string }; token: string };
}

describe('cadastro', () => {
  it('cadastra com as faixas canônicas e mostra o token uma vez, guardando só o hash', async () => {
    const r = await cadastrar({
      nome: ' Coletor de Jundiaí ',
      faixas: ['10.0.0.77/24', '10.0.5.0/24', '10.0.0.0/24'],
    });
    expect(r.statusCode).toBe(201);
    const { coletor, token } = r.json();
    expect(coletor).toEqual({
      id: expect.any(String),
      nome: 'Coletor de Jundiaí',
      faixas: ['10.0.0.0/24', '10.0.5.0/24'],
      situacao: 'ativo',
      ultimoContatoEm: null,
      versao: null,
      criadoEm: expect.any(String),
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await hashGuardado(coletor.id)).toEqual(hash(token));
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'coletor.criado',
        alvoTipo: 'coletor',
        alvoId: coletor.id,
        depois: {
          nome: 'Coletor de Jundiaí',
          faixas: ['10.0.0.0/24', '10.0.5.0/24'],
          situacao: 'ativo',
        },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'coletores.mudaram', alvoTipo: 'coletor', permissao: 'coletores.administrar' },
    ]);

    const lista = await cliente.consultar('/coletores', como('ana'));
    expect(lista.statusCode).toBe(200);
    expect(JSON.stringify(lista.json())).not.toContain(token);
    expect(lista.json().permite).toEqual({ cadastrar: true });
    expect(lista.json().coletores.map((c: { nome: string }) => c.nome)).toContain(
      'Coletor de Jundiaí',
    );
  });

  it('recusa a faixa inválida, o nome vazio e o nome repetido sem diferenciar acento', async () => {
    const faixa = await cadastrar({ nome: 'Coletor X', faixas: ['10.0.0.300/24'] });
    expect(faixa.statusCode).toBe(400);
    expect(faixa.json().campos).toEqual({ faixas: 'Use uma faixa como 10.0.0.0/24.' });
    const semNome = await cadastrar({ nome: '  ', faixas: [] });
    expect(semNome.json().campos).toEqual({ nome: 'Informe o nome do coletor.' });
    await coletorNovo({ nome: 'Coletor de Campinas' });
    const repetido = await cadastrar({ nome: 'COLETOR DE CAMPÍNAS', faixas: [] });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().campos).toEqual({ nome: 'Já existe um coletor com este nome.' });
  });
});

describe('edição, token e situação', () => {
  it('edita o nome e as faixas, com o antes → depois na auditoria', async () => {
    const { coletor } = await coletorNovo({ faixas: ['10.0.0.0/24'] });
    const r = await editar(coletor.id, { faixas: ['10.0.0.0/24', '10.0.5.9/24'] });
    expect(r.statusCode).toBe(200);
    expect(r.json().faixas).toEqual(['10.0.0.0/24', '10.0.5.0/24']);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'coletor.alterado',
        antes: { faixas: ['10.0.0.0/24'] },
        depois: { faixas: ['10.0.0.0/24', '10.0.5.0/24'] },
      },
    ]);
    const igual = await editar(coletor.id, { nome: coletor.nome });
    expect(await auditoriaDaRequisicao(api, org, igual)).toEqual([]);
  });

  it('troca o token: o novo aparece uma vez, e o hash do anterior sai', async () => {
    const { coletor, token } = await coletorNovo();
    const r = await acao(coletor.id, 'token');
    expect(r.statusCode).toBe(200);
    const novo = r.json().token;
    expect(novo).not.toBe(token);
    expect(await hashGuardado(coletor.id)).toEqual(hash(novo));
    const [registro] = await auditoriaDaRequisicao(api, org, r);
    expect(registro).toMatchObject({ acao: 'token-do-coletor.trocado', alvoId: coletor.id });
    expect(JSON.stringify(registro)).not.toContain(novo);
    expect(await eventosGravados()).toHaveLength(2);
  });

  it('inativa e reativa, com a auditoria, e repetir não grava nada', async () => {
    const { coletor } = await coletorNovo();
    const inativado = await acao(coletor.id, 'inativacao');
    expect(inativado.json().situacao).toBe('inativo');
    expect(await auditoriaDaRequisicao(api, org, inativado)).toMatchObject([
      { acao: 'coletor.inativado', antes: { situacao: 'ativo' }, depois: { situacao: 'inativo' } },
    ]);
    const deNovo = await acao(coletor.id, 'inativacao');
    expect(await auditoriaDaRequisicao(api, org, deNovo)).toEqual([]);
    const reativado = await acao(coletor.id, 'reativacao');
    expect(reativado.json().situacao).toBe('ativo');
    expect(await auditoriaDaRequisicao(api, org, reativado)).toMatchObject([
      { acao: 'coletor.reativado' },
    ]);
  });
});

describe('permissão e isolamento', () => {
  it('sem coletores.administrar, recusa a lista e as mudanças com 403', async () => {
    const { coletor } = await coletorNovo();
    expect((await cliente.consultar('/coletores', como('carla'))).statusCode).toBe(403);
    expect((await cadastrar({ nome: 'Sem permissão', faixas: [] }, 'carla')).statusCode).toBe(403);
    expect((await acao(coletor.id, 'token', 'carla')).statusCode).toBe(403);
  });

  it('o coletor de outra organização ou que não existe responde 404', async () => {
    const r = await editar(deOutraOrganizacao, { nome: 'Tomado' });
    expect(r.statusCode).toBe(404);
    expect(r.json().detail).toBe('Coletor não encontrado.');
    expect((await acao('0199a6e0-0000-7000-8000-000000000999', 'token')).statusCode).toBe(404);
  });
});
