// O acesso, os titulares e a situação dos segredos pela API (spec cofre-de-segredos, "Acesso ao
// segredo" e "Segredo", e modulo-cofre, "Acesso na ficha"; design do P6, decisões 3 e 7): quem
// administra o cofre libera cada segredo a contas, grupos e perfis, com o antes e o depois na
// auditoria, escolhe entre os titulares e as pessoas ativos e inativa e reativa o segredo.
import { contas, eventos, naOrganizacao, perfis } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type CofreDeTeste, montarCofre, type UsuarioDoCofre } from '../../test/cofre.ts';
import {
  type ApiDeTeste,
  abrirApi,
  auditoriaDaRequisicao,
  criarConta,
  criarGrupo,
  criarPerfil,
  criarPessoa,
  incluirNoGrupo,
} from '../../test/integracao.ts';

const host = 'grafite.cofre-acesso.local';

let api: ApiDeTeste;
let cofre: CofreDeTeste;
let org = '';

beforeAll(async () => {
  api = await abrirApi();
  cofre = await montarCofre(api, host);
  org = cofre.org;
});

afterAll(async () => {
  await api?.fechar();
});

const limparEventos = () => naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));

beforeEach(async () => {
  await limparEventos();
});

const consultar = (url: string, usuario: UsuarioDoCofre = 'ana') =>
  cofre.cliente.consultar(url, cofre.como(usuario));
const enviar = (
  metodo: 'POST' | 'PUT',
  url: string,
  usuario: UsuarioDoCofre = 'ana',
  pedido?: object,
) => cofre.cliente.enviar(metodo, url, cofre.como(usuario), pedido);
const mudarAcesso = (id: string, titulares: object[], usuario: UsuarioDoCofre = 'ana') =>
  enviar('PUT', `/cofre/segredos/${id}/acesso`, usuario, { titulares });

let nomes = 0;
async function segredoNovo(nome = `Segredo ${++nomes}`) {
  const r = await enviar('POST', '/cofre/segredos', 'ana', {
    nome,
    tipo: 'conta-administrativa',
    classificacao: 'equipamento',
    valor: 'S3nh@',
  });
  expect(r.statusCode, r.body).toBe(201);
  await limparEventos();
  return r.json().id as string;
}

const nomesNaLista = async (usuario: UsuarioDoCofre) =>
  ((await consultar('/cofre/segredos', usuario)).json().segredos as { nome: string }[]).map(
    (segredo) => segredo.nome,
  );

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ tipo: eventos.tipo, alvoTipo: eventos.alvoTipo, permissao: eventos.permissao })
      .from(eventos),
  );

describe('acesso do segredo', () => {
  it('libera a contas, grupos e perfis, com o antes e o depois na auditoria', async () => {
    const id = await segredoNovo('Switch do CPD');
    const r = await mudarAcesso(id, [
      { tipo: 'conta', id: cofre.contas.ana.id },
      { tipo: 'grupo', id: cofre.suporte },
      { tipo: 'perfil', id: cofre.perfis.tecnico },
    ]);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().acesso).toEqual([
      { tipo: 'conta', id: cofre.contas.ana.id, nome: 'Ana Souza' },
      { tipo: 'grupo', id: cofre.suporte, nome: 'Suporte' },
      { tipo: 'perfil', id: cofre.perfis.tecnico, nome: 'Técnico' },
    ]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'acesso-do-segredo.alterado',
        alvoTipo: 'segredo',
        alvoId: id,
        antes: { acesso: [{ tipo: 'conta', id: cofre.contas.ana.id, nome: 'Ana Souza' }] },
        depois: {
          acesso: [
            { tipo: 'conta', id: cofre.contas.ana.id, nome: 'Ana Souza' },
            { tipo: 'grupo', id: cofre.suporte, nome: 'Suporte' },
            { tipo: 'perfil', id: cofre.perfis.tecnico, nome: 'Técnico' },
          ],
        },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'cofre.mudou', alvoTipo: 'segredo', permissao: 'cofre.usar' },
    ]);
  });

  it('o grupo vale para quem entra nele, e o perfil em qualquer escopo', async () => {
    const id = await segredoNovo('Console do Suporte');
    await mudarAcesso(id, [{ tipo: 'grupo', id: cofre.suporte }]);
    expect(await nomesNaLista('bruno')).not.toContain('Console do Suporte');
    await incluirNoGrupo(api, org, { grupoId: cofre.suporte, contaId: cofre.contas.bruno.id });
    expect(await nomesNaLista('bruno')).toContain('Console do Suporte');
    expect(await nomesNaLista('carla')).not.toContain('Console do Suporte');
    await mudarAcesso(id, [{ tipo: 'perfil', id: cofre.perfis.tecnico }]);
    expect(await nomesNaLista('carla')).toContain('Console do Suporte');
  });

  it('o acesso tirado vale na hora, e a auditoria mostra o grupo antes e sem ele depois', async () => {
    const id = await segredoNovo('Roteador do Suporte');
    await mudarAcesso(id, [
      { tipo: 'conta', id: cofre.contas.ana.id },
      { tipo: 'grupo', id: cofre.suporte },
    ]);
    expect((await consultar(`/cofre/segredos/${id}`, 'bruno')).statusCode).toBe(200);
    const r = await mudarAcesso(id, [{ tipo: 'conta', id: cofre.contas.ana.id }]);
    expect(r.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'acesso-do-segredo.alterado',
        antes: {
          acesso: [
            { tipo: 'conta', nome: 'Ana Souza' },
            { tipo: 'grupo', nome: 'Suporte' },
          ],
        },
        depois: { acesso: [{ tipo: 'conta', nome: 'Ana Souza' }] },
      },
    ]);
    expect(await nomesNaLista('bruno')).not.toContain('Roteador do Suporte');
    expect((await consultar(`/cofre/segredos/${id}`, 'bruno')).statusCode).toBe(404);
  });

  it('a mesma lista de novo não grava nada', async () => {
    const id = await segredoNovo();
    const r = await mudarAcesso(id, [{ tipo: 'conta', id: cofre.contas.ana.id }]);
    expect(r.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('quem administra pode tirar o próprio acesso e continua vendo o segredo', async () => {
    const id = await segredoNovo('Banco do ERP');
    const r = await mudarAcesso(id, [{ tipo: 'grupo', id: cofre.suporte }]);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ permite: { revelar: false, administrar: true } });
    expect(await nomesNaLista('ana')).toContain('Banco do ERP');
  });

  it('recusa o titular que não existe e o novo que está inativo', async () => {
    const id = await segredoNovo();
    const inativo = await criarGrupo(api, org, { nome: 'Grupo antigo', situacao: 'inativo' });
    for (const [titular, mensagem] of [
      [{ tipo: 'grupo', id: '0199a3f0-0000-7000-8000-000000000123' }, 'Titular não encontrado.'],
      [{ tipo: 'grupo', id: inativo }, 'O grupo Grupo antigo está inativo.'],
    ] as const) {
      const r = await mudarAcesso(id, [titular]);
      expect(r.statusCode).toBe(400);
      expect(r.json().campos).toEqual({ titulares: mensagem });
    }
  });

  it('o titular que já estava continua depois de inativado', async () => {
    const id = await segredoNovo();
    const perfil = await criarPerfil(api, org, { nome: 'Plantão', permissoes: ['cofre.usar'] });
    await mudarAcesso(id, [{ tipo: 'perfil', id: perfil }]);
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(perfis).set({ situacao: 'inativo' }).where(eq(perfis.id, perfil)),
    );
    const r = await mudarAcesso(id, [
      { tipo: 'perfil', id: perfil },
      { tipo: 'conta', id: cofre.contas.ana.id },
    ]);
    expect(r.statusCode, r.body).toBe(200);
  });

  it('só quem administra o cofre muda o acesso', async () => {
    const id = await segredoNovo();
    await mudarAcesso(id, [{ tipo: 'conta', id: cofre.contas.bruno.id }]);
    const r = await mudarAcesso(id, [{ tipo: 'conta', id: cofre.contas.bruno.id }], 'bruno');
    expect(r.statusCode).toBe(403);
  });
});

describe('titulares e pessoas', () => {
  beforeAll(async () => {
    await criarGrupo(api, org, { nome: 'Infraestrutura' });
    await criarGrupo(api, org, { nome: 'Grupo desativado', situacao: 'inativo' });
    await criarPerfil(api, org, { nome: 'Perfil desativado', situacao: 'inativo' });
    const inativa = await criarConta(api, org, { usuario: 'fabio', nome: 'Fábio Reis' });
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(contas).set({ situacao: 'inativa' }).where(eq(contas.id, inativa.id)),
    );
    await criarPessoa(api, org, { nome: 'Pessoa sem conta' });
    await criarPessoa(api, org, { nome: 'Pessoa que saiu', situacao: 'inativa' });
  });

  it('os titulares são as contas, os grupos e os perfis ativos, pelo nome', async () => {
    const r = await consultar('/cofre/titulares');
    expect(r.statusCode).toBe(200);
    const { contas, grupos: dosGrupos, perfis: dosPerfis } = r.json();
    expect(contas).toEqual(
      expect.arrayContaining([
        { id: cofre.contas.ana.id, nome: 'Ana Souza', usuario: 'ana' },
        { id: cofre.contas.bruno.id, nome: 'Bruno Lima', usuario: 'bruno' },
      ]),
    );
    expect(contas.map((conta: { usuario: string }) => conta.usuario)).not.toContain('fabio');
    const nomesDosGrupos = dosGrupos.map((grupo: { nome: string }) => grupo.nome);
    expect(nomesDosGrupos).toEqual(expect.arrayContaining(['Infraestrutura', 'Suporte']));
    expect(nomesDosGrupos).not.toContain('Grupo desativado');
    expect(nomesDosGrupos).toEqual([...nomesDosGrupos].sort((a, b) => a.localeCompare(b)));
    const nomesDosPerfis = dosPerfis.map((perfil: { nome: string }) => perfil.nome);
    expect(nomesDosPerfis).toEqual(expect.arrayContaining(['Cofre', 'Técnico', 'Uso do cofre']));
    expect(nomesDosPerfis).not.toContain('Perfil desativado');
    expect(Object.keys(dosPerfis[0] ?? {}).sort()).toEqual(['id', 'nome']);
  });

  it('as pessoas são só as ativas, só com o nome', async () => {
    const r = await consultar('/cofre/pessoas');
    expect(r.statusCode).toBe(200);
    const { pessoas } = r.json();
    const nomesDasPessoas = pessoas.map((pessoa: { nome: string }) => pessoa.nome);
    expect(nomesDasPessoas).toEqual(expect.arrayContaining(['Ana Souza', 'Pessoa sem conta']));
    expect(nomesDasPessoas).not.toContain('Pessoa que saiu');
    expect(Object.keys(pessoas[0] ?? {}).sort()).toEqual(['id', 'nome']);
  });

  it('só quem administra o cofre lê os titulares e as pessoas', async () => {
    for (const url of ['/cofre/titulares', '/cofre/pessoas']) {
      expect((await consultar(url, 'bruno')).statusCode).toBe(403);
      expect((await consultar(url, 'eva')).statusCode).toBe(403);
    }
  });
});

describe('situação do segredo', () => {
  it('inativa e reativa, com a auditoria e o evento, e a repetida não grava nada', async () => {
    const id = await segredoNovo('Senha do Wi-Fi visitantes');
    await mudarAcesso(id, [{ tipo: 'conta', id: cofre.contas.bruno.id }]);
    await limparEventos();
    const inativado = await enviar('POST', `/cofre/segredos/${id}/inativacao`);
    expect(inativado.statusCode).toBe(200);
    expect(inativado.json()).toMatchObject({
      situacao: 'inativo',
      permite: { revelar: false, administrar: true },
    });
    expect(await auditoriaDaRequisicao(api, org, inativado)).toMatchObject([
      {
        acao: 'segredo.inativado',
        antes: { situacao: 'ativo' },
        depois: { situacao: 'inativo' },
      },
    ]);
    expect(await eventosGravados()).toHaveLength(1);
    expect(await nomesNaLista('bruno')).not.toContain('Senha do Wi-Fi visitantes');

    const repetida = await enviar('POST', `/cofre/segredos/${id}/inativacao`);
    expect(repetida.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, repetida)).toEqual([]);

    const reativado = await enviar('POST', `/cofre/segredos/${id}/reativacao`);
    expect(reativado.statusCode).toBe(200);
    expect(reativado.json().situacao).toBe('ativo');
    expect(await auditoriaDaRequisicao(api, org, reativado)).toMatchObject([
      { acao: 'segredo.reativado', antes: { situacao: 'inativo' }, depois: { situacao: 'ativo' } },
    ]);
    expect(await nomesNaLista('bruno')).toContain('Senha do Wi-Fi visitantes');
  });

  it('só quem administra o cofre inativa', async () => {
    const id = await segredoNovo();
    await mudarAcesso(id, [{ tipo: 'conta', id: cofre.contas.bruno.id }]);
    expect((await enviar('POST', `/cofre/segredos/${id}/inativacao`, 'bruno')).statusCode).toBe(
      403,
    );
  });
});
