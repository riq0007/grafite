// A tabela dos ativos pela API (spec cadastro-de-ativos; design do P1c, decisões 3 e 4): os filtros
// por coluna, as colunas pedidas com as referências e a ordem por qualquer coluna que ordena, com o
// cursor, sobre os ativos que a conta pode ver, e os campos restritos só onde ela os vê.
import { ativos, campos, camposDoTipo, modelos, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { type FiltroDaVisao, normalizarTexto } from '@grafite/domain';
import { sql } from 'drizzle-orm';
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
import { ACENTUADAS, SEM_ACENTO } from '../ativos/colunas.ts';

const host = 'grafite.ativos-tabela.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const id = (nome: string) => ids[nome] ?? '';

/** Um ativo, direto no banco, com os valores dados. */
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
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: id('jundiai') });
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
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: ver, contaId: carla.id });
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);

  ids.joao = await criarPessoa(api, org, { nome: 'João da Silva' });
  ids.maria = await criarPessoa(api, org, { nome: 'Maria Souza' });

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
    ids.ip = await novoCampo('IP', 'ip', { grupo: 'Rede' });
    ids.criticidade = await novoCampo('Criticidade', 'lista', {
      configuracao: {
        opcoes: [
          { id: 'alta', rotulo: 'Alta', situacao: 'ativa' },
          { id: 'media', rotulo: 'Média', situacao: 'ativa' },
          { id: 'baixa', rotulo: 'Baixa', situacao: 'ativa' },
        ],
      },
    });
    ids.areas = await novoCampo('Áreas', 'lista-multipla', {
      configuracao: {
        opcoes: [
          { id: 'ti', rotulo: 'TI', situacao: 'ativa' },
          { id: 'rh', rotulo: 'RH', situacao: 'ativa' },
        ],
      },
    });
    ids.custo = await novoCampo('Custo do contrato', 'moeda', { restrito: true });
    ids.gestor = await novoCampo('Gestor', 'pessoa');
    ids.sala = await novoCampo('Sala', 'local');
    ids.vizinha = await novoCampo('Impressora vizinha', 'ativo');
    for (const [ordem, campoId] of [
      id('ip'),
      id('criticidade'),
      id('areas'),
      id('custo'),
      id('gestor'),
      id('sala'),
      id('vizinha'),
    ].entries()) {
      await tx
        .insert(camposDoTipo)
        .values({ orgId: org, tipoId: id('impressora'), campoId, ordem });
    }
    await tx
      .insert(camposDoTipo)
      .values({ orgId: org, tipoId: id('switch'), campoId: id('custo'), ordem: 0 });
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
  });

  ids.almox = await criarAtivo({
    tipoId: id('impressora'),
    modeloId: id('m404'),
    patrimonio: 'PAT-00412',
    patrimonioNormalizado: 'pat-00412',
    hostname: 'IMP-ALMOX-01',
    localId: id('expedicao'),
    responsavelId: id('joao'),
    criadoEm: new Date('2026-10-01T02:00:00.000Z'),
    valores: {
      [id('ip')]: '10.0.0.9',
      [id('criticidade')]: 'alta',
      [id('areas')]: ['ti', 'rh'],
      [id('custo')]: 3000,
      [id('gestor')]: id('maria'),
      [id('sala')]: id('expedicao'),
      'ativo.garantia': '2026-06-30',
      'ativo.valor-de-compra': 1500,
    },
  });
  ids.recepcao = await criarAtivo({
    tipoId: id('impressora'),
    nome: 'Impressora da Recepção',
    hostname: 'imp-rh',
    localId: id('campinas'),
    criadoEm: new Date('2026-10-02T12:00:00.000Z'),
    valores: {
      [id('ip')]: '10.0.0.10',
      [id('criticidade')]: 'baixa',
      [id('areas')]: ['rh'],
      [id('custo')]: 4000,
      'ativo.garantia': '2027-01-15',
      'ativo.valor-de-compra': 800,
    },
  });
  ids.core = await criarAtivo({
    tipoId: id('switch'),
    patrimonio: 'PAT-00100',
    patrimonioNormalizado: 'pat-00100',
    hostname: 'sw-core',
    uso: 'em-estoque',
    localId: id('jundiai'),
    criadoEm: new Date('2026-10-03T12:00:00.000Z'),
  });
  ids.matricial = await criarAtivo({
    tipoId: id('impressora'),
    nome: 'Matricial',
    hostname: 'matricial',
    localId: id('jundiai'),
    situacao: 'inativo',
    criadoEm: new Date('2026-10-04T12:00:00.000Z'),
  });
  ids.semLocal = await criarAtivo({
    tipoId: id('impressora'),
    nome: 'Sem local',
    criadoEm: new Date('2026-10-05T12:00:00.000Z'),
    valores: { [id('custo')]: 100 },
  });
  // A vizinha da impressora do almoxarifado é a da recepção, cadastrada depois dela.
  await naOrganizacao(api.banco, org, (tx) =>
    tx.execute(
      sql`update ativos set valores = valores || jsonb_build_object(${id('vizinha')}::text, ${id('recepcao')}::text) where id = ${id('almox')}`,
    ),
  );
});

afterAll(async () => {
  await api?.fechar();
});

const consulta = (parametros: Record<string, string>) =>
  `?${new URLSearchParams(parametros).toString()}`;

const listar = (parametros: Record<string, string> = {}, usuario = 'ana') =>
  cliente.consultar(`/ativos${consulta(parametros)}`, como(usuario));

const filtrar = (filtros: FiltroDaVisao[], usuario = 'ana', extras: Record<string, string> = {}) =>
  listar({ filtros: JSON.stringify(filtros), ...extras }, usuario);

/** Os ids dos ativos da resposta, na ordem dela. */
const idsDa = (r: { json: () => { itens: { id: string }[] } }) =>
  r.json().itens.map((item) => item.id);

/** Os nomes do mapa de ids, para comparar sem depender da ordem. */
const nomesDe = (lista: string[]) =>
  lista.map((ativo) => Object.keys(ids).find((nome) => ids[nome] === ativo) ?? ativo).sort();

describe('a forma sem acento no banco', () => {
  it('é a do normalizarTexto em cada letra acentuada do Latin-1 e do Latin Extended-A', async () => {
    const letras = [...ACENTUADAS].join('');
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx.execute<{ forma: string }>(
        sql`select lower(translate(${letras}, ${ACENTUADAS}, ${SEM_ACENTO})) as forma`,
      ),
    ).then((r) => r.rows);
    expect(linha?.forma).toBe(normalizarTexto(letras));
    expect(ACENTUADAS.length).toBe(SEM_ACENTO.length);
  });
});

describe('GET /ativos com os filtros das colunas', () => {
  it('o texto que contém, sem diferenciar acento e maiúsculas, no hostname e no nome do ativo', async () => {
    expect(
      nomesDe(
        idsDa(await filtrar([{ chave: 'ativo.hostname', operador: 'contem', texto: 'ALMOX' }])),
      ),
    ).toEqual(['almox']);
    expect(
      nomesDe(
        idsDa(await filtrar([{ chave: 'ativo.rotulo', operador: 'contem', texto: 'recepcao' }])),
      ),
    ).toEqual(['recepcao']);
    expect(
      nomesDe(idsDa(await filtrar([{ chave: id('ip'), operador: 'contem', texto: '10.0.0.1' }]))),
    ).toEqual(['recepcao']);
  });

  it('o intervalo de números e de datas, com os limites incluídos e sem os vazios', async () => {
    expect(
      nomesDe(
        idsDa(await filtrar([{ chave: 'ativo.valor-de-compra', operador: 'entre', de: 1500 }])),
      ),
    ).toEqual(['almox']);
    expect(
      nomesDe(
        idsDa(await filtrar([{ chave: 'ativo.valor-de-compra', operador: 'entre', ate: 1000 }])),
      ),
    ).toEqual(['recepcao']);
    expect(
      nomesDe(
        idsDa(await filtrar([{ chave: 'ativo.garantia', operador: 'entre', ate: '2026-12-31' }])),
      ),
    ).toEqual(['almox']);
  });

  it('o intervalo dos momentos pelos dias no fuso pedido', async () => {
    const desdeOPrimeiro: FiltroDaVisao[] = [
      { chave: 'ativo.criado-em', operador: 'entre', de: '2026-10-01', ate: '2026-10-02' },
    ];
    // 01/10/2026 02:00 em UTC é 30/09/2026 23:00 em São Paulo.
    expect(nomesDe(idsDa(await filtrar(desdeOPrimeiro, 'ana', { fuso: 'UTC' })))).toEqual([
      'almox',
      'recepcao',
    ]);
    expect(
      nomesDe(idsDa(await filtrar(desdeOPrimeiro, 'ana', { fuso: 'America/Sao_Paulo' }))),
    ).toEqual(['recepcao']);
  });

  it('qualquer das escolhas: o tipo, o modelo, o responsável, as opções e a lista múltipla', async () => {
    const qualquer = (chave: string, valores: string[]) =>
      filtrar([{ chave, operador: 'qualquer', valores }]).then((r) => nomesDe(idsDa(r)));
    expect(await qualquer('ativo.tipo', [id('switch')])).toEqual(['core']);
    expect(await qualquer('ativo.modelo', [id('m404')])).toEqual(['almox']);
    expect(await qualquer('ativo.responsavel', [id('joao')])).toEqual(['almox']);
    expect(await qualquer(id('gestor'), [id('maria')])).toEqual(['almox']);
    expect(await qualquer(id('criticidade'), ['alta', 'media'])).toEqual(['almox']);
    expect(await qualquer(id('areas'), ['ti'])).toEqual(['almox']);
    expect(await qualquer(id('areas'), ['rh'])).toEqual(['almox', 'recepcao']);
    expect(await qualquer('ativo.tipo', ['nao-e-um-id'])).toEqual([]);
  });

  it('no local, com tudo o que está dentro dele, também num campo de local', async () => {
    expect(
      nomesDe(
        idsDa(await filtrar([{ chave: 'ativo.local', operador: 'em', local: id('jundiai') }])),
      ),
    ).toEqual(['almox', 'core']);
    expect(
      nomesDe(idsDa(await filtrar([{ chave: id('sala'), operador: 'em', local: id('jundiai') }]))),
    ).toEqual(['almox']);
  });

  it('vazio e preenchido', async () => {
    expect(nomesDe(idsDa(await filtrar([{ chave: id('ip'), operador: 'vazio' }])))).toEqual([
      'core',
      'semLocal',
    ]);
    expect(
      nomesDe(idsDa(await filtrar([{ chave: 'ativo.responsavel', operador: 'preenchido' }]))),
    ).toEqual(['almox']);
    expect(nomesDe(idsDa(await filtrar([{ chave: 'ativo.local', operador: 'vazio' }])))).toEqual([
      'semLocal',
    ]);
  });

  it('o filtro de situação substitui o padrão do parâmetro, e os inativos não ficam vazios', async () => {
    const situacao = (valor: 'inativos' | 'em-estoque' | 'todos') =>
      filtrar([{ chave: 'ativo.situacao', operador: 'situacao', situacao: valor }]).then((r) =>
        nomesDe(idsDa(r)),
      );
    expect(await situacao('inativos')).toEqual(['matricial']);
    expect(await situacao('em-estoque')).toEqual(['core']);
    expect(await situacao('todos')).toEqual(['almox', 'core', 'matricial', 'recepcao', 'semLocal']);
  });

  it('os filtros valem juntos', async () => {
    expect(
      nomesDe(
        idsDa(
          await filtrar([
            { chave: 'ativo.tipo', operador: 'qualquer', valores: [id('impressora')] },
            { chave: 'ativo.local', operador: 'em', local: id('jundiai') },
          ]),
        ),
      ),
    ).toEqual(['almox']);
  });

  it('o total conta com os filtros', async () => {
    const r = await filtrar([{ chave: id('areas'), operador: 'qualquer', valores: ['rh'] }]);
    expect(r.json().total).toBe(2);
  });

  it('o restrito filtra só os ativos em que a conta vê os restritos, também no vazio', async () => {
    // Bruno vê os restritos só em Jundiaí: o custo de Campinas não entra, nem como vazio.
    expect(
      nomesDe(idsDa(await filtrar([{ chave: id('custo'), operador: 'entre', de: 1000 }], 'bruno'))),
    ).toEqual(['almox']);
    expect(
      nomesDe(idsDa(await filtrar([{ chave: id('custo'), operador: 'vazio' }], 'bruno'))),
    ).toEqual(['core']);
    expect(
      nomesDe(idsDa(await filtrar([{ chave: id('custo'), operador: 'entre', de: 1000 }], 'ana'))),
    ).toEqual(['almox', 'recepcao']);
  });

  it('o filtro de uma coluna que a conta não tem fica de fora, sem nada do restrito', async () => {
    // Carla não vê os restritos: a coluna do custo não é dela, e o filtro não vale.
    const r = await filtrar([{ chave: id('custo'), operador: 'entre', de: 1000 }], 'carla');
    expect(r.statusCode).toBe(200);
    expect(nomesDe(idsDa(r))).toEqual(['almox', 'core', 'recepcao', 'semLocal']);
    const desconhecida = await filtrar([{ chave: 'tensao', operador: 'vazio' }]);
    expect(nomesDe(idsDa(desconhecida))).toEqual(['almox', 'core', 'recepcao', 'semLocal']);
  });

  it('recusa o filtro malformado com 400, com a mensagem em filtros', async () => {
    const operador = await filtrar([{ chave: 'ativo.tipo', operador: 'contem', texto: 'x' }]);
    expect(operador.statusCode).toBe(400);
    expect(operador.json().campos).toEqual({ filtros: 'Este filtro não vale para a coluna Tipo.' });
    const data = await filtrar([{ chave: 'ativo.garantia', operador: 'entre', de: '2026-02-31' }]);
    expect(data.json().campos).toEqual({ filtros: 'Use uma data válida.' });
    const json = await listar({ filtros: '[{' });
    expect(json.statusCode).toBe(400);
    expect(json.json().campos).toEqual({ filtros: 'Os filtros não são válidos.' });
    const fuso = await listar({ fuso: 'Marte/Olympus' });
    expect(fuso.statusCode).toBe(400);
    expect(fuso.json().campos).toEqual({ fuso: 'Fuso horário desconhecido.' });
  });
});

describe('GET /ativos com as colunas pedidas', () => {
  const pedir = (colunas: string[], usuario = 'ana', extras: Record<string, string> = {}) =>
    listar({ colunas: colunas.join(','), situacao: 'todos', ...extras }, usuario);
  const itemDe = (r: { json: () => { itens: Record<string, unknown>[] } }, nome: string) =>
    r.json().itens.find((item) => item.id === id(nome)) as Record<string, unknown> & {
      valores: Record<string, unknown>;
      permite: Record<string, boolean>;
    };

  it('cada item traz a série, o hostname, os momentos e os valores pedidos do JSONB', async () => {
    const r = await pedir([
      id('ip'),
      id('criticidade'),
      id('areas'),
      'ativo.garantia',
      'ativo.valor-de-compra',
      'ativo.patrimonio',
    ]);
    expect(r.statusCode).toBe(200);
    const almox = itemDe(r, 'almox');
    expect(almox).toMatchObject({
      serie: null,
      hostname: 'IMP-ALMOX-01',
      criadoEm: '2026-10-01T02:00:00.000Z',
    });
    expect(typeof almox.atualizadoEm).toBe('string');
    expect(almox.valores).toEqual({
      [id('ip')]: '10.0.0.9',
      [id('criticidade')]: 'alta',
      [id('areas')]: ['ti', 'rh'],
      'ativo.garantia': '2026-06-30',
      'ativo.valor-de-compra': 1500,
    });
    expect(itemDe(r, 'core').valores).toEqual({});
  });

  it('sem colunas pedidas, os valores vêm vazios', async () => {
    const r = await listar();
    expect(itemDe(r, 'almox').valores).toEqual({});
  });

  it('as referências pelo nome atual: as pessoas, os locais e os ativos dos valores', async () => {
    const r = await pedir([id('gestor'), id('sala'), id('vizinha')]);
    expect(itemDe(r, 'almox').valores).toEqual({
      [id('gestor')]: id('maria'),
      [id('sala')]: id('expedicao'),
      [id('vizinha')]: id('recepcao'),
    });
    expect(r.json().referencias).toEqual({
      pessoas: { [id('maria')]: 'Maria Souza' },
      locais: { [id('expedicao')]: 'Jundiaí › Expedição' },
      ativos: { [id('recepcao')]: 'Impressora da Recepção' },
      fornecedores: {},
      arquivos: {},
      modelos: {},
      tiposDosModelos: {},
    });
  });

  it('as referências dos filtros: as pessoas, os locais e os modelos escolhidos', async () => {
    const r = await pedir([], 'ana', {
      filtros: JSON.stringify([
        { chave: 'ativo.responsavel', operador: 'qualquer', valores: [id('joao')] },
        { chave: 'ativo.modelo', operador: 'qualquer', valores: [id('m404')] },
        { chave: 'ativo.local', operador: 'em', local: id('jundiai') },
      ]),
    });
    expect(r.json().referencias).toEqual({
      pessoas: { [id('joao')]: 'João da Silva' },
      locais: { [id('jundiai')]: 'Jundiaí' },
      ativos: {},
      fornecedores: {},
      arquivos: {},
      modelos: { [id('m404')]: 'HP LaserJet M404' },
      // O tipo de cada modelo escolhido, para a tela dizer o que é de outro tipo.
      tiposDosModelos: { [id('m404')]: id('impressora') },
    });
  });

  it('o restrito só onde a conta o vê, e o permite diz onde ela vê os restritos', async () => {
    const deBruno = await pedir([id('custo')], 'bruno');
    expect(itemDe(deBruno, 'almox').valores).toEqual({ [id('custo')]: 3000 });
    expect(itemDe(deBruno, 'almox').permite).toEqual({
      editar: false,
      verRestritos: true,
      verResponsavel: false,
    });
    expect(itemDe(deBruno, 'recepcao').valores).toEqual({});
    expect(itemDe(deBruno, 'recepcao').permite).toEqual({
      editar: false,
      verRestritos: false,
      verResponsavel: false,
    });
    const deCarla = await pedir([id('custo')], 'carla');
    expect(itemDe(deCarla, 'almox').valores).toEqual({});
    const deAna = await pedir([id('custo')]);
    expect(itemDe(deAna, 'recepcao').valores).toEqual({ [id('custo')]: 4000 });
    expect(itemDe(deAna, 'recepcao').permite).toEqual({
      editar: true,
      verRestritos: true,
      verResponsavel: false,
    });
  });

  it('recusa mais de 60 colunas', async () => {
    const r = await pedir(Array.from({ length: 61 }, (_, i) => `coluna-${i}`));
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ colunas: 'Use até 60 colunas.' });
  });
});

describe('GET /ativos na ordem de uma coluna', () => {
  const ordenar = (
    ordem: string,
    direcao: 'crescente' | 'decrescente' = 'crescente',
    usuario = 'ana',
    extras: Record<string, string> = {},
  ) => listar({ ordem, direcao, ...extras }, usuario).then((r) => nomesNaOrdem(idsDa(r)));

  /** Os nomes do mapa de ids, na ordem da resposta. */
  const nomesNaOrdem = (lista: string[]) =>
    lista.map((ativo) => Object.keys(ids).find((nome) => ids[nome] === ativo) ?? ativo);

  it('pelo nome do ativo, em ordem alfabética, sem diferenciar acento e maiúsculas', async () => {
    expect(await ordenar('ativo.rotulo')).toEqual(['almox', 'recepcao', 'semLocal', 'core']);
  });

  it('os vazios ficam no fim nas duas direções, e os iguais pelo cadastro, os mais novos primeiro', async () => {
    expect(await ordenar('ativo.hostname', 'decrescente')).toEqual([
      'core',
      'recepcao',
      'almox',
      'semLocal',
    ]);
    expect(await ordenar('ativo.hostname')).toEqual(['almox', 'recepcao', 'core', 'semLocal']);
    expect(await ordenar('ativo.tipo')).toEqual(['semLocal', 'recepcao', 'almox', 'core']);
  });

  it('o IP pelos números, e não pelo texto', async () => {
    expect(await ordenar(id('ip'))).toEqual(['almox', 'recepcao', 'semLocal', 'core']);
    expect(await ordenar(id('ip'), 'decrescente')).toEqual([
      'recepcao',
      'almox',
      'semLocal',
      'core',
    ]);
  });

  it('os números, as datas e as opções da lista na ordem do campo', async () => {
    expect(await ordenar('ativo.valor-de-compra', 'decrescente')).toEqual([
      'almox',
      'recepcao',
      'semLocal',
      'core',
    ]);
    expect(await ordenar('ativo.garantia')).toEqual(['almox', 'recepcao', 'semLocal', 'core']);
    expect(await ordenar(id('criticidade'), 'decrescente')).toEqual([
      'recepcao',
      'almox',
      'semLocal',
      'core',
    ]);
  });

  it('a pessoa pelo nome, o local pelo caminho e o modelo pelo fabricante', async () => {
    expect(await ordenar('ativo.responsavel')).toEqual(['almox', 'semLocal', 'core', 'recepcao']);
    expect(await ordenar(id('gestor'))).toEqual(['almox', 'semLocal', 'core', 'recepcao']);
    expect(await ordenar('ativo.local')).toEqual(['recepcao', 'core', 'almox', 'semLocal']);
    expect(await ordenar('ativo.modelo')).toEqual(['almox', 'semLocal', 'core', 'recepcao']);
  });

  it('a situação na ordem das situações de uso, com os inativos por último', async () => {
    expect(await ordenar('ativo.situacao', 'crescente', 'ana', { situacao: 'todos' })).toEqual([
      'semLocal',
      'recepcao',
      'almox',
      'core',
      'matricial',
    ]);
  });

  it('o cadastro pelo momento', async () => {
    expect(await ordenar('ativo.criado-em', 'decrescente')).toEqual([
      'semLocal',
      'core',
      'recepcao',
      'almox',
    ]);
  });

  it('o restrito oculto conta como vazio', async () => {
    // Bruno vê o custo só em Jundiaí: o de Campinas e o do ativo sem local ficam com os vazios.
    expect(await ordenar(id('custo'), 'decrescente', 'bruno')).toEqual([
      'almox',
      'semLocal',
      'core',
      'recepcao',
    ]);
  });

  it('a coluna que não ordena e a que a conta não tem ficam de fora, na ordem do cadastro', async () => {
    const doCadastro = ['semLocal', 'core', 'recepcao', 'almox'];
    expect(await ordenar(id('areas'))).toEqual(doCadastro);
    expect(await ordenar(id('custo'), 'crescente', 'carla')).toEqual(doCadastro);
  });

  /** Todas as páginas, uma de cada vez, seguindo o cursor. */
  async function todasAsPaginas(parametros: Record<string, string>) {
    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let pagina = 0; pagina < 20; pagina++) {
      const r = await listar({ ...parametros, ...(cursor ? { cursor } : {}) });
      expect(r.statusCode).toBe(200);
      vistos.push(...idsDa(r));
      cursor = r.json().proximo;
      if (!cursor) break;
    }
    return nomesNaOrdem(vistos);
  }

  it('o cursor no meio de valores iguais e entre os vazios não pula nem repete nada', async () => {
    expect(
      await todasAsPaginas({ ordem: 'ativo.tipo', direcao: 'crescente', limite: '1' }),
    ).toEqual(['semLocal', 'recepcao', 'almox', 'core']);
    expect(await todasAsPaginas({ ordem: id('ip'), direcao: 'crescente', limite: '1' })).toEqual([
      'almox',
      'recepcao',
      'semLocal',
      'core',
    ]);
    expect(await todasAsPaginas({ ordem: id('ip'), direcao: 'decrescente', limite: '2' })).toEqual([
      'recepcao',
      'almox',
      'semLocal',
      'core',
    ]);
    expect(
      await todasAsPaginas({ ordem: 'ativo.criado-em', direcao: 'decrescente', limite: '3' }),
    ).toEqual(['semLocal', 'core', 'recepcao', 'almox']);
  });

  it('recusa a direção desconhecida e o cursor de outra ordem', async () => {
    const direcao = await listar({ ordem: 'ativo.rotulo', direcao: 'subindo' });
    expect(direcao.statusCode).toBe(400);
    expect(direcao.json().campos).toEqual({ direcao: 'Escolha crescente ou decrescente.' });
    const semOrdem = await listar({ limite: '1' });
    const cursor = semOrdem.json().proximo as string;
    const trocada = await listar({ ordem: 'ativo.rotulo', cursor });
    expect(trocada.statusCode).toBe(400);
    expect(trocada.json().campos).toEqual({ cursor: 'A lista mudou. Recarregue a lista.' });
  });
});
