// Os grupos pela API (spec perfis-e-grupos): o cadastro e a edição, os membros incluídos e
// retirados sem apagar a participação, o grupo inativo que deixa de passar os perfis, e o último
// administrador ao retirar e ao inativar.
import { membrosDoGrupo, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
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

const host = 'grafite.grupos.local';

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

  const administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  ids.tecnico = await criarPerfil(api, org, {
    nome: 'Técnico',
    permissoes: ['pessoas.ver', 'locais.editar'],
  });
  const consulta = await criarPerfil(api, org, { nome: 'Consulta', permissoes: ['acessos.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administrador, contaId: ana.id });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: consulta, contaId: carla.id });
  for (const [usuario, nome] of [
    ['bruno', 'Bruno Costa'],
    ['davi', 'Davi Rocha'],
  ] as const) {
    ids[usuario] = (await criarConta(api, org, { usuario, nome })).id;
  }
  for (const usuario of ['ana', 'bruno', 'carla', 'davi']) {
    entradas[usuario] = await cliente.entrar(usuario);
  }
});

afterAll(async () => {
  await api?.fechar();
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

const permissoesDe = async (usuario: string) =>
  (
    (await cliente.consultar('/sessao', como(usuario))).json().sessao.acesso.permissoes as {
      chave: string;
    }[]
  ).map((permissao) => permissao.chave);

const incluir = (usuario: string, grupoId: string, contaId: string) =>
  cliente.enviar('POST', `/grupos/${grupoId}/membros`, como(usuario), { contaId });
const retirar = (usuario: string, grupoId: string, contaId: string) =>
  cliente.enviar('DELETE', `/grupos/${grupoId}/membros/${contaId}`, como(usuario));

describe('cadastro e edição', () => {
  it('cadastra o grupo e recusa o nome repetido', async () => {
    const r = await cliente.enviar('POST', '/grupos', como('ana'), {
      nome: ' Suporte ',
      descricao: 'Atende os chamados.',
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      nome: 'Suporte',
      descricao: 'Atende os chamados.',
      situacao: 'ativo',
      membros: [],
      perfis: [],
      permite: { editar: true, inativar: true, reativar: false, incluirMembros: true },
    });
    ids.suporte = r.json().id;
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'grupo.criado',
        alvoTipo: 'grupo',
        alvoId: ids.suporte,
        depois: { nome: 'Suporte', descricao: 'Atende os chamados.', situacao: 'ativo' },
      },
    ]);
    const repetido = await cliente.enviar('POST', '/grupos', como('ana'), { nome: 'suporte' });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().campos).toEqual({ nome: 'Já existe um grupo com este nome.' });
  });

  it('edita o grupo, com o antes → depois', async () => {
    const r = await cliente.enviar('PATCH', `/grupos/${ids.suporte}`, como('ana'), {
      nome: 'Suporte técnico',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().nome).toBe('Suporte técnico');
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'grupo.alterado', antes: { nome: 'Suporte' }, depois: { nome: 'Suporte técnico' } },
    ]);
  });
});

describe('membros', () => {
  it('inclui a conta, que passa a ter os perfis do grupo', async () => {
    ids.atribuicaoDoSuporte = await atribuir(api, org, {
      perfilId: ids.tecnico ?? '',
      grupoId: ids.suporte ?? '',
      localId: ids.jundiai,
    });
    expect(await permissoesDe('bruno')).toEqual([]);
    const r = await incluir('ana', ids.suporte ?? '', ids.bruno ?? '');
    expect(r.statusCode).toBe(200);
    expect(r.json().membros).toEqual([
      {
        contaId: ids.bruno,
        pessoaId: expect.any(String),
        nome: 'Bruno Costa',
        usuario: 'bruno',
        situacao: 'ativa',
        incluidaEm: api.relogio.agora().toISOString(),
      },
    ]);
    expect(r.json().perfis).toEqual([
      {
        atribuicaoId: ids.atribuicaoDoSuporte,
        perfil: { id: ids.tecnico, nome: 'Técnico', situacao: 'ativo' },
        local: { id: ids.jundiai, caminho: 'Jundiaí', situacao: 'ativo' },
      },
    ]);
    expect(await permissoesDe('bruno')).toEqual(['pessoas.ver', 'locais.editar']);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'membro.incluido',
        alvoTipo: 'conta',
        alvoId: ids.bruno,
        dados: { grupoId: ids.suporte, grupo: 'Suporte técnico' },
      },
    ]);
  });

  it('recusa a inclusão repetida e a conta que não existe', async () => {
    const repetida = await incluir('ana', ids.suporte ?? '', ids.bruno ?? '');
    expect(repetida.statusCode).toBe(409);
    expect(repetida.json().detail).toBe('Esta conta já participa do grupo.');
    const inexistente = await incluir(
      'ana',
      ids.suporte ?? '',
      '0199a000-0000-7000-8000-000000000000',
    );
    expect(inexistente.statusCode).toBe(404);
  });

  it('retira a conta encerrando a participação, sem apagá-la', async () => {
    const r = await retirar('ana', ids.suporte ?? '', ids.bruno ?? '');
    expect(r.statusCode).toBe(200);
    expect(r.json().membros).toEqual([]);
    expect(await permissoesDe('bruno')).toEqual([]);
    const participacoes = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ encerradaEm: membrosDoGrupo.encerradaEm })
        .from(membrosDoGrupo)
        .where(eq(membrosDoGrupo.contaId, ids.bruno ?? '')),
    );
    expect(participacoes).toEqual([{ encerradaEm: api.relogio.agora() }]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'membro.retirado', alvoId: ids.bruno, dados: { grupoId: ids.suporte } },
    ]);
    const deNovo = await retirar('ana', ids.suporte ?? '', ids.bruno ?? '');
    expect(deNovo.statusCode).toBe(404);
    expect(deNovo.json().detail).toBe('Esta conta não participa do grupo.');
    expect((await incluir('ana', ids.suporte ?? '', ids.bruno ?? '')).statusCode).toBe(200);
  });
});

describe('inativação', () => {
  it('o grupo inativo deixa de passar os perfis aos membros, que continuam nele', async () => {
    await incluir('ana', ids.suporte ?? '', ids.davi ?? '');
    expect(await permissoesDe('davi')).toEqual(['pessoas.ver', 'locais.editar']);
    const r = await cliente.enviar('POST', `/grupos/${ids.suporte}/inativacao`, como('ana'));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ situacao: 'inativo', permite: { reativar: true } });
    expect(r.json().membros).toHaveLength(2);
    expect(await permissoesDe('davi')).toEqual([]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'grupo.inativado', antes: { situacao: 'ativo' }, depois: { situacao: 'inativo' } },
    ]);
    const reativado = await cliente.enviar(
      'POST',
      `/grupos/${ids.suporte}/reativacao`,
      como('ana'),
    );
    expect(reativado.json().situacao).toBe('ativo');
    expect(await permissoesDe('davi')).toEqual(['pessoas.ver', 'locais.editar']);
  });

  it('recusa retirar e inativar quando a organização ficaria sem administrador', async () => {
    const outra = await criarOrganizacao(api, {
      nome: 'Outra',
      enderecos: ['grafite.grupos-outra.local'],
    });
    const outroCliente = clienteDaApi(api, 'grafite.grupos-outra.local');
    const administrador = await criarPerfil(api, outra, {
      nome: 'Administrador',
      administrador: true,
    });
    const gestores = await criarGrupo(api, outra, { nome: 'Gestores' });
    await atribuir(api, outra, { perfilId: administrador, grupoId: gestores });
    const zeca = await criarConta(api, outra, { usuario: 'zeca' });
    await incluirNoGrupo(api, outra, { grupoId: gestores, contaId: zeca.id });
    const entrada = await outroCliente.entrar('zeca');

    const retirada = await outroCliente.enviar(
      'DELETE',
      `/grupos/${gestores}/membros/${zeca.id}`,
      entrada,
    );
    expect(retirada.statusCode).toBe(409);
    expect(retirada.json().type).toBe('urn:grafite:problema:ultimo-administrador');
    const inativacao = await outroCliente.enviar('POST', `/grupos/${gestores}/inativacao`, entrada);
    expect(inativacao.json().type).toBe('urn:grafite:problema:ultimo-administrador');
    const ficha = await outroCliente.consultar(`/grupos/${gestores}`, entrada);
    expect(ficha.json()).toMatchObject({ situacao: 'ativo', membros: [{ contaId: zeca.id }] });
  });
});

describe('lista e quem só vê os acessos', () => {
  it('lista os grupos com os números de membros e de perfis, e os perfis em vigor', async () => {
    const r = await cliente.consultar('/grupos', como('carla'));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      permite: { cadastrar: false },
      itens: [
        {
          id: ids.suporte,
          nome: 'Suporte técnico',
          membros: 2,
          perfis: 1,
          // O que o grupo dá, para a aba Acesso da pessoa mostrar sem abrir cada grupo.
          perfisEmVigor: [
            {
              perfil: { id: ids.tecnico, nome: 'Técnico', situacao: 'ativo' },
              local: { id: ids.jundiai, caminho: 'Jundiaí', situacao: 'ativo' },
            },
          ],
          permite: { editar: false, inativar: false, reativar: false, incluirMembros: false },
        },
      ],
    });
  });

  it('vê sem alterar', async () => {
    expect((await cliente.consultar(`/grupos/${ids.suporte}`, como('carla'))).statusCode).toBe(200);
    for (const r of [
      await cliente.enviar('POST', '/grupos', como('carla'), { nome: 'Outro' }),
      await cliente.enviar('PATCH', `/grupos/${ids.suporte}`, como('carla'), { nome: 'X' }),
      await incluir('carla', ids.suporte ?? '', ids.bruno ?? ''),
      await retirar('carla', ids.suporte ?? '', ids.bruno ?? ''),
      await cliente.enviar('POST', `/grupos/${ids.suporte}/inativacao`, como('carla')),
    ]) {
      expect(r.statusCode).toBe(403);
    }
    expect((await cliente.consultar('/grupos', como('bruno'))).statusCode).toBe(403);
  });
});
