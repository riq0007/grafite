// Os campos da organização pela API (spec catalogo-de-ativos e campos-personalizados; design do
// P1a, decisões 2, 3, 8 e 10): a leitura por qualquer sessão, com quantos tipos ativos usam cada
// campo; o cadastro e a edição com `catalogo.administrar`, com a configuração conferida pelo
// domínio, as opções que só se inativam e o tipo de campo fixo; e a inativação, que mantém as
// ligações com os tipos.
import { camposDoTipo, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
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

const host = 'grafite.campos.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const catalogo = await criarPerfil(api, org, {
    nome: 'Catálogo',
    permissoes: ['catalogo.administrar'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: catalogo, contaId: ana.id });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  for (const usuario of ['ana', 'carla']) entradas[usuario] = await cliente.entrar(usuario);
});

afterAll(async () => {
  await api?.fechar();
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const cadastrar = (pedido: object, usuario = 'ana') =>
  cliente.enviar('POST', '/campos', como(usuario), pedido);
const editar = (id: string, pedido: object) =>
  cliente.enviar('PATCH', `/campos/${id}`, como('ana'), pedido);
const acao = (id: string, caminho: string) =>
  cliente.enviar('POST', `/campos/${id}/${caminho}`, como('ana'));

interface CampoDaLista {
  id: string;
  rotulo: string;
  usadoPor: number;
  situacao: string;
}

async function listar(usuario = 'ana') {
  const r = await cliente.consultar('/campos', como(usuario));
  expect(r.statusCode).toBe(200);
  return r.json() as { campos: CampoDaLista[]; permite: { cadastrar: boolean } };
}

let rotulos = 0;
async function campoNovo(pedido: object = {}) {
  rotulos += 1;
  const r = await cadastrar({ rotulo: `Campo ${rotulos}`, tipo: 'texto', ...pedido });
  expect(r.statusCode).toBe(201);
  return r.json();
}

describe('cadastro', () => {
  it('cadastra o campo com os padrões, a auditoria e o evento', async () => {
    const r = await cadastrar({ rotulo: ' IP ', tipo: 'ip', grupo: ' Rede ' });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({
      id: expect.any(String),
      rotulo: 'IP',
      tipo: 'ip',
      grupo: 'Rede',
      configuracao: {},
      restrito: false,
      escrita: 'automatica',
      situacao: 'ativo',
      usadoPor: 0,
      permite: { editar: true },
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'campo.criado',
        alvoTipo: 'campo',
        alvoId: r.json().id,
        depois: { rotulo: 'IP', tipo: 'ip', grupo: 'Rede', situacao: 'ativo' },
      },
    ]);
  });

  it('dá um id a cada opção da lista e não aceita os ids que o pedido inventa', async () => {
    const r = await cadastrar({
      rotulo: 'Criticidade',
      tipo: 'lista',
      escrita: 'manual',
      restrito: true,
      configuracao: {
        opcoes: [{ rotulo: 'Alta' }, { id: 'inventado', rotulo: 'Baixa' }],
      },
    });
    expect(r.statusCode).toBe(201);
    const { opcoes } = r.json().configuracao;
    expect(opcoes.map((o: { rotulo: string }) => o.rotulo)).toEqual(['Alta', 'Baixa']);
    expect(opcoes.map((o: { situacao: string }) => o.situacao)).toEqual(['ativa', 'ativa']);
    for (const opcao of opcoes) expect(opcao.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.json()).toMatchObject({ escrita: 'manual', restrito: true });
  });

  it('recusa o rótulo repetido sem diferenciar acento, e o rótulo vazio', async () => {
    await campoNovo({
      rotulo: 'Tensão',
      tipo: 'lista',
      configuracao: { opcoes: [{ rotulo: '110' }] },
    });
    const repetido = await cadastrar({ rotulo: 'tensao', tipo: 'texto' });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().campos).toEqual({ rotulo: 'Já existe um campo com este rótulo.' });
    const vazio = await cadastrar({ rotulo: ' ', tipo: 'texto' });
    expect(vazio.json().campos).toEqual({ rotulo: 'Informe o rótulo do campo.' });
    const tipo = await cadastrar({ rotulo: 'Planilha', tipo: 'planilha' });
    expect(tipo.json().campos).toEqual({ tipo: 'Escolha o tipo do campo.' });
  });

  it('recusa o rótulo de um campo comum a todo ativo e o de um campo de capacidade', async () => {
    const comum = await cadastrar({ rotulo: 'patrimonio', tipo: 'texto' });
    expect(comum.statusCode).toBe(400);
    expect(comum.json().campos).toEqual({
      rotulo: 'Este rótulo é de um campo que todo ativo já tem.',
    });
    const daCapacidade = await cadastrar({ rotulo: 'Processador', tipo: 'texto' });
    expect(daCapacidade.json().campos).toEqual({
      rotulo: 'Este rótulo é de um campo da capacidade Inventário de hardware.',
    });
    const existente = await campoNovo({ rotulo: 'Rack de origem', tipo: 'texto' });
    const renomeado = await cliente.enviar('PATCH', `/campos/${existente.id}`, como('ana'), {
      rotulo: 'Fornecedor',
    });
    expect(renomeado.statusCode).toBe(400);
    expect(renomeado.json().campos).toEqual({
      rotulo: 'Este rótulo é de um campo que todo ativo já tem.',
    });
  });

  it('recusa a configuração fora das regras, com o motivo em cada parte', async () => {
    const limites = await cadastrar({
      rotulo: 'Portas',
      tipo: 'inteiro',
      configuracao: { minimo: 10, maximo: 5 },
    });
    expect(limites.statusCode).toBe(400);
    expect(limites.json().campos).toEqual({
      'configuracao.minimo': 'O mínimo não pode passar do máximo.',
    });
    const semOpcoes = await cadastrar({ rotulo: 'Cor', tipo: 'lista', configuracao: {} });
    expect(semOpcoes.json().campos).toEqual({
      'configuracao.opcoes': 'Inclua pelo menos uma opção.',
    });
    const naoServe = await cadastrar({
      rotulo: 'Observação',
      tipo: 'texto',
      configuracao: { casas: 2 },
    });
    expect(naoServe.json().campos).toEqual({
      configuracao: 'Esta configuração não serve para o tipo do campo.',
    });
  });

  it('sem catalogo.administrar, recusa com 403', async () => {
    const r = await cadastrar({ rotulo: 'Patrimônio antigo', tipo: 'texto' }, 'carla');
    expect(r.statusCode).toBe(403);
  });
});

describe('edição', () => {
  it('muda o rótulo, o grupo e a configuração, sem mudar o tipo de campo', async () => {
    const campo = await campoNovo({ tipo: 'inteiro', configuracao: { minimo: 1 } });
    const r = await editar(campo.id, {
      rotulo: 'Portas do switch',
      grupo: 'Rede',
      tipo: 'texto',
      configuracao: { minimo: 1, maximo: 52 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      rotulo: 'Portas do switch',
      tipo: 'inteiro',
      grupo: 'Rede',
      configuracao: { minimo: 1, maximo: 52 },
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'campo.alterado',
        antes: { configuracao: { minimo: 1 } },
        depois: { configuracao: { minimo: 1, maximo: 52 } },
      },
    ]);
  });

  it('renomeia e inativa uma opção sem trocar o id, e recusa a opção excluída', async () => {
    const campo = await campoNovo({
      tipo: 'lista',
      configuracao: { opcoes: [{ rotulo: 'Proprio' }, { rotulo: 'Comodato' }] },
    });
    const [proprio, comodato] = campo.configuracao.opcoes;
    const renomeada = await editar(campo.id, {
      configuracao: {
        opcoes: [
          { id: proprio.id, rotulo: 'Próprio' },
          { id: comodato.id, rotulo: 'Comodato', situacao: 'inativa' },
          { rotulo: 'Alugado' },
        ],
      },
    });
    expect(renomeada.statusCode).toBe(200);
    expect(renomeada.json().configuracao.opcoes).toEqual([
      { id: proprio.id, rotulo: 'Próprio', situacao: 'ativa' },
      { id: comodato.id, rotulo: 'Comodato', situacao: 'inativa' },
      { id: expect.any(String), rotulo: 'Alugado', situacao: 'ativa' },
    ]);
    const excluida = await editar(campo.id, {
      configuracao: { opcoes: [{ id: proprio.id, rotulo: 'Próprio' }] },
    });
    expect(excluida.statusCode).toBe(409);
    expect(excluida.json().campos).toEqual({
      'configuracao.opcoes': 'As opções não são excluídas: inative a opção.',
    });
  });

  it('sem mudança, não grava nada', async () => {
    const campo = await campoNovo({ grupo: 'Uso' });
    const r = await editar(campo.id, { grupo: 'Uso' });
    expect(r.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
  });
});

describe('campo de ativo', () => {
  const tipoNovo = async (nome: string, situacao: 'ativo' | 'inativo' = 'ativo') => {
    const r = await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), {
      nome,
      icone: 'generico',
    });
    expect(r.statusCode).toBe(201);
    const id = r.json().id as string;
    if (situacao === 'inativo') {
      await cliente.enviar('POST', `/tipos-de-ativo/${id}/inativacao`, como('ana'));
    }
    return id;
  };

  it('guarda os tipos aceitos e o lado de lá, e recusa o tipo que não existe e o inativo', async () => {
    const computador = await tipoNovo('Computador');
    const notebook = await tipoNovo('Notebook');
    const nobreak = await tipoNovo('Nobreak', 'inativo');
    const r = await cadastrar({
      rotulo: 'Computador',
      tipo: 'ativo',
      configuracao: { tipos: [computador, notebook], ladoDeLa: ' Monitores ' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().configuracao).toEqual({ tipos: [computador, notebook], ladoDeLa: 'Monitores' });

    const inativo = await cadastrar({
      rotulo: 'Nobreak',
      tipo: 'ativo',
      configuracao: { tipos: [computador, nobreak] },
    });
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().campos).toEqual({
      'configuracao.tipos': 'O tipo Nobreak está inativo.',
    });
    const inexistente = await cadastrar({
      rotulo: 'Nobreak',
      tipo: 'ativo',
      configuracao: { tipos: ['0199a6e0-0000-7000-8000-000000000999'] },
    });
    expect(inexistente.statusCode).toBe(400);
    expect(inexistente.json().campos).toEqual({
      'configuracao.tipos': 'Tipo de ativo não encontrado.',
    });
  });

  it('o tipo aceito inativado depois fica, e só o que entra na configuração precisa estar ativo', async () => {
    const switchDeRede = await tipoNovo('Switch');
    const roteador = await tipoNovo('Roteador');
    const campo = await campoNovo({ tipo: 'ativo', configuracao: { tipos: [switchDeRede] } });
    await cliente.enviar('POST', `/tipos-de-ativo/${switchDeRede}/inativacao`, como('ana'));
    const r = await editar(campo.id, {
      configuracao: { tipos: [switchDeRede, roteador], ladoDeLa: 'Portas' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().configuracao).toEqual({ tipos: [switchDeRede, roteador], ladoDeLa: 'Portas' });
  });
});

describe('inativação, reativação e uso pelos tipos', () => {
  it('conta os tipos ativos que usam o campo, e a inativação mantém as ligações', async () => {
    const campo = await campoNovo();
    const tipos: string[] = [];
    for (const [nome, icone] of [
      ['Impressora', 'impressora'],
      ['Switch', 'switch'],
      ['Câmera', 'camera'],
    ] as const) {
      const r = await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), {
        nome: `${nome} ${campo.id.slice(-4)}`,
        icone,
        campos: [{ campoId: campo.id, obrigatorio: false }],
      });
      tipos.push(r.json().id);
    }
    const usado = (await listar('carla')).campos.find((c) => c.id === campo.id);
    expect(usado?.usadoPor).toBe(3);

    await cliente.enviar('POST', `/tipos-de-ativo/${tipos[2]}/inativacao`, como('ana'));
    expect((await listar()).campos.find((c) => c.id === campo.id)?.usadoPor).toBe(2);

    const inativado = await acao(campo.id, 'inativacao');
    expect(inativado.statusCode).toBe(200);
    expect(inativado.json().situacao).toBe('inativo');
    expect(await auditoriaDaRequisicao(api, org, inativado)).toMatchObject([
      { acao: 'campo.inativado' },
    ]);
    const ligacoes = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(camposDoTipo).where(eq(camposDoTipo.campoId, campo.id)),
    );
    expect(ligacoes).toHaveLength(3);
    expect((await acao(campo.id, 'reativacao')).json().situacao).toBe('ativo');
  });

  it('recusa inativar o campo que é o IP da disponibilidade de algum tipo', async () => {
    const campo = await campoNovo({ tipo: 'ip' });
    for (const nome of ['Impressora do ping', 'Switch do ping']) {
      const r = await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), {
        nome,
        icone: 'impressora',
        capacidades: ['rede.disponibilidade'],
        campos: [{ campoId: campo.id }],
        configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: campo.id } },
      });
      expect(r.statusCode).toBe(201);
    }
    const recusada = await acao(campo.id, 'inativacao');
    expect(recusada.statusCode).toBe(409);
    expect(recusada.json().detail).toBe(
      `O campo ${campo.rotulo} é o IP da disponibilidade em 2 tipos: escolha outro campo neles antes de inativá-lo.`,
    );
    expect((await listar()).campos.find((c) => c.id === campo.id)?.situacao).toBe('ativo');
  });

  it('qualquer sessão lê os campos, sem poder mudá-los', async () => {
    const lista = await listar('carla');
    expect(lista.permite).toEqual({ cadastrar: false });
    expect(lista.campos.length).toBeGreaterThan(0);
  });
});
