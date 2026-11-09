// O fornecedor no ativo (spec cadastro-de-ativos, "Referências do ativo" e "Ordenação e filtros dos
// ativos", e importacao-de-ativos, "Valores da planilha"; change p4a-fornecedores, design, decisão
// 3): a gravação com o fornecedor ativo, a recusa do inativo e do que não existe, o nome atual na
// ficha e na tabela, com "(inativo)", a ordenação pelo nome, o filtro "é qualquer de" e a leitura da
// planilha pelo CNPJ e pelo nome.
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
} from '../../test/integracao.ts';

const host = 'grafite.fornecedor-do-ativo.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
let ana: Entrada;
const ids: Record<string, string> = {};

const CAMPO = 'valores.ativo.fornecedor';

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['catalogo.administrar', 'ativos.editar', 'fornecedores.editar'],
  });
  const conta = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: conta.id });
  ana = await cliente.entrar('ana');

  const fornecedor = async (pedido: object) =>
    (await cliente.enviar('POST', '/fornecedores', ana, pedido)).json().id as string;
  ids.hp = await fornecedor({ nome: 'HP Brasil', cnpj: '12.345.678/0001-95' });
  ids.locadora = await fornecedor({ nome: 'Locadora Norte' });
  ids.antiga = await fornecedor({ nome: 'Locadora Antiga' });
  await cliente.enviar('POST', `/fornecedores/${ids.antiga}/inativacao`, ana);
  const tipo = await cliente.enviar('POST', '/tipos-de-ativo', ana, {
    nome: 'Impressora',
    icone: 'impressora',
    capacidades: [],
    campos: [],
  });
  ids.impressora = tipo.json().id;
});

afterAll(async () => {
  await api?.fechar();
});

const cadastrar = (valores: Record<string, unknown>) =>
  cliente.enviar('POST', '/ativos', ana, { tipoId: ids.impressora, valores });

const ficha = async (id: string) => (await cliente.consultar(`/ativos/${id}`, ana)).json();

const listar = (parametros: Record<string, string>) =>
  cliente.consultar(`/ativos?${new URLSearchParams(parametros).toString()}`, ana);

describe('o fornecedor no ativo', () => {
  it('grava o fornecedor ativo e mostra o nome dele na ficha', async () => {
    const r = await cadastrar({ 'ativo.patrimonio': 'PAT-00412', 'ativo.fornecedor': ids.hp });
    expect(r.statusCode).toBe(201);
    ids.daHp = r.json().id;
    const lida = await ficha(ids.daHp ?? '');
    expect(lida.valores['ativo.fornecedor']).toBe(ids.hp);
    expect(lida.referencias.fornecedores).toEqual({ [ids.hp ?? '']: 'HP Brasil' });
  });

  it('recusa o fornecedor inativo e o que não existe, no campo', async () => {
    const inativo = await cadastrar({ 'ativo.fornecedor': ids.antiga });
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().campos).toEqual({
      [CAMPO]: 'O fornecedor escolhido está inativo. Escolha um fornecedor ativo.',
    });
    const outro = await cadastrar({
      'ativo.fornecedor': '0199d3a0-0000-7000-8000-000000000999',
    });
    expect(outro.statusCode).toBe(400);
    expect(outro.json().campos).toEqual({ [CAMPO]: 'Fornecedor não encontrado.' });
  });

  it('Fornecedor renomeado e inativado: a ficha mostra o nome atual, com "(inativo)"', async () => {
    const r = await cadastrar({
      'ativo.patrimonio': 'PAT-00500',
      'ativo.fornecedor': ids.locadora,
    });
    const id = r.json().id as string;
    await cliente.enviar('PATCH', `/fornecedores/${ids.locadora}`, ana, {
      nome: 'Locadora Norte Ltda',
    });
    expect((await ficha(id)).referencias.fornecedores).toEqual({
      [ids.locadora ?? '']: 'Locadora Norte Ltda',
    });
    await cliente.enviar('POST', `/fornecedores/${ids.locadora}/inativacao`, ana);
    const inativado = await ficha(id);
    expect(inativado.valores['ativo.fornecedor']).toBe(ids.locadora);
    expect(inativado.referencias.fornecedores).toEqual({
      [ids.locadora ?? '']: 'Locadora Norte Ltda (inativo)',
    });
    await cliente.enviar('POST', `/fornecedores/${ids.locadora}/reativacao`, ana);
  });

  it('a tabela ordena pelo nome do fornecedor e filtra por "é qualquer de"', async () => {
    const ordem = await listar({
      colunas: 'ativo.fornecedor',
      ordem: 'ativo.fornecedor',
      direcao: 'crescente',
    });
    expect(ordem.statusCode).toBe(200);
    const fornecedoresNaOrdem = ordem
      .json()
      .itens.map((item: { valores: Record<string, unknown> }) => item.valores['ativo.fornecedor'])
      .filter(Boolean);
    expect(fornecedoresNaOrdem).toEqual([ids.hp, ids.locadora]);
    expect(ordem.json().referencias.fornecedores).toEqual({
      [ids.hp ?? '']: 'HP Brasil',
      [ids.locadora ?? '']: 'Locadora Norte Ltda',
    });
    const filtrada = await listar({
      colunas: 'ativo.fornecedor',
      filtros: JSON.stringify([
        { chave: 'ativo.fornecedor', operador: 'qualquer', valores: [ids.hp] },
      ]),
    });
    expect(filtrada.json().itens.map((item: { id: string }) => item.id)).toEqual([ids.daHp]);
    // A origem e o filtro dizem o nome do fornecedor escolhido mesmo sem ativo dele na página.
    const semAtivos = await listar({
      colunas: 'ativo.fornecedor',
      filtros: JSON.stringify([
        { chave: 'ativo.fornecedor', operador: 'qualquer', valores: [ids.antiga] },
      ]),
    });
    expect(semAtivos.json().itens).toEqual([]);
    expect(semAtivos.json().referencias.fornecedores).toEqual({
      [ids.antiga ?? '']: 'Locadora Antiga (inativo)',
    });
  });

  it('a importação lê o fornecedor pelo CNPJ e pelo nome, e recusa o que não existe', async () => {
    const planilha = Buffer.from(
      [
        'Patrimônio;Fornecedor',
        'PAT-00412;12345678000195',
        'PAT-00700;locadora norte ltda',
        'PAT-00701;HP Brazil',
      ].join('\r\n'),
    );
    const enviada = await cliente.enviarBytes(
      'POST',
      `/ativos/importacoes?tipoId=${ids.impressora}&nome=${encodeURIComponent('impressoras.csv')}`,
      ana,
      planilha,
    );
    expect(enviada.statusCode).toBe(201);
    const previa = (
      await cliente.consultar(`/ativos/importacoes/${enviada.json().id}/previa`, ana)
    ).json();
    expect(previa.linhas).toEqual([
      // Fornecedor pelo CNPJ: o mesmo valor guardado não muda nada.
      expect.objectContaining({ linha: 2, acao: 'sem-mudanca', erros: [] }),
      expect.objectContaining({
        linha: 3,
        acao: 'novo',
        mudancas: expect.arrayContaining([
          expect.objectContaining({ campo: 'Fornecedor', depois: 'Locadora Norte Ltda' }),
        ]),
        erros: [],
      }),
      // Fornecedor que não existe: a célula é recusada com o texto dela.
      expect.objectContaining({
        linha: 4,
        acao: 'com-erro',
        erros: [{ campo: 'Fornecedor', mensagem: 'Fornecedor não encontrado: HP Brazil.' }],
      }),
    ]);
  });
});
