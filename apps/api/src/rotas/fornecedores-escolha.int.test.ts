// A escolha do fornecedor e os ativos dele (spec fornecedores, "Quem vê e quem edita os
// fornecedores" e "Ativos do fornecedor"; change p4a-fornecedores, design, decisões 5 e 6): toda
// sessão ativa lê os fornecedores ativos para escolher, só com o nome e o CNPJ, como lê a árvore de
// locais; a ficha conta os ativos ativos do fornecedor no escopo de quem vê os ativos.
import { fornecedores, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAtivoDoTipo, criarTipo, desligarModulos } from '../../test/alertas.ts';
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

const host = 'grafite.escolha-de-fornecedores.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas = {} as Record<'ana' | 'bruno' | 'davi', Entrada>;
const ids: Record<string, string> = {};

/** Um fornecedor direto no banco. */
const fornecedor = (nome: string, colunas: Partial<typeof fornecedores.$inferInsert> = {}) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(fornecedores)
      .values({ orgId: org, nome, nomeNormalizado: nome.toLowerCase(), ...colunas })
      .returning({ id: fornecedores.id });
    return linha?.id ?? '';
  });

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  const campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  // Ana vê os fornecedores e os ativos de toda a organização; Bruno edita os ativos de Campinas,
  // sem ver os fornecedores; Davi vê os fornecedores, sem ver os ativos.
  const compras = await criarPerfil(api, org, {
    nome: 'Compras',
    permissoes: ['fornecedores.ver', 'ativos.ver'],
  });
  const campo = await criarPerfil(api, org, { nome: 'Campo', permissoes: ['ativos.editar'] });
  const leitura = await criarPerfil(api, org, {
    nome: 'Leitura',
    permissoes: ['fornecedores.ver'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Lima' });
  const davi = await criarConta(api, org, { usuario: 'davi', nome: 'Davi Rocha' });
  await atribuir(api, org, { perfilId: compras, contaId: ana.id });
  await atribuir(api, org, { perfilId: campo, contaId: bruno.id, localId: campinas });
  await atribuir(api, org, { perfilId: leitura, contaId: davi.id });
  for (const usuario of ['ana', 'bruno', 'davi'] as const) {
    entradas[usuario] = await cliente.entrar(usuario);
  }

  ids.hp = await fornecedor('HP Brasil', { cnpj: '12345678000195' });
  ids.locadora = await fornecedor('Locadora Norte');
  ids.inativo = await fornecedor('Locadora Antiga', { situacao: 'inativo' });
  const impressora = await criarTipo(api, org, { nome: 'Impressora', capacidades: [] });
  const daHp = { 'ativo.fornecedor': ids.hp };
  // A HP Brasil fornece 5 ativos em Jundiaí, 3 em Campinas e 1 inativo.
  for (const [localId, quantos] of [
    [jundiai, 5],
    [campinas, 3],
  ] as const) {
    for (let i = 0; i < quantos; i += 1) {
      await criarAtivoDoTipo(api, org, { tipoId: impressora, localId, valores: daHp });
    }
  }
  await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    localId: jundiai,
    situacao: 'inativo',
    valores: daHp,
  });
});

afterAll(async () => {
  await api?.fechar();
});

describe('GET /fornecedores/escolha', () => {
  it('Escolher sem ver a Administração: os ativos, pelo nome, com o CNPJ', async () => {
    const r = await cliente.consultar('/fornecedores/escolha', entradas.bruno);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      fornecedores: [
        { id: ids.hp, nome: 'HP Brasil', cnpj: '12.345.678/0001-95' },
        { id: ids.locadora, nome: 'Locadora Norte', cnpj: null },
      ],
    });
  });
});

describe('GET /fornecedores/{id}/ativos', () => {
  const ativosDa = async (usuario: keyof typeof entradas) =>
    (await cliente.consultar(`/fornecedores/${ids.hp}/ativos`, entradas[usuario])).json();

  it('Ativos da HP Brasil: conta os ativos ativos dela, no escopo de quem vê', async () => {
    expect(await ativosDa('ana')).toEqual({ ativos: 8 });
  });

  it('sem ver os ativos, ou com o módulo desligado, não conta', async () => {
    expect(await ativosDa('davi')).toEqual({ ativos: null });
    await desligarModulos(api, org, ['ativos']);
    try {
      expect(await ativosDa('ana')).toEqual({ ativos: null });
    } finally {
      await desligarModulos(api, org, []);
    }
  });

  it('pede que a conta veja os fornecedores', async () => {
    const r = await cliente.consultar(`/fornecedores/${ids.hp}/ativos`, entradas.bruno);
    expect(r.statusCode).toBe(403);
  });
});
