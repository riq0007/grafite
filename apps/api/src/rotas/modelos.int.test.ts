// Os modelos de equipamento pela API (spec catalogo-de-ativos; design do P1a, decisões 5 a 8 e 10):
// a lista com filtros, busca e cursor, e as sugestões de fabricante, para qualquer sessão; o
// cadastro e a edição com `modelos.editar`, com o tipo ativo e fixo, a grafia do fabricante do
// modelo mais antigo e o modelo único no tipo; a imagem pelo caminho comum das imagens; e cada
// mudança na auditoria, com o evento.
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { imagemDeTeste } from '../../test/imagens.ts';
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

const host = 'grafite.modelos.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const tudo = await criarPerfil(api, org, {
    nome: 'Catálogo',
    permissoes: ['catalogo.administrar', 'modelos.editar'],
  });
  const modelos = await criarPerfil(api, org, { nome: 'Modelos', permissoes: ['modelos.editar'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: modelos, contaId: bruno.id });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);
  for (const [chave, nome, icone] of [
    ['impressora', 'Impressora', 'impressora'],
    ['monitor', 'Monitor', 'monitor'],
    ['camera', 'Câmera', 'camera'],
  ] as const) {
    const r = await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), { nome, icone });
    ids[chave] = r.json().id;
  }
  await cliente.enviar('POST', `/tipos-de-ativo/${ids.camera}/inativacao`, como('ana'));
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

function como(usuario: string) {
  return entradas[usuario] ?? SEM_ENTRADA;
}

const cadastrar = (pedido: object, usuario = 'bruno') =>
  cliente.enviar('POST', '/modelos', como(usuario), pedido);
const editar = (id: string, pedido: object) =>
  cliente.enviar('PATCH', `/modelos/${id}`, como('bruno'), pedido);
const acao = (id: string, caminho: string) =>
  cliente.enviar('POST', `/modelos/${id}/${caminho}`, como('bruno'));
const listar = (consulta = '', usuario = 'carla') =>
  cliente.consultar(`/modelos${consulta}`, como(usuario));

const png = () => imagemDeTeste(300, 200).png().toBuffer();
const enviarImagem = async (id: string) =>
  cliente.enviarBytes('PUT', `/modelos/${id}/imagem`, como('bruno'), await png());

/** Os arquivos no armazenamento da organização. */
async function gravados(): Promise<string[]> {
  const pasta = join(api.armazenamento.pasta, org);
  const entradasDaPasta = await readdir(pasta, { recursive: true, withFileTypes: true }).catch(
    () => [],
  );
  return entradasDaPasta
    .filter((entrada) => entrada.isFile())
    .map((entrada) => relative(pasta, join(entrada.parentPath, entrada.name)))
    .sort();
}

describe('cadastro', () => {
  it('cadastra o modelo no tipo, com a auditoria e o evento', async () => {
    const r = await cadastrar({
      tipoId: ids.impressora,
      fabricante: ' HP ',
      nome: ' LaserJet M404 ',
    });
    expect(r.statusCode).toBe(201);
    ids.m404 = r.json().id;
    expect(r.json()).toEqual({
      id: expect.any(String),
      tipo: { id: ids.impressora, nome: 'Impressora', icone: 'impressora' },
      fabricante: 'HP',
      nome: 'LaserJet M404',
      imagem: null,
      situacao: 'ativo',
      permite: { editar: true },
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'modelo.criado',
        alvoTipo: 'modelo',
        depois: { tipo: 'Impressora', fabricante: 'HP', nome: 'LaserJet M404', situacao: 'ativo' },
      },
    ]);
    const gravadosNaOrganizacao = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ tipo: eventos.tipo, todas: eventos.todas }).from(eventos),
    );
    expect(gravadosNaOrganizacao).toEqual([{ tipo: 'catalogo.mudou', todas: true }]);
  });

  it('usa a grafia do fabricante do modelo mais antigo, mesmo inativo', async () => {
    const hp = await cadastrar({ tipoId: ids.impressora, fabricante: 'hp', nome: 'LaserJet M428' });
    expect(hp.json().fabricante).toBe('HP');
    const epson = await cadastrar({ tipoId: ids.impressora, fabricante: 'Epson', nome: 'L3250' });
    await acao(epson.json().id, 'inativacao');
    const outra = await cadastrar({ tipoId: ids.impressora, fabricante: 'EPSON', nome: 'L4260' });
    expect(outra.json().fabricante).toBe('Epson');
  });

  it('recusa o modelo repetido no tipo, sem diferenciar acento e maiúsculas', async () => {
    const r = await cadastrar({ tipoId: ids.impressora, fabricante: 'hp', nome: 'laserjet m404' });
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({ nome: 'Já existe este modelo neste tipo.' });
    const noOutroTipo = await cadastrar({
      tipoId: ids.monitor,
      fabricante: 'HP',
      nome: 'LaserJet M404',
    });
    expect(noOutroTipo.statusCode).toBe(201);
  });

  it('recusa o tipo inativo e o tipo que não existe', async () => {
    const inativo = await cadastrar({
      tipoId: ids.camera,
      fabricante: 'Intelbras',
      nome: 'VIP 1230',
    });
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().campos).toEqual({ tipoId: 'O tipo Câmera está inativo.' });
    const estranho = await cadastrar({
      tipoId: '0199a3f0-0000-7000-8000-00000000abcd',
      fabricante: 'Intelbras',
      nome: 'VIP 1230',
    });
    expect(estranho.statusCode).toBe(400);
    expect(estranho.json().campos).toEqual({ tipoId: 'Tipo de ativo não encontrado.' });
  });

  it('sem modelos.editar, recusa com 403', async () => {
    const r = await cadastrar({ tipoId: ids.impressora, fabricante: 'HP', nome: 'X' }, 'carla');
    expect(r.statusCode).toBe(403);
  });
});

describe('edição e situação', () => {
  it('edita o fabricante e o nome sem mudar o tipo, com o antes → depois', async () => {
    const criado = await cadastrar({ tipoId: ids.monitor, fabricante: 'Dell', nome: 'P2422H' });
    const r = await editar(criado.json().id, { nome: 'P2422HE', tipoId: ids.impressora });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ nome: 'P2422HE', tipo: { id: ids.monitor } });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'modelo.alterado', antes: { nome: 'P2422H' }, depois: { nome: 'P2422HE' } },
    ]);
  });

  it('inativa e reativa, e repetir não grava nada', async () => {
    const criado = await cadastrar({ tipoId: ids.monitor, fabricante: 'LG', nome: '24MK430H' });
    const inativado = await acao(criado.json().id, 'inativacao');
    expect(inativado.json().situacao).toBe('inativo');
    expect(await auditoriaDaRequisicao(api, org, inativado)).toMatchObject([
      { acao: 'modelo.inativado' },
    ]);
    expect(
      await auditoriaDaRequisicao(api, org, await acao(criado.json().id, 'inativacao')),
    ).toEqual([]);
    expect((await acao(criado.json().id, 'reativacao')).json().situacao).toBe('ativo');
  });
});

describe('leitura', () => {
  it('lista pelo fabricante e pelo nome, com o filtro, a busca e o cursor', async () => {
    const todos = await listar(`?tipo=${ids.impressora}&limite=100`);
    expect(todos.statusCode).toBe(200);
    expect(todos.json().permite).toEqual({ cadastrar: false });
    const nomes = todos
      .json()
      .itens.map((m: { fabricante: string; nome: string }) => `${m.fabricante} ${m.nome}`);
    expect(nomes).toEqual(['Epson L4260', 'HP LaserJet M404', 'HP LaserJet M428']);
    expect(todos.json().itens[0].permite).toEqual({ editar: false });

    const primeira = await listar(`?tipo=${ids.impressora}&limite=2`);
    expect(primeira.json().total).toBe(3);
    const segunda = await listar(
      `?tipo=${ids.impressora}&limite=2&cursor=${primeira.json().proximo}`,
    );
    expect(segunda.json().itens.map((m: { nome: string }) => m.nome)).toEqual(['LaserJet M428']);
    expect(segunda.json().proximo).toBeNull();

    const busca = await listar('?busca=m404');
    expect(busca.json().itens.map((m: { nome: string }) => m.nome)).toEqual([
      'LaserJet M404',
      'LaserJet M404',
    ]);
    const inativos = await listar('?situacao=inativos');
    expect(inativos.json().itens.map((m: { nome: string }) => m.nome)).toEqual(['L3250']);
  });

  it('com os tipos, só os modelos deles, para o filtro de Modelo seguir o de Tipo', async () => {
    const r = await listar(`?tipos=${ids.impressora},${ids.monitor}&limite=100`);
    expect(r.statusCode).toBe(200);
    const itens = r.json().itens as { tipo: { id: string } }[];
    expect([...new Set(itens.map((modelo) => modelo.tipo.id))].sort()).toEqual(
      [ids.impressora, ids.monitor].sort(),
    );
    const soImpressoras = await listar(`?tipos=${ids.impressora}&limite=100`);
    expect(soImpressoras.json().total).toBe(3);
    const recusa = await listar('?tipos=nao-e-um-id');
    expect(recusa.statusCode).toBe(400);
    expect(recusa.json().campos).toEqual({ tipos: 'Tipo de ativo não encontrado.' });
  });

  it('sugere os fabricantes já usados, pela grafia que vale', async () => {
    const r = await listar('/fabricantes');
    expect(r.statusCode).toBe(200);
    expect(r.json().fabricantes).toEqual(['Dell', 'Epson', 'HP', 'LG']);
    expect((await listar('/fabricantes?busca=e')).json().fabricantes).toEqual(['Dell', 'Epson']);
  });

  it('com o tipo, traz primeiro os fabricantes já usados nele, e diz quais são', async () => {
    const r = await listar(`/fabricantes?tipo=${ids.impressora}`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      fabricantes: ['Epson', 'HP', 'Dell', 'LG'],
      doTipo: ['Epson', 'HP'],
    });
    expect((await listar('/fabricantes')).json().doTipo).toEqual([]);
  });

  it('abre o modelo pelo id, e o que não existe responde 404', async () => {
    const r = await listar(`/${ids.m404}`);
    expect(r.json()).toMatchObject({ nome: 'LaserJet M404', fabricante: 'HP' });
    const estranho = await listar('/0199a3f0-0000-7000-8000-00000000abcd');
    expect(estranho.statusCode).toBe(404);
    expect(estranho.json().detail).toBe('Modelo não encontrado.');
  });
});

describe('imagem do modelo', () => {
  it('troca a imagem, que qualquer sessão vê, e a antiga deixa de ser entregue', async () => {
    const primeira = await enviarImagem(ids.m404 ?? '');
    expect(primeira.statusCode).toBe(200);
    const imagem = primeira.json().imagem.id;
    expect(await auditoriaDaRequisicao(api, org, primeira)).toMatchObject([
      { acao: 'imagem-do-modelo.trocada', alvoId: ids.m404, dados: { arquivoId: imagem } },
    ]);
    const entregue = await listar(`/${ids.m404}/imagem/${imagem}/128`);
    expect(entregue.statusCode).toBe(200);
    expect(entregue.headers['content-type']).toBe('image/webp');

    const segunda = await enviarImagem(ids.m404 ?? '');
    expect(segunda.json().imagem.id).not.toBe(imagem);
    expect((await listar(`/${ids.m404}/imagem/${imagem}/128`)).statusCode).toBe(404);
  });

  it('remove a imagem, com a auditoria, e o endereço passa a responder 404', async () => {
    const atual = (await listar(`/${ids.m404}`)).json().imagem.id;
    const r = await cliente.enviar('DELETE', `/modelos/${ids.m404}/imagem`, como('bruno'));
    expect(r.statusCode).toBe(200);
    expect(r.json().imagem).toBeNull();
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'imagem-do-modelo.removida', dados: { arquivoId: atual } },
    ]);
    expect((await listar(`/${ids.m404}/imagem/${atual}/64`)).statusCode).toBe(404);
  });

  it('a transação que falha apaga do armazenamento o que já foi gravado', async () => {
    const anterior = (await enviarImagem(ids.m404 ?? '')).json().imagem.id;
    const antes = await gravados();
    await api.dono.query(
      "create function public.falhar_no_teste() returns trigger language plpgsql as $$ begin raise exception 'falha do teste'; end $$",
    );
    await api.dono.query(
      'create trigger falhar_no_teste before insert on public.arquivos for each row execute function public.falhar_no_teste()',
    );
    try {
      expect((await enviarImagem(ids.m404 ?? '')).statusCode).toBe(500);
    } finally {
      await api.dono.query('drop trigger falhar_no_teste on public.arquivos');
      await api.dono.query('drop function public.falhar_no_teste()');
    }
    expect(await gravados()).toEqual(antes);
    expect((await listar(`/${ids.m404}`)).json().imagem.id).toBe(anterior);
  });

  it('sem modelos.editar, não troca a imagem', async () => {
    const r = await cliente.enviarBytes(
      'PUT',
      `/modelos/${ids.m404}/imagem`,
      como('carla'),
      await png(),
    );
    expect(r.statusCode).toBe(403);
  });
});
