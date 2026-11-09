// Os consumíveis pela API (spec consumiveis, "Consumível", "Fornecedores do consumível",
// "Inativação e reativação do consumível" e "Quem vê e quem edita os consumíveis"; spec
// modulo-operacao, "Lista dos consumíveis"; auditoria, "Eventos dos consumíveis registrados"; change
// p4b-consumiveis, design, decisões 3 e 4): a lista com a busca, os filtros e o cursor, a ficha, o
// cadastro, a edição, a inativação e a reativação, com as recusas no campo, a auditoria e o evento.
import { eventos, fornecedores, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarModelo, criarTipo, desligarModulos } from '../../test/alertas.ts';
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
} from '../../test/integracao.ts';

const host = 'grafite.consumiveis.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas = {} as Record<'ana' | 'davi' | 'carla', Entrada>;
const ids = {} as Record<'hp' | 'locadora' | 'antiga' | 'impressora' | 'm404' | 'm428', string>;

/** Um fornecedor direto no banco. */
const fornecedor = (nome: string, situacao: 'ativo' | 'inativo' = 'ativo') =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(fornecedores)
      .values({ orgId: org, nome, nomeNormalizado: nome.toLowerCase(), situacao })
      .returning({ id: fornecedores.id });
    return linha?.id ?? '';
  });

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  // Ana edita os consumíveis; Davi só os vê; Carla não tem nenhuma das duas.
  const edita = await criarPerfil(api, org, {
    nome: 'Operação',
    permissoes: ['consumiveis.editar'],
  });
  const ve = await criarPerfil(api, org, { nome: 'Leitura', permissoes: ['consumiveis.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  const davi = await criarConta(api, org, { usuario: 'davi', nome: 'Davi Rocha' });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: edita, contaId: ana.id });
  await atribuir(api, org, { perfilId: ve, contaId: davi.id });
  for (const usuario of ['ana', 'davi', 'carla'] as const) {
    entradas[usuario] = await cliente.entrar(usuario);
  }

  ids.hp = await fornecedor('HP Brasil');
  ids.locadora = await fornecedor('Locadora Norte');
  ids.antiga = await fornecedor('Distribuidora Antiga', 'inativo');
  ids.impressora = await criarTipo(api, org, {
    nome: 'Impressora',
    capacidades: ['consumiveis.compatibilidade'],
  });
  ids.m404 = await criarModelo(api, org, { tipoId: ids.impressora, nome: 'LaserJet M404' });
  ids.m428 = await criarModelo(api, org, { tipoId: ids.impressora, nome: 'LaserJet M428' });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const cadastrar = (pedido: object, usuario: keyof typeof entradas = 'ana') =>
  cliente.enviar('POST', '/consumiveis', entradas[usuario], pedido);
const editar = (id: string, pedido: object, usuario: keyof typeof entradas = 'ana') =>
  cliente.enviar('PATCH', `/consumiveis/${id}`, entradas[usuario], pedido);
const acao = (id: string, caminho: 'inativacao' | 'reativacao') =>
  cliente.enviar('POST', `/consumiveis/${id}/${caminho}`, entradas.ana);
const listar = (consulta = '', usuario: keyof typeof entradas = 'ana') =>
  cliente.consultar(`/consumiveis${consulta}`, entradas[usuario]);
const ficha = (id: string, usuario: keyof typeof entradas = 'ana') =>
  cliente.consultar(`/consumiveis/${id}`, entradas[usuario]);

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ tipo: eventos.tipo, alvoTipo: eventos.alvoTipo, todas: eventos.todas })
      .from(eventos),
  );

const codigos = (resposta: { json: () => { itens: { codigo: string }[] } }) =>
  resposta.json().itens.map(({ codigo }) => codigo);

describe('consumíveis pela API', () => {
  it('cadastra com os fornecedores e os modelos, a auditoria pelos nomes e o evento', async () => {
    const r = await cadastrar({
      codigo: ' CF258A ',
      nome: '  HP   58A ',
      tipo: 'toner',
      cor: 'preto',
      rendimento: 3000,
      fornecedores: [ids.hp],
      modelos: [ids.m404],
    });
    expect(r.statusCode, r.body).toBe(201);
    const consumivel = r.json();
    expect(consumivel).toMatchObject({
      codigo: 'CF258A',
      nome: 'HP 58A',
      tipo: 'toner',
      cor: 'preto',
      rendimento: 3000,
      situacao: 'ativo',
      fornecedores: [{ id: ids.hp, nome: 'HP Brasil', situacao: 'ativo' }],
      modelos: [
        {
          id: ids.m404,
          fabricante: 'HP',
          nome: 'LaserJet M404',
          situacao: 'ativo',
          tipo: { id: ids.impressora, nome: 'Impressora' },
        },
      ],
      permite: { editar: true },
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'consumivel.criado',
        alvoTipo: 'consumivel',
        alvoId: consumivel.id,
        depois: {
          codigoDoFabricante: 'CF258A',
          nome: 'HP 58A',
          tipo: 'toner',
          cor: 'preto',
          rendimento: 3000,
          fornecedores: ['HP Brasil'],
          modelos: ['HP LaserJet M404'],
          situacao: 'ativo',
        },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'consumiveis.mudaram', alvoTipo: 'consumivel', todas: true },
    ]);
    expect((await ficha(consumivel.id)).json()).toMatchObject({ codigo: 'CF258A' });
  });

  it('Código com outra grafia: recusa com 409, no campo, no cadastro e na edição', async () => {
    await cadastrar({ codigo: 'TN-2370', nome: 'Brother TN-2370', tipo: 'toner' });
    const repetido = await cadastrar({ codigo: 'tn 2370', tipo: 'toner' });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().campos).toEqual({ codigo: 'Já existe um consumível com este código.' });
    const outro = (await cadastrar({ codigo: 'DR-2340', tipo: 'cilindro' })).json();
    const r = await editar(outro.id, { codigo: 'TN2370' });
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({ codigo: 'Já existe um consumível com este código.' });
  });

  it('recusa com 400, no campo, o que o domínio não aceita', async () => {
    const semTipo = await cadastrar({ codigo: 'X1' });
    expect(semTipo.statusCode).toBe(400);
    expect(semTipo.json().campos).toEqual({ tipo: 'Escolha o tipo do consumível.' });
    const r = await cadastrar({
      codigo: ' - ',
      tipo: 'toner',
      nome: 'N'.repeat(81),
      rendimento: 0,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      codigo: 'Informe o código do consumível.',
      nome: 'Use até 80 caracteres.',
      rendimento: 'Use um número inteiro de páginas, de 1 a 1.000.000.',
    });
    const cor = await cadastrar({ codigo: 'X2', tipo: 'toner', cor: 'branco' });
    expect(cor.json().campos).toEqual({ cor: 'Escolha uma cor da lista.' });
  });

  it('recusa o fornecedor e o modelo que não existem', async () => {
    const fantasma = '00000000-0000-7000-8000-000000000001';
    const semFornecedor = await cadastrar({
      codigo: 'X3',
      tipo: 'toner',
      fornecedores: [fantasma],
    });
    expect(semFornecedor.statusCode).toBe(400);
    expect(semFornecedor.json().campos).toEqual({ fornecedores: 'Fornecedor não encontrado.' });
    const semModelo = await cadastrar({ codigo: 'X4', tipo: 'toner', modelos: [fantasma] });
    expect(semModelo.statusCode).toBe(400);
    expect(semModelo.json().campos).toEqual({ modelos: 'Modelo não encontrado.' });
  });

  it('Fornecedor inativado: continua no consumível, mas não entra de novo', async () => {
    const toner = (
      await cadastrar({ codigo: 'CE505A', tipo: 'toner', fornecedores: [ids.locadora] })
    ).json();
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(fornecedores).set({ situacao: 'inativo' }).where(eq(fornecedores.id, ids.locadora)),
    );
    expect((await ficha(toner.id)).json().fornecedores).toEqual([
      { id: ids.locadora, nome: 'Locadora Norte', situacao: 'inativo' },
    ]);
    const mantido = await editar(toner.id, { nome: 'HP 05A', fornecedores: [ids.locadora] });
    expect(mantido.statusCode).toBe(200);
    const incluido = await editar(toner.id, { fornecedores: [ids.locadora, ids.antiga] });
    expect(incluido.statusCode).toBe(400);
    expect(incluido.json().campos).toEqual({
      fornecedores: 'O fornecedor escolhido está inativo. Escolha um fornecedor ativo.',
    });
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(fornecedores).set({ situacao: 'ativo' }).where(eq(fornecedores.id, ids.locadora)),
    );
  });

  it('Modelo incluído: a auditoria guarda os modelos antes e depois, pelo nome', async () => {
    const toner = (
      await cadastrar({ codigo: 'CF259A', tipo: 'toner', modelos: [ids.m404] })
    ).json();
    const r = await editar(toner.id, { modelos: [ids.m404, ids.m428] });
    expect(r.statusCode).toBe(200);
    expect(r.json().modelos.map(({ nome }: { nome: string }) => nome)).toEqual([
      'LaserJet M404',
      'LaserJet M428',
    ]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'consumivel.alterado',
        antes: { modelos: ['HP LaserJet M404'] },
        depois: { modelos: ['HP LaserJet M404', 'HP LaserJet M428'] },
      },
    ]);
    const deNovo = await editar(toner.id, { modelos: [ids.m428, ids.m404] });
    expect(deNovo.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, deNovo)).toEqual([]);
    const retirado = await editar(toner.id, { modelos: [ids.m428] });
    expect(retirado.json().modelos.map(({ id }: { id: string }) => id)).toEqual([ids.m428]);
  });

  it('Toner que saiu de linha: sai da lista dos ativos, aparece nos inativos e volta pela reativação', async () => {
    const toner = (await cadastrar({ codigo: 'Q2612A', tipo: 'toner' })).json();
    const inativado = await acao(toner.id, 'inativacao');
    expect(inativado.json().situacao).toBe('inativo');
    expect(await auditoriaDaRequisicao(api, org, inativado)).toMatchObject([
      {
        acao: 'consumivel.inativado',
        antes: { situacao: 'ativo' },
        depois: { situacao: 'inativo' },
      },
    ]);
    expect(codigos(await listar('?busca=q2612a'))).toEqual([]);
    expect(codigos(await listar('?busca=q2612a&situacao=inativos'))).toEqual(['Q2612A']);
    const repetida = await acao(toner.id, 'inativacao');
    expect(await auditoriaDaRequisicao(api, org, repetida)).toEqual([]);
    const reativado = await acao(toner.id, 'reativacao');
    expect(reativado.json().situacao).toBe('ativo');
    expect(await auditoriaDaRequisicao(api, org, reativado)).toMatchObject([
      { acao: 'consumivel.reativado' },
    ]);
    expect(codigos(await listar('?busca=q2612a'))).toEqual(['Q2612A']);
  });

  it('Busca pelo código sem o hífen: acha pelo código normalizado e pelo nome sem acento', async () => {
    await cadastrar({ codigo: 'TN-1060', nome: 'Toner Óptico', tipo: 'toner' });
    expect(codigos(await listar('?busca=tn1060'))).toEqual(['TN-1060']);
    expect(codigos(await listar('?busca=TN 10'))).toEqual(['TN-1060']);
    expect(codigos(await listar('?busca=optico'))).toEqual(['TN-1060']);
    expect(codigos(await listar('?busca=50%25'))).toEqual([]);
  });

  it('Filtro da cor: filtra pelo tipo, pela cor e conta os modelos de cada um', async () => {
    await cadastrar({
      codigo: 'CF411A',
      tipo: 'toner',
      cor: 'ciano',
      modelos: [ids.m404, ids.m428],
    });
    await cadastrar({ codigo: 'CF412A', tipo: 'toner', cor: 'amarelo' });
    await cadastrar({ codigo: 'CF232A', tipo: 'cilindro' });
    const ciano = await listar('?cor=ciano');
    expect(ciano.json().itens).toMatchObject([{ codigo: 'CF411A', modelos: 2 }]);
    expect(ciano.json().total).toBe(1);
    expect(codigos(await listar('?tipo=cilindro'))).toEqual(['CF232A', 'DR-2340']);
  });

  it('pagina pelo código, com o cursor e o total', async () => {
    const primeira = await listar('?busca=cf41&limite=1');
    expect(codigos(primeira)).toEqual(['CF411A']);
    expect(primeira.json().total).toBe(2);
    const segunda = await listar(`?busca=cf41&limite=1&cursor=${primeira.json().proximo}`);
    expect(codigos(segunda)).toEqual(['CF412A']);
    expect(segunda.json().proximo).toBeNull();
  });

  it('Edição sem a permissão: quem só vê lê a lista e a ficha, e a API recusa a mudança', async () => {
    const toner = (await cadastrar({ codigo: 'CB435A', tipo: 'toner' })).json();
    const lista = await listar('', 'davi');
    expect(lista.statusCode).toBe(200);
    expect(lista.json().permite).toEqual({ cadastrar: false });
    expect((await ficha(toner.id, 'davi')).json().permite).toEqual({ editar: false });
    expect((await cadastrar({ codigo: 'CB436A', tipo: 'toner' }, 'davi')).statusCode).toBe(403);
    expect((await editar(toner.id, { nome: 'HP 35A' }, 'davi')).statusCode).toBe(403);
    expect((await listar('', 'carla')).statusCode).toBe(403);
  });

  it('responde 404 ao consumível que não existe', async () => {
    const r = await ficha('00000000-0000-7000-8000-000000000002');
    expect(r.statusCode).toBe(404);
  });

  it('recusa as rotas com o Operação desligado', async () => {
    await desligarModulos(api, org, ['operacao']);
    const r = await listar();
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:modulo-desligado',
      detail: 'O módulo Operação está desligado nesta organização.',
    });
    await desligarModulos(api, org, []);
    expect((await listar()).statusCode).toBe(200);
  });
});
