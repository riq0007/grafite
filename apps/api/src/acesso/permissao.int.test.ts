// A guarda de permissão (specs permissoes e auditoria; design do F2b, decisão 6): a rota declara a
// permissão, e a recusa responde 403 sem executar nada, diz a quem pedir acesso e fica na auditoria,
// numa transação própria. O registro fora do escopo é recusado pelo `exigirEm` do mesmo jeito.
import {
  atribuicoes,
  auditoria,
  contas,
  locais,
  membrosDoGrupo,
  naOrganizacao,
  pessoas,
} from '@grafite/db';
import { montarArvore, normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  criarConta,
  criarGrupo,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  incluirNoGrupo,
} from '../../test/integracao.ts';
import { exigirEm, instalarAcesso } from './escopo.ts';
import { criarResolvedorDeOrganizacao } from './organizacao.ts';

const host = 'grafite.permissao.local';
const senha = 'cavalo bateria grampo correto';

let api: ApiDeTeste;
let org = '';
const ids: Record<string, string> = {};
let executadas = 0;
let ipDoCaso = 0;
const novoIp = () => `10.8.${Math.floor(++ipDoCaso / 250)}.${ipDoCaso % 250}`;

interface Entrada {
  cookie: string;
  csrf: string;
}

const SEM_ENTRADA: Entrada = { cookie: '', csrf: '' };

/** Uma conta com o nome da pessoa e, se dado, o perfil para a organização inteira. */
async function conta(usuario: string, nome: string, perfilId?: string) {
  const criada = await criarConta(api, org, { usuario, nome, senha });
  ids[usuario] = criada.id;
  if (perfilId) await atribuir(api, org, { perfilId, contaId: criada.id });
  return criada;
}

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });

  // As rotas de teste, num escopo de acesso como o da API: uma exige `pessoas.editar` e valida o
  // corpo; a outra grava um rascunho, lê a árvore e só então confere o local do registro.
  await api.app.register(async (escopo) => {
    instalarAcesso(escopo, {
      banco: api.banco,
      agora: api.relogio.agora,
      resolver: criarResolvedorDeOrganizacao({ banco: api.banco, agora: api.relogio.agora }),
    });
    escopo.post(
      '/teste/pessoas/:id',
      {
        config: { permissao: 'pessoas.editar' },
        schema: { body: z.object({ nome: z.string().min(1) }) },
      },
      async () => {
        executadas += 1;
        return { executada: true };
      },
    );
    escopo.post(
      '/teste/locais/:id',
      { config: { permissao: 'locais.editar' } },
      async (requisicao) => {
        const { id } = requisicao.params as { id: string };
        return naOrganizacao(api.banco, org, async (tx) => {
          const nome = `Rascunho ${requisicao.id}`;
          await tx
            .insert(locais)
            .values({ orgId: org, nome, nomeNormalizado: normalizarTexto(nome), tipo: 'outro' });
          const arvore = montarArvore(
            await tx
              .select({
                id: locais.id,
                paiId: locais.paiId,
                nome: locais.nome,
                tipo: locais.tipo,
                situacao: locais.situacao,
              })
              .from(locais),
          );
          exigirEm(requisicao, 'locais.editar', id, arvore);
          return { alterado: id };
        });
      },
    );
  });

  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: ids.jundiai });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });

  const administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  const gestor = await criarPerfil(api, org, {
    nome: 'Gestor de acessos',
    permissoes: ['acessos.administrar'],
  });
  const gestorInativo = await criarPerfil(api, org, {
    nome: 'Gestor antigo',
    permissoes: ['acessos.administrar'],
    situacao: 'inativo',
  });
  const tecnico = await criarPerfil(api, org, {
    nome: 'Técnico',
    permissoes: ['pessoas.ver', 'locais.editar'],
  });

  // Quem administra os acessos: direto, pelo perfil com a permissão e por um grupo ativo.
  await conta('ana', 'Ana Souza', administrador);
  await conta('beatriz', 'Beatriz Melo', gestor);
  await conta('zelia', 'Zélia Prado', administrador);
  const gestores = await criarGrupo(api, org, { nome: 'Gestores' });
  await atribuir(api, org, { perfilId: administrador, grupoId: gestores });
  await incluirNoGrupo(api, org, {
    grupoId: gestores,
    contaId: (await conta('carlos', 'Carlos Lima')).id,
  });

  // Quem não administra, com nomes que viriam antes na ordem alfabética.
  const aaron = await conta('aaron', 'Aaron Inativo', administrador);
  const alice = await conta('alice', 'Alice Conta Inativa', administrador);
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.update(pessoas).set({ situacao: 'inativa' }).where(eq(pessoas.id, aaron.pessoaId));
    await tx.update(contas).set({ situacao: 'inativa' }).where(eq(contas.id, alice.id));
  });
  const abel = await conta('abel', 'Abel Num Ramo');
  await atribuir(api, org, { perfilId: administrador, contaId: abel.id, localId: ids.jundiai });
  const antigos = await criarGrupo(api, org, { nome: 'Antigos', situacao: 'inativo' });
  await atribuir(api, org, { perfilId: administrador, grupoId: antigos });
  await incluirNoGrupo(api, org, {
    grupoId: antigos,
    contaId: (await conta('abilio', 'Abílio Grupo Inativo')).id,
  });
  const adriana = await conta('adriana', 'Adriana Encerrada');
  const encerrada = await atribuir(api, org, { perfilId: administrador, contaId: adriana.id });
  const alan = await conta('alan', 'Alan Saiu do Grupo');
  const participacao = await incluirNoGrupo(api, org, { grupoId: gestores, contaId: alan.id });
  await naOrganizacao(api.banco, org, async (tx) => {
    const fim = api.relogio.agora();
    await tx.update(atribuicoes).set({ encerradaEm: fim }).where(eq(atribuicoes.id, encerrada));
    await tx
      .update(membrosDoGrupo)
      .set({ encerradaEm: fim })
      .where(eq(membrosDoGrupo.id, participacao));
  });
  await conta('amanda', 'Amanda Perfil Inativo', gestorInativo);

  // Quem usa as rotas.
  const bruno = await conta('bruno', 'Bruno Costa');
  await atribuir(api, org, { perfilId: tecnico, contaId: bruno.id, localId: ids.jundiai });
  await conta('davi', 'Davi Rocha');
  ids.eva = (
    await criarConta(api, org, { usuario: 'eva', nome: 'Eva Lopes', senha, senhaTemporaria: true })
  ).id;

  // Outra organização, com o próprio administrador, que não aparece aqui.
  const outra = await criarOrganizacao(api, {
    nome: 'Outra',
    enderecos: ['grafite.permissao-outra.local'],
  });
  const deLa = await criarConta(api, outra, { usuario: 'aaa', nome: 'Aaa Da Outra', senha });
  await atribuir(api, outra, {
    perfilId: await criarPerfil(api, outra, { nome: 'Administrador', administrador: true }),
    contaId: deLa.id,
  });
});

afterAll(async () => {
  await api?.fechar();
});

async function entrar(usuario: string): Promise<Entrada> {
  const r = await api.app.inject({
    method: 'POST',
    url: '/sessao',
    remoteAddress: novoIp(),
    headers: { host, 'sec-fetch-site': 'same-origin' },
    payload: { usuario, senha },
  });
  expect(r.statusCode).toBe(200);
  return {
    cookie: String(r.headers['set-cookie']).split(';')[0] ?? '',
    csrf: r.json().sessao?.csrf ?? '',
  };
}

const ip = { atual: '' };

function enviar(url: string, { cookie, csrf }: Entrada, payload: object = {}) {
  ip.atual = novoIp();
  return api.app.inject({
    method: 'POST',
    url,
    remoteAddress: ip.atual,
    headers: { host, cookie, 'x-grafite-csrf': csrf, 'sec-fetch-site': 'same-origin' },
    payload,
  });
}

const consultar = (url: string, { cookie }: Entrada) =>
  api.app.inject({ method: 'GET', url, remoteAddress: novoIp(), headers: { host, cookie } });

const registrosDaRequisicao = (codigoDeRastreio: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(auditoria).where(eq(auditoria.codigoDeRastreio, codigoDeRastreio)),
  );

const ADMINISTRADORES = ['Ana Souza', 'Beatriz Melo', 'Carlos Lima'];

describe('guarda da rota', () => {
  it('recusa a conta sem a permissão com 403, sem executar nada, e diz a quem pedir acesso', async () => {
    const davi = await entrar('davi');
    const antes = executadas;
    const r = await enviar(`/teste/pessoas/${ids.ana}`, davi, { nome: 'Nome confidencial' });
    expect(r.statusCode).toBe(403);
    expect(r.headers['content-type']).toContain('application/problem+json');
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:sem-permissao',
      title: 'Sem permissão',
      detail: 'Você não tem permissão para cadastrar e editar pessoas, inativar e reativar.',
      permissao: 'pessoas.editar',
      administradores: ADMINISTRADORES,
      codigoDeRastreio: r.headers['x-codigo-de-rastreio'],
    });
    expect(executadas).toBe(antes);
  });

  it('registra a recusa na auditoria, com a rota no padrão e sem o corpo', async () => {
    const davi = await entrar('davi');
    const r = await enviar(`/teste/pessoas/${ids.ana}`, davi, { nome: 'Nome confidencial' });
    const registros = await registrosDaRequisicao(String(r.headers['x-codigo-de-rastreio']));
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      acao: 'permissao.recusada',
      atorTipo: 'conta',
      atorContaId: ids.davi,
      alvoTipo: 'rota',
      alvoId: null,
      antes: null,
      depois: null,
      dados: {
        permissao: 'pessoas.editar',
        metodo: 'POST',
        rota: '/teste/pessoas/:id',
        parametros: { id: ids.ana },
      },
      ip: ip.atual,
    });
    expect(JSON.stringify(registros)).not.toContain('Nome confidencial');
  });

  it('confere a permissão antes de validar o corpo', async () => {
    const davi = await entrar('davi');
    const semPermissao = await enviar(`/teste/pessoas/${ids.ana}`, davi, {});
    expect(semPermissao.json().type).toBe('urn:grafite:problema:sem-permissao');
    const ana = await entrar('ana');
    const invalido = await enviar(`/teste/pessoas/${ids.davi}`, ana, {});
    expect(invalido.statusCode).toBe(400);
    expect(invalido.json().type).toBe('urn:grafite:problema:dados-invalidos');
  });

  it('deixa passar a conta com a permissão, por perfil direto ou por grupo', async () => {
    const antes = executadas;
    for (const usuario of ['ana', 'carlos']) {
      const r = await enviar(`/teste/pessoas/${ids.davi}`, await entrar(usuario), { nome: 'Davi' });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ executada: true });
    }
    expect(executadas).toBe(antes + 2);
  });

  it('pede a sessão ativa antes da permissão, sem registrar recusa de permissão', async () => {
    const semSessao = await enviar(`/teste/pessoas/${ids.ana}`, SEM_ENTRADA, { nome: 'X' });
    expect(semSessao.statusCode).toBe(401);
    expect(semSessao.json().type).toBe('urn:grafite:problema:sem-sessao');

    const eva = await entrar('eva');
    const pendente = await enviar(`/teste/pessoas/${ids.ana}`, eva, { nome: 'X' });
    expect(pendente.statusCode).toBe(403);
    expect(pendente.json()).toMatchObject({
      type: 'urn:grafite:problema:pendencia',
      pendencia: 'trocar-senha',
    });
    for (const r of [semSessao, pendente]) {
      const registros = await registrosDaRequisicao(String(r.headers['x-codigo-de-rastreio']));
      expect(registros.filter((registro) => registro.acao === 'permissao.recusada')).toEqual([]);
    }
  });
});

describe('registro fora do escopo', () => {
  const rascunho = (codigoDeRastreio: string) =>
    naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ id: locais.id })
        .from(locais)
        .where(eq(locais.nome, `Rascunho ${codigoDeRastreio}`)),
    );

  it('deixa alterar o registro dentro do ramo da atribuição', async () => {
    const r = await enviar(`/teste/locais/${ids.expedicao}`, await entrar('bruno'));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ alterado: ids.expedicao });
    expect(await rascunho(String(r.headers['x-codigo-de-rastreio']))).toHaveLength(1);
  });

  it('recusa o registro fora do ramo, desfaz a transação da rota e registra a recusa', async () => {
    const r = await enviar(`/teste/locais/${ids.campinas}`, await entrar('bruno'));
    const codigo = String(r.headers['x-codigo-de-rastreio']);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:sem-permissao',
      detail: 'Você não tem permissão para cadastrar, renomear, mover, inativar e reativar locais.',
      permissao: 'locais.editar',
      administradores: ADMINISTRADORES,
    });
    expect(await rascunho(codigo)).toEqual([]);
    expect(await registrosDaRequisicao(codigo)).toMatchObject([
      {
        acao: 'permissao.recusada',
        atorContaId: ids.bruno,
        dados: {
          permissao: 'locais.editar',
          metodo: 'POST',
          rota: '/teste/locais/:id',
          parametros: { id: ids.campinas },
        },
      },
    ]);
  });

  it('recusa na guarda, antes de ler o registro, a conta sem a permissão em escopo nenhum', async () => {
    const r = await enviar(`/teste/locais/${ids.expedicao}`, await entrar('davi'));
    expect(r.statusCode).toBe(403);
    expect(await rascunho(String(r.headers['x-codigo-de-rastreio']))).toEqual([]);
  });
});

describe('GET /acesso/administradores', () => {
  it('diz até 3 pessoas que administram os acessos da organização, em ordem alfabética', async () => {
    const r = await consultar('/acesso/administradores', await entrar('bruno'));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ administradores: ADMINISTRADORES });
  });

  it('exige a sessão ativa', async () => {
    const semSessao = await consultar('/acesso/administradores', SEM_ENTRADA);
    expect(semSessao.statusCode).toBe(401);
    const pendente = await consultar('/acesso/administradores', await entrar('eva'));
    expect(pendente.json().type).toBe('urn:grafite:problema:pendencia');
  });
});
