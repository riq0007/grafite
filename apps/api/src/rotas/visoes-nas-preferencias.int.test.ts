// A visão escolhida nas preferências (spec preferencias-da-interface; design do P1c, decisão 7): a
// conta escolhe a visão de fábrica, uma da organização ou uma dela, e os padrões da organização,
// a de fábrica ou uma da organização. A visão que a camada não pode usar é recusada com 400, sem
// gravar nada do pedido. O resumo da linha é uma preferência como as outras.
import { naOrganizacao, visoes } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

const host = 'grafite.visoes-nas-preferencias.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

function incluir(nome: string, contaId: string | null) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [visao] = await tx
      .insert(visoes)
      .values({
        orgId: org,
        tabela: 'ativos',
        contaId,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        definicao: { colunas: [], ordenacao: null, filtros: [] },
      })
      .returning({ id: visoes.id });
    return visao?.id ?? '';
  });
}

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const administra = await criarPerfil(api, org, {
    nome: 'Administra',
    permissoes: ['organizacao.editar', 'ativos.ver'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administra, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  for (const usuario of ['ana', 'bruno']) entradas[usuario] = await cliente.entrar(usuario);
  ids.daOrganizacao = await incluir('Impressoras', null);
  ids.doBruno = await incluir('Meus notebooks', bruno.id);
  ids.daCarla = await incluir('Da Carla', carla.id);
});

afterAll(async () => {
  await api?.fechar();
});

const naConta = (usuario: string, tabelas: Record<string, unknown>) =>
  cliente.enviar('PATCH', '/conta/preferencias', como(usuario), { mudancas: { tabelas } });

const nosPadroes = (tabelas: Record<string, unknown>) =>
  cliente.enviar('PATCH', '/organizacao/padroes', como('ana'), { mudancas: { tabelas } });

describe('a visão escolhida e o resumo da linha nas preferências', () => {
  it('a conta grava o resumo da linha', async () => {
    const r = await naConta('bruno', { resumoDaLinha: false });
    expect(r.statusCode).toBe(200);
    expect(r.json().tabelas).toEqual({ resumoDaLinha: false });
  });

  it('a conta escolhe a de fábrica, uma da organização ou uma dela', async () => {
    for (const visao of ['fabrica', ids.daOrganizacao, ids.doBruno]) {
      const r = await naConta('bruno', { visoes: { ativos: visao } });
      expect(r.statusCode, String(visao)).toBe(200);
      expect(r.json().tabelas.visoes).toEqual({ ativos: visao });
    }
  });

  it('a conta não escolhe a visão de outra conta nem uma que não existe, e nada do pedido grava', async () => {
    await naConta('bruno', { resumoDaLinha: true, visoes: { ativos: 'fabrica' } });
    for (const visao of [ids.daCarla, '0199a6e0-0000-7000-8000-0000000000ff']) {
      const r = await naConta('bruno', { resumoDaLinha: false, visoes: { ativos: visao } });
      expect(r.statusCode).toBe(400);
      expect(r.json().campos).toEqual({
        'mudancas.tabelas.visoes.ativos': 'Escolha uma visão que você pode usar.',
      });
    }
    const sessao = await cliente.consultar('/sessao', como('bruno'));
    expect(sessao.json().sessao.conta.preferencias.tabelas).toEqual({
      resumoDaLinha: true,
      visoes: { ativos: 'fabrica' },
    });
  });

  it('o valor que não é uma visão é recusado pelo esquema', async () => {
    const r = await naConta('bruno', { visoes: { ativos: 'todos' } });
    expect(r.statusCode).toBe(400);
    expect(Object.keys(r.json().campos)).toEqual(['mudancas.tabelas.visoes.ativos']);
  });

  it('a padrão da organização é uma visão da organização, com a auditoria', async () => {
    const r = await nosPadroes({ visoes: { ativos: ids.daOrganizacao } });
    expect(r.statusCode).toBe(200);
    expect(r.json().tabelas.visoes).toEqual({ ativos: ids.daOrganizacao });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'padroes.alterados',
        antes: { 'tabelas.visoes': {} },
        depois: { 'tabelas.visoes': { ativos: ids.daOrganizacao } },
      },
    ]);
  });

  it('a visão de uma conta não é a padrão da organização, e os padrões não mudam', async () => {
    const r = await nosPadroes({ visoes: { ativos: ids.doBruno } });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      'mudancas.tabelas.visoes.ativos': 'Escolha uma visão da organização.',
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
    const sessao = await cliente.consultar('/sessao', como('bruno'));
    expect(sessao.json().organizacao.preferencias.tabelas.visoes).toEqual({
      ativos: ids.daOrganizacao,
    });
  });
});

// As visões fixadas no menu (spec visoes-de-tabela, "Visões fixadas no menu"; change
// visoes-no-dock, design, decisão 1): as da conta nas preferências dela, as da organização nos
// padrões, cada camada com a chave dela, até 20, só com as visões que a camada pode usar.
describe('as visões fixadas no menu', () => {
  it('a conta fixa uma visão da organização e uma dela, e não a de outra conta', async () => {
    const r = await naConta('bruno', { fixadas: { ativos: [ids.daOrganizacao, ids.doBruno] } });
    expect(r.statusCode).toBe(200);
    expect(r.json().tabelas.fixadas).toEqual({ ativos: [ids.daOrganizacao, ids.doBruno] });
    const deOutra = await naConta('bruno', { fixadas: { ativos: [ids.daCarla] } });
    expect(deOutra.statusCode).toBe(400);
    expect(deOutra.json().campos).toEqual({
      'mudancas.tabelas.fixadas.ativos': 'Fixe uma visão que você pode usar.',
    });
  });

  it('cada conta fixa até 20 visões', async () => {
    const muitas: string[] = [];
    for (let numero = 1; numero <= 21; numero++)
      muitas.push(await incluir(`Visão ${numero}`, null));
    const r = await naConta('bruno', { fixadas: { ativos: muitas } });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      'mudancas.tabelas.fixadas.ativos': 'Você já fixou 20 visões. Desafixe uma para fixar outra.',
    });
    const naOrganizacao = await nosPadroes({ fixadasPelaOrganizacao: { ativos: muitas } });
    expect(naOrganizacao.json().campos).toEqual({
      'mudancas.tabelas.fixadasPelaOrganizacao.ativos':
        'A organização já fixou 20 visões. Desafixe uma para fixar outra.',
    });
  });

  it('a conta não grava as fixadas da organização, nem os padrões as de uma conta', async () => {
    const pelaConta = await naConta('bruno', {
      fixadasPelaOrganizacao: { ativos: [ids.daOrganizacao] },
    });
    expect(pelaConta.statusCode).toBe(400);
    expect(pelaConta.json().campos).toEqual({
      'mudancas.tabelas.fixadasPelaOrganizacao': 'A organização fixa as visões dela nos padrões.',
    });
    const nosDaOrganizacao = await nosPadroes({ fixadas: { ativos: [ids.daOrganizacao] } });
    expect(nosDaOrganizacao.statusCode).toBe(400);
    expect(nosDaOrganizacao.json().campos).toEqual({
      'mudancas.tabelas.fixadas': 'Cada conta fixa as visões dela nas preferências dela.',
    });
  });

  it('a organização fixa para todos uma visão dela, com a auditoria, e não a de uma conta', async () => {
    const r = await nosPadroes({ fixadasPelaOrganizacao: { ativos: [ids.daOrganizacao] } });
    expect(r.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'padroes.alterados',
        antes: { 'tabelas.fixadasPelaOrganizacao': {} },
        depois: { 'tabelas.fixadasPelaOrganizacao': { ativos: [ids.daOrganizacao] } },
      },
    ]);
    const daConta = await nosPadroes({ fixadasPelaOrganizacao: { ativos: [ids.doBruno] } });
    expect(daConta.statusCode).toBe(400);
    expect(daConta.json().campos).toEqual({
      'mudancas.tabelas.fixadasPelaOrganizacao.ativos': 'Fixe uma visão da organização.',
    });
    // A sessão traz as duas, lado a lado.
    const sessao = await cliente.consultar('/sessao', como('bruno'));
    expect(sessao.json().organizacao.preferencias.tabelas.fixadasPelaOrganizacao).toEqual({
      ativos: [ids.daOrganizacao],
    });
    expect(sessao.json().sessao.conta.preferencias.tabelas.fixadas).toEqual({
      ativos: [ids.daOrganizacao, ids.doBruno],
    });
  });

  it('restaurar as tabelas tira as fixadas da camada, e o nulo da chave da outra camada passa', async () => {
    // Como a web restaura uma seção: cada campo dela com nulo, o da outra camada também.
    const nulos = {
      linhasAlternadas: null,
      miniaturas: null,
      resumoDaLinha: null,
      visoes: null,
      fixadas: null,
      fixadasPelaOrganizacao: null,
    };
    const pelaConta = await naConta('bruno', nulos);
    expect(pelaConta.statusCode).toBe(200);
    expect(pelaConta.json().tabelas?.fixadas).toBeUndefined();
    const nosDaOrganizacao = await nosPadroes(nulos);
    expect(nosDaOrganizacao.statusCode).toBe(200);
    expect(nosDaOrganizacao.json().tabelas?.fixadasPelaOrganizacao).toBeUndefined();
  });
});
