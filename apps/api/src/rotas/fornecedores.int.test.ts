// Os fornecedores pela API (spec fornecedores, "Fornecedor", "Inativação e reativação do fornecedor"
// e "Quem vê e quem edita os fornecedores", e auditoria, "Eventos dos fornecedores registrados";
// change p4a-fornecedores, design, decisão 5): a lista com a busca, a situação e o cursor, a ficha, o
// cadastro, a edição, a inativação e a reativação, com as recusas no campo, a auditoria e o evento.
import { eventos, naOrganizacao } from '@grafite/db';
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
} from '../../test/integracao.ts';

const host = 'grafite.fornecedores.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas = {} as Record<'ana' | 'davi' | 'carla', Entrada>;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const edita = await criarPerfil(api, org, {
    nome: 'Compras',
    permissoes: ['fornecedores.editar'],
  });
  const ve = await criarPerfil(api, org, { nome: 'Leitura', permissoes: ['fornecedores.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  const davi = await criarConta(api, org, { usuario: 'davi', nome: 'Davi Rocha' });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: edita, contaId: ana.id });
  await atribuir(api, org, { perfilId: ve, contaId: davi.id });
  for (const usuario of ['ana', 'davi', 'carla'] as const) {
    entradas[usuario] = await cliente.entrar(usuario);
  }
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const cadastrar = (pedido: object, usuario: keyof typeof entradas = 'ana') =>
  cliente.enviar('POST', '/fornecedores', entradas[usuario], pedido);
const editar = (id: string, pedido: object, usuario: keyof typeof entradas = 'ana') =>
  cliente.enviar('PATCH', `/fornecedores/${id}`, entradas[usuario], pedido);
const acao = (id: string, caminho: 'inativacao' | 'reativacao') =>
  cliente.enviar('POST', `/fornecedores/${id}/${caminho}`, entradas.ana);
const listar = (consulta = '', usuario: keyof typeof entradas = 'ana') =>
  cliente.consultar(`/fornecedores${consulta}`, entradas[usuario]);

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ tipo: eventos.tipo, alvoTipo: eventos.alvoTipo, todas: eventos.todas })
      .from(eventos),
  );

describe('fornecedores pela API', () => {
  it('cadastra com o CNPJ lido e escrito com a pontuação, a auditoria e o evento', async () => {
    const r = await cadastrar({
      nome: '  HP   Brasil ',
      cnpj: '12345678000195',
      contato: 'Marcos',
      email: 'compras@hp.com.br',
      telefone: '(11) 4000-0000',
    });
    expect(r.statusCode).toBe(201);
    const fornecedor = r.json();
    expect(fornecedor).toMatchObject({
      nome: 'HP Brasil',
      cnpj: '12.345.678/0001-95',
      contato: 'Marcos',
      email: 'compras@hp.com.br',
      telefone: '(11) 4000-0000',
      observacoes: null,
      situacao: 'ativo',
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'fornecedor.criado',
        alvoTipo: 'fornecedor',
        alvoId: fornecedor.id,
        depois: { nome: 'HP Brasil', cnpj: '12.345.678/0001-95' },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'fornecedores.mudaram', alvoTipo: 'fornecedor', todas: true },
    ]);
  });

  it('Nome repetido e CNPJ repetido: recusa com 409, no campo', async () => {
    await cadastrar({ nome: 'Locadora Norte', cnpj: '11.444.777/0001-61' });
    const nome = await cadastrar({ nome: 'locadora  norte' });
    expect(nome.statusCode).toBe(409);
    expect(nome.json().campos).toEqual({ nome: 'Já existe um fornecedor com este nome.' });
    const cnpj = await cadastrar({ nome: 'Locadora do Norte', cnpj: '11444777000161' });
    expect(cnpj.statusCode).toBe(409);
    expect(cnpj.json().campos).toEqual({ cnpj: 'Já existe um fornecedor com este CNPJ.' });
  });

  it('CNPJ com o dígito errado e e-mail fora do formato: recusa com 400, no campo', async () => {
    const r = await cadastrar({ nome: 'Papelaria', cnpj: '12.345.678/0001-96', email: 'compras' });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      cnpj: 'CNPJ inválido: confira os 14 caracteres.',
      email: 'Use um e-mail, como compras@empresa.com.br.',
    });
  });

  it('CNPJ informado depois: a auditoria guarda o antes e o depois', async () => {
    const criado = (await cadastrar({ nome: 'Assistência Sul' })).json();
    const r = await editar(criado.id, { cnpj: '11.222.333/0001-81' });
    expect(r.statusCode).toBe(200);
    expect(r.json().cnpj).toBe('11.222.333/0001-81');
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'fornecedor.alterado',
        antes: { cnpj: null },
        depois: { cnpj: '11.222.333/0001-81' },
      },
    ]);
    const deNovo = await editar(criado.id, { cnpj: '11222333000181' });
    expect(await auditoriaDaRequisicao(api, org, deNovo)).toEqual([]);
  });

  it('Fornecedor inativado: sai da lista dos ativos, aparece nos inativos e volta pela reativação', async () => {
    const criado = (await cadastrar({ nome: 'Locadora Leste' })).json();
    const inativado = await acao(criado.id, 'inativacao');
    expect(inativado.json().situacao).toBe('inativo');
    expect(await auditoriaDaRequisicao(api, org, inativado)).toMatchObject([
      {
        acao: 'fornecedor.inativado',
        antes: { situacao: 'ativo' },
        depois: { situacao: 'inativo' },
      },
    ]);
    const ativos = (await listar('?busca=leste')).json();
    expect(ativos.itens).toEqual([]);
    const inativos = (await listar('?busca=leste&situacao=inativos')).json();
    expect(inativos.itens.map((f: { nome: string }) => f.nome)).toEqual(['Locadora Leste']);
    const reativado = await acao(criado.id, 'reativacao');
    expect(reativado.json().situacao).toBe('ativo');
    expect(await auditoriaDaRequisicao(api, org, reativado)).toMatchObject([
      { acao: 'fornecedor.reativado' },
    ]);
  });

  it('a lista busca pelo nome sem acento e pelo começo do CNPJ, com o cursor', async () => {
    await cadastrar({ nome: 'Óptica Central' });
    const pelaBusca = (await listar('?busca=optica')).json();
    expect(pelaBusca.itens.map((f: { nome: string }) => f.nome)).toEqual(['Óptica Central']);
    const peloCnpj = (await listar('?busca=12.345.678')).json();
    expect(peloCnpj.itens.map((f: { nome: string }) => f.nome)).toEqual(['HP Brasil']);
    const primeira = (await listar('?limite=2')).json();
    expect(primeira.itens).toHaveLength(2);
    expect(primeira.proximo).not.toBeNull();
    const segunda = (await listar(`?limite=2&cursor=${primeira.proximo}`)).json();
    expect(segunda.itens[0].nome > primeira.itens[1].nome).toBe(true);
    expect(primeira.permite).toEqual({ cadastrar: true });
  });

  it('quem só vê lê a lista e a ficha, sem cadastrar; quem não vê é recusado', async () => {
    const lista = await listar('', 'davi');
    expect(lista.statusCode).toBe(200);
    expect(lista.json().permite).toEqual({ cadastrar: false });
    const [primeiro] = lista.json().itens;
    const ficha = await cliente.consultar(`/fornecedores/${primeiro.id}`, entradas.davi);
    expect(ficha.statusCode).toBe(200);
    expect(ficha.json().permite).toEqual({ editar: false });
    // Edição sem a permissão: a API responde 403.
    expect((await editar(primeiro.id, { contato: 'Outro' }, 'davi')).statusCode).toBe(403);
    expect((await cadastrar({ nome: 'Nova' }, 'davi')).statusCode).toBe(403);
    expect((await listar('', 'carla')).statusCode).toBe(403);
  });

  it('diz que não acha o fornecedor que não existe', async () => {
    const r = await cliente.consultar(
      '/fornecedores/0199d3a0-0000-7000-8000-000000000999',
      entradas.ana,
    );
    expect(r.statusCode).toBe(404);
    expect(r.json().detail).toBe('Fornecedor não encontrado.');
  });
});
