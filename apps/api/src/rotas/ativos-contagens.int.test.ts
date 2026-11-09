// As contagens do filtro "é qualquer de" (spec tabelas-configuraveis, "Filtros pelas colunas"; change
// filtros-e-barra-da-tabela, design, decisão 2): para uma coluna de escolha, quantos ativos cada
// opção traz, com a busca e os outros filtros ativos, sem o filtro da própria coluna, no escopo de
// quem pede e, num campo restrito, só onde a conta vê os restritos.
import { ativos, campos, camposDoTipo, modelos, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { type FiltroDaVisao, normalizarTexto } from '@grafite/domain';
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

const host = 'grafite.ativos-contagens.local';

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
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });

  const tudo = await criarPerfil(api, org, {
    nome: 'Ativos',
    permissoes: ['ativos.editar', 'ativos.restritos'],
  });
  const ver = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['ativos.ver'] });
  const restritos = await criarPerfil(api, org, {
    nome: 'Restritos',
    permissoes: ['ativos.restritos'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: ver, contaId: bruno.id });
  await atribuir(api, org, { perfilId: restritos, contaId: bruno.id, localId: id('jundiai') });
  const dani = await criarConta(api, org, { usuario: 'dani', nome: 'Daniela Reis' });
  await atribuir(api, org, { perfilId: ver, contaId: dani.id, localId: id('campinas') });
  for (const usuario of ['ana', 'bruno', 'dani']) entradas[usuario] = await cliente.entrar(usuario);

  await naOrganizacao(api.banco, org, async (tx) => {
    const tipo = async (nome: string) => {
      const [criado] = await tx
        .insert(tiposDeAtivo)
        .values({ orgId: org, nome, nomeNormalizado: normalizarTexto(nome), icone: 'impressora' })
        .returning({ id: tiposDeAtivo.id });
      return criado?.id ?? '';
    };
    ids.impressora = await tipo('Impressora');
    ids.switch = await tipo('Switch');
    const novoCampo = async (
      rotulo: string,
      tipoDoCampo: typeof campos.$inferInsert.tipo,
      extras: Partial<typeof campos.$inferInsert> = {},
    ) => {
      const [campo] = await tx
        .insert(campos)
        .values({
          orgId: org,
          rotulo,
          rotuloNormalizado: normalizarTexto(rotulo),
          tipo: tipoDoCampo,
          ...extras,
        })
        .returning({ id: campos.id });
      return campo?.id ?? '';
    };
    const opcoes = (...nomes: string[]) => ({
      opcoes: nomes.map((nome) => ({ id: nome, rotulo: nome, situacao: 'ativa' })),
    });
    ids.criticidade = await novoCampo('Criticidade', 'lista', {
      configuracao: opcoes('alta', 'baixa'),
    });
    ids.areas = await novoCampo('Áreas', 'lista-multipla', { configuracao: opcoes('ti', 'rh') });
    ids.contrato = await novoCampo('Contrato', 'lista', {
      configuracao: opcoes('anual', 'mensal'),
      restrito: true,
    });
    ids.gestor = await novoCampo('Gestor', 'pessoa');
    for (const [ordem, campoId] of [
      id('criticidade'),
      id('areas'),
      id('contrato'),
      id('gestor'),
    ].entries()) {
      await tx
        .insert(camposDoTipo)
        .values({ orgId: org, tipoId: id('impressora'), campoId, ordem });
    }
    const [modelo] = await tx
      .insert(modelos)
      .values({
        orgId: org,
        tipoId: id('impressora'),
        fabricante: 'HP',
        fabricanteNormalizado: 'hp',
        nome: 'LaserJet M404',
        nomeNormalizado: 'laserjet m404',
        busca: 'hp laserjet m404',
      })
      .returning({ id: modelos.id });
    ids.m404 = modelo?.id ?? '';

    const ativo = (colunas: Partial<typeof ativos.$inferInsert>) =>
      tx.insert(ativos).values({ orgId: org, busca: '', ...colunas } as typeof ativos.$inferInsert);
    await ativo({
      tipoId: id('impressora'),
      modeloId: id('m404'),
      hostname: 'imp-almox',
      busca: 'imp-almox',
      localId: id('jundiai'),
      valores: {
        [id('criticidade')]: 'alta',
        [id('areas')]: ['ti', 'rh'],
        [id('contrato')]: 'anual',
      },
    });
    await ativo({
      tipoId: id('impressora'),
      nome: 'Impressora da recepção',
      busca: 'impressora da recepcao',
      localId: id('campinas'),
      valores: {
        [id('criticidade')]: 'baixa',
        [id('areas')]: ['rh'],
        [id('contrato')]: 'anual',
      },
    });
    await ativo({ tipoId: id('switch'), hostname: 'sw-core', localId: id('jundiai') });
    await ativo({
      tipoId: id('impressora'),
      nome: 'Matricial',
      localId: id('jundiai'),
      situacao: 'inativo',
      valores: { [id('criticidade')]: 'alta' },
    });
  });
});

afterAll(async () => {
  await api?.fechar();
});

/** As contagens de uma coluna, com a busca e os filtros dados. */
const contar = (
  coluna: string,
  {
    usuario = 'ana',
    busca,
    filtros,
  }: { usuario?: string; busca?: string; filtros?: FiltroDaVisao[] } = {},
) =>
  cliente.consultar(
    `/ativos/contagens?${new URLSearchParams({
      coluna,
      ...(busca ? { busca } : {}),
      ...(filtros ? { filtros: JSON.stringify(filtros) } : {}),
    }).toString()}`,
    como(usuario),
  );

const EM_JUNDIAI: FiltroDaVisao = { chave: 'ativo.local', operador: 'em', local: '' };

describe('GET /ativos/contagens', () => {
  it('quantos ativos cada tipo traz, os de mais primeiro, com o total', async () => {
    const r = await contar('ativo.tipo');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      coluna: 'ativo.tipo',
      total: 3,
      opcoes: [
        { valor: id('impressora'), quantos: 2 },
        { valor: id('switch'), quantos: 1 },
      ],
    });
  });

  it('com os outros filtros e a busca, sem o filtro da própria coluna', async () => {
    const emJundiai = { ...EM_JUNDIAI, local: id('jundiai') };
    expect((await contar('ativo.tipo', { filtros: [emJundiai] })).json().opcoes).toEqual([
      { valor: id('impressora'), quantos: 1 },
      { valor: id('switch'), quantos: 1 },
    ]);
    const soSwitch: FiltroDaVisao = {
      chave: 'ativo.tipo',
      operador: 'qualquer',
      valores: [id('switch')],
    };
    expect((await contar('ativo.tipo', { filtros: [soSwitch] })).json()).toMatchObject({
      total: 3,
      opcoes: [
        { valor: id('impressora'), quantos: 2 },
        { valor: id('switch'), quantos: 1 },
      ],
    });
    expect((await contar('ativo.tipo', { busca: 'ALMOX' })).json().opcoes).toEqual([
      { valor: id('impressora'), quantos: 1 },
    ]);
    // A situação dos filtros vale como na lista: com "todos", o inativo também conta.
    const todos: FiltroDaVisao = {
      chave: 'ativo.situacao',
      operador: 'situacao',
      situacao: 'todos',
    };
    expect((await contar('ativo.tipo', { filtros: [todos] })).json().opcoes).toEqual([
      { valor: id('impressora'), quantos: 3 },
      { valor: id('switch'), quantos: 1 },
    ]);
  });

  it('a lista, a lista múltipla, que conta cada opção marcada, e o modelo, sem os vazios', async () => {
    expect((await contar(id('criticidade'))).json().opcoes).toEqual([
      { valor: 'alta', quantos: 1 },
      { valor: 'baixa', quantos: 1 },
    ]);
    expect((await contar(id('areas'))).json().opcoes).toEqual([
      { valor: 'rh', quantos: 2 },
      { valor: 'ti', quantos: 1 },
    ]);
    expect((await contar('ativo.modelo')).json().opcoes).toEqual([
      { valor: id('m404'), quantos: 1 },
    ]);
  });

  it('só os ativos que a conta pode ver', async () => {
    expect((await contar('ativo.tipo', { usuario: 'dani' })).json()).toEqual({
      coluna: 'ativo.tipo',
      total: 1,
      opcoes: [{ valor: id('impressora'), quantos: 1 }],
    });
  });

  it('o campo restrito conta só onde a conta vê os restritos', async () => {
    expect((await contar(id('contrato'))).json().opcoes).toEqual([{ valor: 'anual', quantos: 2 }]);
    expect((await contar(id('contrato'), { usuario: 'bruno' })).json().opcoes).toEqual([
      { valor: 'anual', quantos: 1 },
    ]);
  });

  it('a coluna sem contagem, a das pessoas e a que a conta não usa, é recusada em "coluna"', async () => {
    for (const [coluna, usuario] of [
      [id('gestor'), 'ana'],
      ['ativo.hostname', 'ana'],
      ['coluna.que.nao.existe', 'ana'],
      [id('contrato'), 'dani'],
    ] as const) {
      const r = await contar(coluna, { usuario });
      expect(r.statusCode, coluna).toBe(400);
      expect(r.json().campos).toEqual({ coluna: 'Esta coluna não tem contagem.' });
    }
  });
});
