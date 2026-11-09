// A leitura dos ativos pela API (spec cadastro-de-ativos; design do P1b, decisões 6, 7 e 8): a lista
// pelo alcance de `ativos.ver` no local do ativo, com os filtros, a busca no ativo e no modelo e o
// cursor; e a ficha, com os valores, o estado com o autor, as referências pelo nome e os campos
// restritos só para quem tem `ativos.restritos` no local do ativo.
import { ativos, campos, camposDoTipo, modelos, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
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
  criarPessoa,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.ativos-leitura.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

/** Um ativo, direto no banco, com os valores e o estado dados. */
/** Os ids vêm do mapa do teste, já preenchido no beforeAll. */
function criarAtivo(colunas: Record<string, unknown>) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [ativo] = await tx
      .insert(ativos)
      .values({ orgId: org, busca: '', ...colunas } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    return ativo?.id ?? '';
  });
}

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);

  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: ids.jundiai });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });

  const tudo = await criarPerfil(api, org, {
    nome: 'Ativos',
    permissoes: ['ativos.editar', 'ativos.restritos'],
  });
  const editar = await criarPerfil(api, org, { nome: 'Editar', permissoes: ['ativos.editar'] });
  const ver = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['ativos.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  ids.ana = ana.id;
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: editar, contaId: bruno.id, localId: ids.jundiai });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  const dani = await criarConta(api, org, { usuario: 'dani', nome: 'Dani Lima' });
  await atribuir(api, org, { perfilId: ver, contaId: dani.id });
  for (const usuario of ['ana', 'bruno', 'carla', 'dani'])
    entradas[usuario] = await cliente.entrar(usuario);

  ids.joao = await criarPessoa(api, org, { nome: 'João da Silva' });

  await naOrganizacao(api.banco, org, async (tx) => {
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Impressora',
        nomeNormalizado: 'impressora',
        icone: 'impressora',
      })
      .returning({ id: tiposDeAtivo.id });
    ids.impressora = tipo?.id ?? '';
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
    ids.ip = await novoCampo('IP', 'ip', { grupo: 'Rede' });
    ids.custo = await novoCampo('Custo do contrato', 'moeda', { restrito: true });
    ids.vizinho = await novoCampo('Impressora vizinha', 'ativo');
    for (const [ordem, campoId] of [ids.ip, ids.custo, ids.vizinho].entries()) {
      await tx
        .insert(camposDoTipo)
        .values({ orgId: org, tipoId: ids.impressora, campoId: campoId ?? '', ordem });
    }
    const [modelo] = await tx
      .insert(modelos)
      .values({
        orgId: org,
        tipoId: ids.impressora,
        fabricante: 'HP',
        fabricanteNormalizado: 'hp',
        nome: 'LaserJet M404',
        nomeNormalizado: 'laserjet m404',
        busca: 'hp laserjet m404',
      })
      .returning({ id: modelos.id });
    ids.m404 = modelo?.id ?? '';
  });

  ids.rh = await criarAtivo({
    tipoId: ids.impressora,
    nome: 'Impressora do RH',
    localId: ids.campinas,
    busca: 'impressora do rh',
  });
  ids.almox = await criarAtivo({
    tipoId: ids.impressora,
    modeloId: ids.m404,
    patrimonio: 'PAT-00412',
    patrimonioNormalizado: 'pat-00412',
    localId: ids.expedicao,
    responsavelId: ids.joao,
    valores: { [ids.ip ?? '']: '10.0.0.5', [ids.custo ?? '']: 1234.5, [ids.vizinho ?? '']: ids.rh },
    estado: {
      'ativo.patrimonio': {
        origem: 'manual',
        momento: '2026-10-09T14:32:00.000Z',
        autorId: ids.ana,
        trava: true,
      },
      [ids.custo ?? '']: { origem: 'planilha', momento: null, autorId: null, trava: false },
    },
    busca: 'pat-00412 10.0.0.5',
  });
  ids.estoque = await criarAtivo({
    tipoId: ids.impressora,
    patrimonio: 'PAT-00999',
    patrimonioNormalizado: 'pat-00999',
    uso: 'em-estoque',
    busca: 'pat-00999',
  });
  ids.velha = await criarAtivo({
    tipoId: ids.impressora,
    nome: 'Matricial',
    localId: ids.jundiai,
    situacao: 'inativo',
    busca: 'matricial',
  });
});

afterAll(async () => {
  await api?.fechar();
});

const listar = (consulta = '', usuario = 'ana') =>
  cliente.consultar(`/ativos${consulta}`, como(usuario));
const ficha = (id: string, usuario = 'ana') => cliente.consultar(`/ativos/${id}`, como(usuario));
const rotulos = (r: { json: () => { itens: { rotulo: string }[] } }) =>
  r.json().itens.map((item) => item.rotulo);

describe('GET /ativos', () => {
  it('lista os ativos ativos, os cadastrados por último primeiro, com o que a lista mostra', async () => {
    const r = await listar();
    expect(r.statusCode).toBe(200);
    expect(rotulos(r)).toEqual(['Impressora', 'HP LaserJet M404', 'Impressora do RH']);
    expect(r.json().total).toBe(3);
    expect(r.json().permite).toEqual({ cadastrar: true });
    expect(r.json().itens[1]).toEqual({
      id: ids.almox,
      rotulo: 'HP LaserJet M404',
      tipo: { id: ids.impressora, nome: 'Impressora', icone: 'impressora' },
      modelo: { id: ids.m404, fabricante: 'HP', nome: 'LaserJet M404', imagem: null },
      imagem: null,
      patrimonio: 'PAT-00412',
      serie: null,
      hostname: null,
      local: { id: ids.expedicao, caminho: 'Jundiaí › Expedição' },
      responsavel: { id: ids.joao, nome: 'João da Silva' },
      uso: 'em-uso',
      situacao: 'ativo',
      criadoEm: expect.any(String),
      atualizadoEm: expect.any(String),
      valores: {},
      permite: { editar: true, verRestritos: true, verResponsavel: false },
      // O tipo não liga a disponibilidade na rede.
      disponibilidade: null,
      suprimentos: null,
      controlId: null,
    });
  });

  it('mostra só os ativos do alcance: o ativo sem local só para a organização inteira', async () => {
    const r = await listar('', 'bruno');
    expect(rotulos(r)).toEqual(['HP LaserJet M404']);
    expect(r.json().total).toBe(1);
    expect(r.json().permite).toEqual({ cadastrar: true });
    const daDani = await listar('', 'dani');
    expect(rotulos(daDani)).toHaveLength(3);
    expect(daDani.json().permite).toEqual({ cadastrar: false });
    expect(
      daDani.json().itens.every((item: { permite: { editar: boolean } }) => !item.permite.editar),
    ).toBe(true);
  });

  it('filtra pela situação, pelo uso, pelo tipo e pelo local, com o ramo', async () => {
    expect(rotulos(await listar('?situacao=inativos'))).toEqual(['Matricial']);
    expect(rotulos(await listar('?situacao=todos'))).toHaveLength(4);
    expect(rotulos(await listar('?uso=em-estoque'))).toEqual(['Impressora']);
    expect(rotulos(await listar(`?tipo=${ids.impressora}`))).toHaveLength(3);
    expect(rotulos(await listar(`?local=${ids.jundiai}`))).toEqual(['HP LaserJet M404']);
    expect(rotulos(await listar(`?local=${ids.jundiai}&situacao=todos`))).toEqual([
      'Matricial',
      'HP LaserJet M404',
    ]);
  });

  it('busca no ativo e no modelo, palavra a palavra, sem acento nem maiúsculas', async () => {
    expect(rotulos(await listar('?busca=LASERJET'))).toEqual(['HP LaserJet M404']);
    expect(rotulos(await listar('?busca=hp%2000412'))).toEqual(['HP LaserJet M404']);
    expect(rotulos(await listar('?busca=10.0.0.5'))).toEqual(['HP LaserJet M404']);
    expect(rotulos(await listar('?busca=rh'))).toEqual(['Impressora do RH']);
    expect(rotulos(await listar('?busca=nada'))).toEqual([]);
  });

  it('pagina pelo cursor', async () => {
    const primeira = await listar('?limite=2');
    expect(rotulos(primeira)).toEqual(['Impressora', 'HP LaserJet M404']);
    expect(primeira.json().proximo).toEqual(expect.any(String));
    const segunda = await listar(`?limite=2&cursor=${primeira.json().proximo}`);
    expect(rotulos(segunda)).toEqual(['Impressora do RH']);
    expect(segunda.json().proximo).toBeNull();
  });

  it('pede ativos.ver', async () => {
    expect((await listar('', 'carla')).statusCode).toBe(403);
  });
});

describe('GET /ativos/:id', () => {
  it('traz os valores, o estado com o autor, as referências pelo nome e o que a conta pode', async () => {
    const r = await ficha(ids.almox ?? '');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      id: ids.almox,
      rotulo: 'HP LaserJet M404',
      valores: {
        'ativo.patrimonio': 'PAT-00412',
        'ativo.uso': 'em-uso',
        'ativo.local': ids.expedicao,
        'ativo.responsavel': ids.joao,
        [ids.ip ?? '']: '10.0.0.5',
        [ids.custo ?? '']: 1234.5,
        [ids.vizinho ?? '']: ids.rh,
      },
      estado: {
        'ativo.patrimonio': {
          origem: 'manual',
          momento: '2026-10-09T14:32:00.000Z',
          autor: { id: ids.ana, nome: 'Ana Souza' },
          trava: true,
        },
        [ids.custo ?? '']: { origem: 'planilha', momento: null, autor: null, trava: false },
      },
      referencias: {
        pessoas: { [ids.joao ?? '']: 'João da Silva' },
        locais: { [ids.expedicao ?? '']: 'Jundiaí › Expedição' },
        ativos: { [ids.rh ?? '']: 'Impressora do RH' },
      },
      permite: { editar: true, verRestritos: true, editarRestritos: true, verResponsavel: false },
    });
    expect(Object.keys(r.json().valores)).not.toContain('ativo.nome');
  });

  it('sem ativos.restritos, a ficha não traz o valor nem o estado do campo restrito', async () => {
    const r = await ficha(ids.almox ?? '', 'dani');
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json().valores)).not.toContain(ids.custo);
    expect(Object.keys(r.json().estado)).not.toContain(ids.custo);
    expect(r.json().permite).toEqual({
      editar: false,
      verRestritos: false,
      editarRestritos: false,
      verResponsavel: false,
      acessoRemoto: false,
      escolherLoginDoControle: false,
    });
  });

  it('o ativo referenciado fora do alcance aparece sem o nome', async () => {
    const r = await ficha(ids.almox ?? '', 'bruno');
    expect(r.json().referencias.ativos).toEqual({ [ids.rh ?? '']: 'Ativo fora do seu acesso' });
    expect(r.json().permite).toEqual({
      editar: true,
      verRestritos: false,
      editarRestritos: false,
      verResponsavel: false,
      acessoRemoto: false,
      escolherLoginDoControle: false,
    });
  });

  it('recusa o ativo fora do alcance, e o que não existe', async () => {
    expect((await ficha(ids.rh ?? '', 'bruno')).statusCode).toBe(403);
    expect((await ficha(ids.estoque ?? '', 'bruno')).statusCode).toBe(403);
    expect((await ficha(ids.almox ?? '', 'carla')).statusCode).toBe(403);
    const inexistente = await ficha('0199a6e0-0000-7000-8000-000000000999');
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.json().detail).toBe('Ativo não encontrado.');
  });
});
