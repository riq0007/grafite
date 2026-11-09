// As atribuições de perfil pela API (spec perfis-e-grupos e administracao-de-pessoas): o perfil dado
// a uma conta ou a um grupo, com escopo, as permissões que não valem no local, o encerramento que
// respeita o último administrador, e o acesso de uma conta com a origem de cada permissão.
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
  incluirNoGrupo,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.atribuicoes.local';

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
  ids.doca = await criarLocal(api, org, {
    nome: 'Doca 3',
    paiId: ids.jundiai,
    situacao: 'inativo',
  });

  ids.administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  ids.tecnico = await criarPerfil(api, org, {
    nome: 'Técnico',
    permissoes: ['pessoas.ver', 'locais.editar'],
  });
  ids.misto = await criarPerfil(api, org, {
    nome: 'Misto',
    permissoes: ['auditoria.ver', 'locais.editar'],
  });
  ids.antigo = await criarPerfil(api, org, {
    nome: 'Antigo',
    permissoes: ['pessoas.ver'],
    situacao: 'inativo',
  });
  const consulta = await criarPerfil(api, org, { nome: 'Consulta', permissoes: ['acessos.ver'] });

  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  ids.contaDaAna = ana.id;
  ids.atribuicaoDaAna = await atribuir(api, org, { perfilId: ids.administrador, contaId: ana.id });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: consulta, contaId: carla.id });
  ids.bruno = (await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' })).id;
  ids.davi = (await criarConta(api, org, { usuario: 'davi', nome: 'Davi Rocha' })).id;
  ids.suporte = await criarGrupo(api, org, { nome: 'Suporte' });

  for (const usuario of ['ana', 'bruno', 'carla', 'davi']) {
    entradas[usuario] = await cliente.entrar(usuario);
  }
});

afterAll(async () => {
  await api?.fechar();
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

const atribuirPelaApi = (usuario: string, pedido: object) =>
  cliente.enviar('POST', '/atribuicoes', como(usuario), pedido);

const permissoesDe = async (usuario: string) =>
  (await cliente.consultar('/sessao', como(usuario))).json().sessao.acesso.permissoes;

describe('POST /atribuicoes', () => {
  it('atribui o perfil a uma conta, com o escopo de um local', async () => {
    const r = await atribuirPelaApi('ana', {
      perfilId: ids.tecnico,
      contaId: ids.bruno,
      localId: ids.jundiai,
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({
      atribuicao: {
        id: expect.any(String),
        perfil: { id: ids.tecnico, nome: 'Técnico', situacao: 'ativo' },
        conta: {
          id: ids.bruno,
          pessoaId: expect.any(String),
          nome: 'Bruno Costa',
          usuario: 'bruno',
        },
        grupo: null,
        local: { id: ids.jundiai, caminho: 'Jundiaí', situacao: 'ativo' },
        criadaEm: api.relogio.agora().toISOString(),
      },
      ignoradas: [],
    });
    ids.atribuicaoDoBruno = r.json().atribuicao.id;
    expect(await permissoesDe('bruno')).toEqual([
      { chave: 'pessoas.ver', organizacao: false, locais: [ids.jundiai] },
      { chave: 'locais.editar', organizacao: false, locais: [ids.jundiai] },
    ]);
    const registros = await auditoriaDaRequisicao(api, org, r);
    expect(registros).toMatchObject([
      {
        acao: 'atribuicao.criada',
        alvoTipo: 'conta',
        alvoId: ids.bruno,
        depois: {
          perfilId: ids.tecnico,
          perfil: 'Técnico',
          contaId: ids.bruno,
          grupoId: null,
          localId: ids.jundiai,
          local: 'Jundiaí',
          encerradaEm: null,
        },
        dados: { atribuicaoId: ids.atribuicaoDoBruno, ignoradas: [] },
      },
    ]);
    expect(JSON.stringify(registros)).not.toContain('Bruno');
  });

  it('atribui o perfil a um grupo, para a organização inteira', async () => {
    const r = await atribuirPelaApi('ana', { perfilId: ids.tecnico, grupoId: ids.suporte });
    expect(r.statusCode).toBe(201);
    expect(r.json().atribuicao).toMatchObject({
      conta: null,
      grupo: { id: ids.suporte, nome: 'Suporte' },
      local: null,
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'atribuicao.criada', alvoTipo: 'grupo', alvoId: ids.suporte },
    ]);
  });

  it('recusa a atribuição repetida', async () => {
    const r = await atribuirPelaApi('ana', {
      perfilId: ids.tecnico,
      contaId: ids.bruno,
      localId: ids.jundiai,
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe('Esta atribuição já existe.');
  });

  it('avisa as permissões que não valem no local', async () => {
    const r = await atribuirPelaApi('ana', {
      perfilId: ids.misto,
      contaId: ids.davi,
      localId: ids.jundiai,
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().ignoradas).toEqual(['auditoria.ver']);
    expect(await permissoesDe('davi')).toEqual([
      { chave: 'locais.editar', organizacao: false, locais: [ids.jundiai] },
    ]);
  });

  it('recusa o local e o perfil inativos, e pede uma conta ou um grupo', async () => {
    const localInativo = await atribuirPelaApi('ana', {
      perfilId: ids.tecnico,
      contaId: ids.davi,
      localId: ids.doca,
    });
    expect(localInativo.statusCode).toBe(409);
    expect(localInativo.json().campos).toEqual({
      localId: 'O local escolhido está inativo. Escolha um local ativo.',
    });
    const perfilInativo = await atribuirPelaApi('ana', { perfilId: ids.antigo, contaId: ids.davi });
    expect(perfilInativo.statusCode).toBe(409);
    expect(perfilInativo.json().detail).toBe('Reative o perfil antes de atribuí-lo.');
    for (const pedido of [
      { perfilId: ids.tecnico },
      { perfilId: ids.tecnico, contaId: ids.davi, grupoId: ids.suporte },
    ]) {
      const r = await atribuirPelaApi('ana', pedido);
      expect(r.statusCode).toBe(400);
      expect(r.json().detail).toBe('Escolha uma conta ou um grupo.');
    }
  });
});

describe('DELETE /atribuicoes/:id', () => {
  it('encerra a atribuição, que deixa de valer e fica registrada', async () => {
    const r = await cliente.enviar('DELETE', `/atribuicoes/${ids.atribuicaoDoBruno}`, como('ana'));
    expect(r.statusCode).toBe(204);
    expect(await permissoesDe('bruno')).toEqual([]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'atribuicao.encerrada',
        alvoTipo: 'conta',
        alvoId: ids.bruno,
        antes: { encerradaEm: null },
        depois: { encerradaEm: api.relogio.agora().toISOString() },
      },
    ]);
    const deNovo = await cliente.enviar(
      'DELETE',
      `/atribuicoes/${ids.atribuicaoDoBruno}`,
      como('ana'),
    );
    expect(deNovo.statusCode).toBe(404);
  });

  it('recusa encerrar a atribuição do último administrador', async () => {
    const r = await cliente.enviar('DELETE', `/atribuicoes/${ids.atribuicaoDaAna}`, como('ana'));
    expect(r.statusCode).toBe(409);
    expect(r.json().type).toBe('urn:grafite:problema:ultimo-administrador');
    expect((await cliente.consultar('/perfis', como('ana'))).statusCode).toBe(200);
  });
});

describe('GET /contas/:id/acesso', () => {
  it('mostra os perfis, os grupos e o que a conta pode fazer, com a origem de cada permissão', async () => {
    const plantao = await criarGrupo(api, org, { nome: 'Plantão' });
    await atribuir(api, org, {
      perfilId: ids.tecnico ?? '',
      grupoId: plantao,
      localId: ids.jundiai,
    });
    await incluirNoGrupo(api, org, { grupoId: plantao, contaId: ids.bruno ?? '' });

    const r = await cliente.consultar(`/contas/${ids.bruno}/acesso`, como('carla'));
    expect(r.statusCode).toBe(200);
    const acesso = r.json();
    expect(acesso.grupos).toEqual([
      { id: plantao, nome: 'Plantão', situacao: 'ativo', incluidaEm: expect.any(String) },
    ]);
    expect(acesso.atribuicoes).toEqual([
      {
        id: expect.any(String),
        perfil: { id: ids.tecnico, nome: 'Técnico', situacao: 'ativo' },
        local: { id: ids.jundiai, caminho: 'Jundiaí', situacao: 'ativo' },
        grupo: { id: plantao, nome: 'Plantão', situacao: 'ativo' },
        criadaEm: expect.any(String),
        permite: { encerrar: false },
      },
    ]);
    expect(acesso.permissoes[0]).toEqual({
      chave: 'pessoas.ver',
      organizacao: false,
      locais: [{ id: ids.jundiai, caminho: 'Jundiaí' }],
      origens: [
        {
          atribuicaoId: expect.any(String),
          perfil: { id: ids.tecnico, nome: 'Técnico' },
          grupo: { id: plantao, nome: 'Plantão' },
          local: { id: ids.jundiai, caminho: 'Jundiaí' },
        },
      ],
    });
    expect(acesso.exigeDoisPassos).toEqual({ conta: false, perfis: [] });
  });

  it('diz se a conta da sessão pode encerrar cada atribuição direta', async () => {
    const acesso = (await cliente.consultar(`/contas/${ids.davi}/acesso`, como('ana'))).json();
    expect(acesso.atribuicoes).toEqual([
      expect.objectContaining({
        perfil: expect.objectContaining({ nome: 'Misto' }),
        grupo: null,
        permite: { encerrar: true },
      }),
    ]);
    expect(acesso.permite).toEqual({ atribuir: true });
  });

  it('exige acessos.ver, e acessos.administrar para atribuir e encerrar', async () => {
    expect((await cliente.consultar(`/contas/${ids.bruno}/acesso`, como('davi'))).statusCode).toBe(
      403,
    );
    const carla = await cliente.consultar(`/contas/${ids.bruno}/acesso`, como('carla'));
    expect(carla.json().permite).toEqual({ atribuir: false });
    const r = await atribuirPelaApi('carla', { perfilId: ids.tecnico, contaId: ids.davi });
    expect(r.statusCode).toBe(403);
    expect(r.json().permissao).toBe('acessos.administrar');
  });
});
