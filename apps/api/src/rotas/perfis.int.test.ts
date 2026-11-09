// Os perfis pela API (spec perfis-e-grupos): a lista e a ficha com quem tem cada perfil, o cadastro
// e a edição com as permissões do catálogo, o Administrador protegido, a inativação que respeita o
// último administrador, e quem só vê os acessos sem alterar nada.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarGrupo,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.perfis.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const ids: Record<string, string> = {};
const entradas: Record<string, Entrada> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });

  ids.administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  ids.tecnico = await criarPerfil(api, org, {
    nome: 'Técnico',
    permissoes: ['pessoas.ver', 'locais.editar'],
  });
  const consulta = await criarPerfil(api, org, {
    nome: 'Consulta de acessos',
    permissoes: ['acessos.ver'],
  });

  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: ids.administrador, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  ids.contaDoBruno = bruno.id;
  ids.atribuicaoDoBruno = await atribuir(api, org, {
    perfilId: ids.tecnico,
    contaId: bruno.id,
    localId: ids.jundiai,
  });
  ids.suporte = await criarGrupo(api, org, { nome: 'Suporte' });
  ids.atribuicaoDoSuporte = await atribuir(api, org, {
    perfilId: ids.tecnico,
    grupoId: ids.suporte,
  });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: consulta, contaId: carla.id });

  for (const usuario of ['ana', 'bruno', 'carla']) {
    entradas[usuario] = await cliente.entrar(usuario);
  }
});

afterAll(async () => {
  await api?.fechar();
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

interface PerfilDaLista {
  id: string;
  nome: string;
  permite: Record<string, boolean>;
}

async function listar(usuario: string) {
  const r = await cliente.consultar('/perfis', como(usuario));
  expect(r.statusCode).toBe(200);
  const corpo = r.json() as { itens: PerfilDaLista[]; permite: { cadastrar: boolean } };
  return { ...corpo, perfil: (id: string) => corpo.itens.find((perfil) => perfil.id === id) };
}

const cadastrar = (usuario: string, pedido: object) =>
  cliente.enviar('POST', '/perfis', como(usuario), pedido);
const editar = (usuario: string, id: string, pedido: object) =>
  cliente.enviar('PATCH', `/perfis/${id}`, como(usuario), pedido);
const acao = (usuario: string, id: string, caminho: string) =>
  cliente.enviar('POST', `/perfis/${id}/${caminho}`, como(usuario));

describe('lista e ficha', () => {
  it('lista os perfis com a situação, as permissões e o que a conta pode fazer', async () => {
    const carla = await listar('carla');
    expect(carla.permite).toEqual({ cadastrar: false });
    expect(carla.perfil(ids.administrador ?? '')).toMatchObject({
      nome: 'Administrador',
      protegido: true,
      todasAsPermissoes: true,
      permissoes: [],
      exigeDoisPassos: false,
      situacao: 'ativo',
      atribuicoes: 1,
      permite: { editar: false, inativar: false, reativar: false, atribuir: false },
    });
    expect(carla.perfil(ids.tecnico ?? '')).toMatchObject({
      permissoes: ['pessoas.ver', 'locais.editar'],
      atribuicoes: 2,
    });

    const ana = await listar('ana');
    expect(ana.permite).toEqual({ cadastrar: true });
    expect(ana.perfil(ids.tecnico ?? '')?.permite).toEqual({
      editar: true,
      inativar: true,
      reativar: false,
      atribuir: true,
    });
    expect(ana.perfil(ids.administrador ?? '')?.permite).toEqual({
      editar: false,
      inativar: false,
      reativar: false,
      atribuir: true,
    });
  });

  it('abre a ficha com quem tem o perfil, direto e por grupo, com o escopo', async () => {
    const r = await cliente.consultar(`/perfis/${ids.tecnico}`, como('carla'));
    expect(r.statusCode).toBe(200);
    expect(r.json().quemTem).toEqual([
      {
        atribuicaoId: ids.atribuicaoDoBruno,
        conta: {
          id: ids.contaDoBruno,
          pessoaId: expect.any(String),
          nome: 'Bruno Costa',
          usuario: 'bruno',
          situacao: 'ativa',
        },
        grupo: null,
        local: { id: ids.jundiai, caminho: 'Jundiaí', situacao: 'ativo' },
      },
      {
        atribuicaoId: ids.atribuicaoDoSuporte,
        conta: null,
        grupo: { id: ids.suporte, nome: 'Suporte', situacao: 'ativo' },
        local: null,
      },
    ]);
    expect((await cliente.consultar(`/perfis/${ids.jundiai}`, como('ana'))).statusCode).toBe(404);
  });

  it('exige acessos.ver', async () => {
    expect((await cliente.consultar('/perfis', como('bruno'))).statusCode).toBe(403);
  });
});

describe('cadastro e edição', () => {
  it('cadastra o perfil com as permissões do catálogo, sem repetir, na ordem dele', async () => {
    const r = await cadastrar('ana', {
      nome: ' Técnico de campo ',
      descricao: 'Atende as unidades.',
      permissoes: ['locais.editar', 'pessoas.ver', 'pessoas.ver'],
      exigeDoisPassos: true,
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      nome: 'Técnico de campo',
      descricao: 'Atende as unidades.',
      permissoes: ['pessoas.ver', 'locais.editar'],
      todasAsPermissoes: false,
      protegido: false,
      exigeDoisPassos: true,
      situacao: 'ativo',
      atribuicoes: 0,
      quemTem: [],
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'perfil.criado',
        alvoTipo: 'perfil',
        alvoId: r.json().id,
        depois: {
          nome: 'Técnico de campo',
          permissoes: ['pessoas.ver', 'locais.editar'],
          exigeDoisPassos: true,
          situacao: 'ativo',
        },
      },
    ]);
  });

  it('recusa a permissão desconhecida e o nome repetido', async () => {
    const desconhecida = await cadastrar('ana', { nome: 'Ativos', permissoes: ['ativos.excluir'] });
    expect(desconhecida.statusCode).toBe(400);
    expect(desconhecida.json().campos).toEqual({
      permissoes: 'Permissão desconhecida: ativos.excluir.',
    });
    const repetido = await cadastrar('ana', { nome: '  tecnico ', permissoes: [] });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json()).toMatchObject({
      type: 'urn:grafite:problema:conflito',
      campos: { nome: 'Já existe um perfil com este nome.' },
    });
    const vazio = await cadastrar('ana', { nome: ' ' });
    expect(vazio.json().campos).toEqual({ nome: 'Informe o nome do perfil.' });
  });

  it('edita, com as permissões antes → depois na auditoria, e vale já na requisição seguinte', async () => {
    const r = await editar('ana', ids.tecnico ?? '', { permissoes: ['pessoas.ver'] });
    expect(r.statusCode).toBe(200);
    expect(r.json().permissoes).toEqual(['pessoas.ver']);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'perfil.alterado',
        alvoId: ids.tecnico,
        antes: { permissoes: ['pessoas.ver', 'locais.editar'] },
        depois: { permissoes: ['pessoas.ver'] },
      },
    ]);
    const sessao = (await cliente.consultar('/sessao', como('bruno'))).json().sessao;
    expect(sessao.acesso.permissoes.map((p: { chave: string }) => p.chave)).toEqual([
      'pessoas.ver',
    ]);
  });

  it('protege o Administrador', async () => {
    for (const pedido of [
      { nome: 'Admin' },
      { permissoes: ['pessoas.ver'] },
      { exigeDoisPassos: true },
    ]) {
      const r = await editar('ana', ids.administrador ?? '', pedido);
      expect(r.statusCode).toBe(409);
      expect(r.json()).toMatchObject({
        type: 'urn:grafite:problema:perfil-protegido',
        detail: 'O perfil Administrador é protegido e não muda.',
      });
    }
    const inativacao = await acao('ana', ids.administrador ?? '', 'inativacao');
    expect(inativacao.json().type).toBe('urn:grafite:problema:perfil-protegido');
  });
});

describe('inativação e reativação', () => {
  it('inativa o perfil sem apagar as atribuições, e ele deixa de dar permissão', async () => {
    const r = await acao('ana', ids.tecnico ?? '', 'inativacao');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      situacao: 'inativo',
      permite: { inativar: false, reativar: true, atribuir: false },
    });
    expect(r.json().quemTem).toHaveLength(2);
    const sessao = (await cliente.consultar('/sessao', como('bruno'))).json().sessao;
    expect(sessao.acesso.permissoes).toEqual([]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'perfil.inativado', antes: { situacao: 'ativo' }, depois: { situacao: 'inativo' } },
    ]);

    const reativado = await acao('ana', ids.tecnico ?? '', 'reativacao');
    expect(reativado.json().situacao).toBe('ativo');
    expect(await auditoriaDaRequisicao(api, org, reativado)).toMatchObject([
      { acao: 'perfil.reativado' },
    ]);
  });

  it('recusa inativar ou tirar a permissão do perfil que deixaria a organização sem administrador', async () => {
    const outra = await criarOrganizacao(api, {
      nome: 'Outra',
      enderecos: ['grafite.perfis-outra.local'],
    });
    const outroCliente = clienteDaApi(api, 'grafite.perfis-outra.local');
    const gestor = await criarPerfil(api, outra, {
      nome: 'Gestor',
      permissoes: ['acessos.administrar'],
    });
    const ze = await criarConta(api, outra, { usuario: 'zeca' });
    await atribuir(api, outra, { perfilId: gestor, contaId: ze.id });
    const entrada = await outroCliente.entrar('zeca');

    const semPermissao = await outroCliente.enviar('PATCH', `/perfis/${gestor}`, entrada, {
      permissoes: ['acessos.ver'],
    });
    expect(semPermissao.statusCode).toBe(409);
    expect(semPermissao.json().type).toBe('urn:grafite:problema:ultimo-administrador');
    const inativacao = await outroCliente.enviar('POST', `/perfis/${gestor}/inativacao`, entrada);
    expect(inativacao.json().type).toBe('urn:grafite:problema:ultimo-administrador');
    const ficha = await outroCliente.consultar(`/perfis/${gestor}`, entrada);
    expect(ficha.json()).toMatchObject({ situacao: 'ativo', permissoes: ['acessos.administrar'] });
  });
});

describe('quem só vê os acessos', () => {
  it('vê os perfis e não altera nada', async () => {
    expect((await cliente.consultar(`/perfis/${ids.tecnico}`, como('carla'))).statusCode).toBe(200);
    for (const r of [
      await cadastrar('carla', { nome: 'Novo' }),
      await editar('carla', ids.tecnico ?? '', { nome: 'Outro' }),
      await acao('carla', ids.tecnico ?? '', 'inativacao'),
      await acao('carla', ids.tecnico ?? '', 'reativacao'),
    ]) {
      expect(r.statusCode).toBe(403);
      expect(r.json().permissao).toBe('acessos.administrar');
    }
  });
});
