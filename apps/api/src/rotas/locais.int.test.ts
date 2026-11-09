// Os locais pela API (spec locais): a árvore lida por toda sessão ativa, com o que a conta pode
// alterar em cada local, e as mudanças com a permissão no ramo, os 8 níveis, o nome único entre
// irmãos e a auditoria de cada uma.
import { locais, naOrganizacao } from '@grafite/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.locais.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const ids: Record<string, string> = {};
const entradas: Record<string, Entrada> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);

  // Jundiaí › Administrativo, Jundiaí › Expedição › Doca 3 (inativa) e Campinas.
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.administrativo = await criarLocal(api, org, {
    nome: 'Administrativo',
    tipo: 'predio',
    paiId: ids.jundiai,
  });
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: ids.jundiai });
  ids.doca = await criarLocal(api, org, {
    nome: 'Doca 3',
    paiId: ids.expedicao,
    situacao: 'inativo',
  });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });

  const administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  const tecnico = await criarPerfil(api, org, { nome: 'Técnico', permissoes: ['locais.editar'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administrador, contaId: ana.id });
  ids.ana = ana.id;
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: tecnico, contaId: bruno.id, localId: ids.jundiai });
  ids.bruno = bruno.id;
  ids.tecnico = tecnico;
  ids.davi = (await criarConta(api, org, { usuario: 'davi', nome: 'Davi Rocha' })).id;
  await criarConta(api, org, { usuario: 'eva', senhaTemporaria: true });

  for (const usuario of ['ana', 'bruno', 'davi', 'eva']) {
    entradas[usuario] = await cliente.entrar(usuario);
  }
});

afterAll(async () => {
  await api?.fechar();
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

async function arvore(usuario: string) {
  const r = await cliente.consultar('/locais', como(usuario));
  expect(r.statusCode).toBe(200);
  const corpo = r.json() as {
    locais: { id: string; permite: { editar: boolean } }[];
    permite: { cadastrarNaRaiz: boolean };
  };
  const editaveis = (id: string) => corpo.locais.find((local) => local.id === id)?.permite.editar;
  return { corpo, editaveis };
}

const cadastrar = (usuario: string, pedido: object) =>
  cliente.enviar('POST', '/locais', como(usuario), pedido);

describe('GET /locais', () => {
  it('serve a árvore inteira a qualquer sessão ativa, com os inativos marcados', async () => {
    const { corpo, editaveis } = await arvore('davi');
    expect(corpo.locais).toEqual(
      expect.arrayContaining([
        {
          id: ids.jundiai,
          paiId: null,
          nome: 'Jundiaí',
          tipo: 'unidade',
          situacao: 'ativo',
          permite: { editar: false },
        },
        {
          id: ids.doca,
          paiId: ids.expedicao,
          nome: 'Doca 3',
          tipo: 'setor',
          situacao: 'inativo',
          permite: { editar: false },
        },
      ]),
    );
    expect(corpo.locais).toHaveLength(5);
    expect(editaveis(ids.campinas ?? '')).toBe(false);
    expect(corpo.permite).toEqual({ cadastrarNaRaiz: false });
  });

  it('diz em cada local se a conta pode alterá-lo, pelo ramo da atribuição', async () => {
    const bruno = await arvore('bruno');
    for (const id of [ids.jundiai, ids.administrativo, ids.expedicao, ids.doca]) {
      expect(bruno.editaveis(id ?? '')).toBe(true);
    }
    expect(bruno.editaveis(ids.campinas ?? '')).toBe(false);
    expect(bruno.corpo.permite).toEqual({ cadastrarNaRaiz: false });

    const ana = await arvore('ana');
    expect(ana.editaveis(ids.campinas ?? '')).toBe(true);
    expect(ana.corpo.permite).toEqual({ cadastrarNaRaiz: true });
  });

  it('exige a sessão ativa', async () => {
    expect((await cliente.consultar('/locais', SEM_ENTRADA)).statusCode).toBe(401);
    const pendente = await cliente.consultar('/locais', como('eva'));
    expect(pendente.json().type).toBe('urn:grafite:problema:pendencia');
  });
});

describe('POST /locais', () => {
  it('cadastra na raiz só com a permissão para a organização inteira', async () => {
    const recusado = await cadastrar('bruno', { nome: 'Sorocaba', tipo: 'unidade', paiId: null });
    expect(recusado.statusCode).toBe(403);
    expect(recusado.json().type).toBe('urn:grafite:problema:sem-permissao');

    const r = await cadastrar('ana', { nome: '  Sorocaba ', tipo: 'unidade', paiId: null });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({
      id: expect.any(String),
      paiId: null,
      nome: 'Sorocaba',
      tipo: 'unidade',
      situacao: 'ativo',
      permite: { editar: true },
    });
  });

  it('cadastra dentro do ramo em que a conta pode alterar os locais', async () => {
    const r = await cadastrar('bruno', {
      nome: 'Sala 14',
      tipo: 'sala',
      paiId: ids.administrativo,
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ paiId: ids.administrativo, nome: 'Sala 14' });
  });

  it('recusa fora do ramo, sem cadastrar nada, e registra a recusa', async () => {
    const r = await cadastrar('bruno', { nome: 'Portaria', tipo: 'outro', paiId: ids.campinas });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:sem-permissao',
      detail: 'Você não tem permissão para cadastrar, renomear, mover, inativar e reativar locais.',
      administradores: ['Ana Souza'],
    });
    const dentro = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select()
        .from(locais)
        .where(eq(locais.paiId, ids.campinas ?? '')),
    );
    expect(dentro).toEqual([]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'permissao.recusada', atorContaId: ids.bruno },
    ]);
  });

  it('recusa a conta sem a permissão em escopo nenhum', async () => {
    const r = await cadastrar('davi', { nome: 'Guarita', tipo: 'outro', paiId: null });
    expect(r.statusCode).toBe(403);
  });

  it('recusa o 9º nível', async () => {
    let paiId: string | null = null;
    for (let nivel = 1; nivel <= 8; nivel += 1) {
      const r = await cadastrar('ana', { nome: `Nível ${nivel}`, tipo: 'outro', paiId });
      expect(r.statusCode).toBe(201);
      paiId = r.json().id;
    }
    const nono = await cadastrar('ana', { nome: 'Nível 9', tipo: 'outro', paiId });
    expect(nono.statusCode).toBe(409);
    expect(nono.json()).toMatchObject({
      type: 'urn:grafite:problema:conflito',
      detail: 'A árvore de locais tem no máximo 8 níveis.',
    });
  });

  it('recusa o nome repetido entre irmãos, sem acento nem maiúsculas, também na raiz', async () => {
    for (const pedido of [
      { nome: ' expedicao ', tipo: 'setor', paiId: ids.jundiai },
      { nome: 'CAMPINAS', tipo: 'unidade', paiId: null },
    ]) {
      const r = await cadastrar('ana', pedido);
      expect(r.statusCode).toBe(409);
      expect(r.json()).toMatchObject({
        type: 'urn:grafite:problema:conflito',
        detail: 'Já existe um local com este nome aqui.',
        campos: { nome: 'Já existe um local com este nome aqui.' },
      });
    }
  });

  it('aceita o mesmo nome em lugares diferentes da árvore', async () => {
    for (const paiId of [ids.administrativo, ids.expedicao]) {
      expect(
        (await cadastrar('ana', { nome: 'Almoxarifado', tipo: 'sala', paiId })).statusCode,
      ).toBe(201);
    }
  });

  it('recusa cadastrar dentro de um local inativo ou que não existe', async () => {
    const inativo = await cadastrar('ana', { nome: 'Box 1', tipo: 'outro', paiId: ids.doca });
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json()).toMatchObject({
      type: 'urn:grafite:problema:local-pai-inativo',
      detail: 'O local escolhido está inativo. Escolha um local ativo.',
    });
    const inexistente = await cadastrar('ana', {
      nome: 'Box 1',
      tipo: 'outro',
      paiId: '0199a000-0000-7000-8000-000000000000',
    });
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.json().detail).toBe('Local não encontrado.');
  });

  it('recusa o pedido com nome vazio ou tipo fora da lista', async () => {
    const semNome = await cadastrar('ana', { nome: '  ', tipo: 'sala', paiId: null });
    expect(semNome.statusCode).toBe(400);
    expect(semNome.json().campos).toEqual({ nome: 'Informe o nome do local.' });
    const tipo = await cadastrar('ana', { nome: 'Galpão', tipo: 'galpao', paiId: null });
    expect(tipo.statusCode).toBe(400);
    expect(tipo.json().campos).toEqual({ tipo: 'Escolha o tipo do local.' });
  });

  it('registra o cadastro na auditoria, com o caminho', async () => {
    const r = await cadastrar('ana', { nome: 'Portaria', tipo: 'outro', paiId: ids.jundiai });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'local.criado',
        atorTipo: 'conta',
        atorContaId: ids.ana,
        alvoTipo: 'local',
        alvoId: r.json().id,
        antes: null,
        depois: {
          nome: 'Portaria',
          tipo: 'outro',
          paiId: ids.jundiai,
          caminho: 'Jundiaí › Portaria',
          situacao: 'ativo',
        },
      },
    ]);
  });
});

/** Um local direto no banco, para os casos das mudanças. */
const local = (
  nome: string,
  paiId: string | null = null,
  situacao: 'ativo' | 'inativo' = 'ativo',
) => criarLocal(api, org, { nome, paiId, situacao, tipo: 'outro' });

const alterar = (usuario: string, id: string, pedido: object) =>
  cliente.enviar('PATCH', `/locais/${id}`, como(usuario), pedido);

const mover = (usuario: string, id: string, paiId: string | null) =>
  cliente.enviar('POST', `/locais/${id}/movimento`, como(usuario), { paiId });

const inativar = (usuario: string, id: string) =>
  cliente.enviar('POST', `/locais/${id}/inativacao`, como(usuario));

const reativar = (usuario: string, id: string) =>
  cliente.enviar('POST', `/locais/${id}/reativacao`, como(usuario));

async function paiDe(id: string) {
  const [linha] = await naOrganizacao(api.banco, org, (tx) =>
    tx.select({ paiId: locais.paiId }).from(locais).where(eq(locais.id, id)),
  );
  return linha?.paiId;
}

describe('PATCH /locais/:id', () => {
  it('renomeia e muda o tipo, com o antes → depois na auditoria', async () => {
    const almox = await local('Almox', ids.jundiai);
    const r = await alterar('ana', almox, { nome: 'Almoxarifado central', tipo: 'sala' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      id: almox,
      paiId: ids.jundiai,
      nome: 'Almoxarifado central',
      tipo: 'sala',
      situacao: 'ativo',
      permite: { editar: true },
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'local.alterado',
        alvoTipo: 'local',
        alvoId: almox,
        antes: { nome: 'Almox', tipo: 'outro', caminho: 'Jundiaí › Almox' },
        depois: {
          nome: 'Almoxarifado central',
          tipo: 'sala',
          caminho: 'Jundiaí › Almoxarifado central',
        },
      },
    ]);
  });

  it('recusa o nome que já existe entre os irmãos', async () => {
    const guarita = await local('Guarita', ids.jundiai);
    const r = await alterar('ana', guarita, { nome: 'ADMINISTRATIVO' });
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({ nome: 'Já existe um local com este nome aqui.' });
  });

  it('exige a permissão no local', async () => {
    const emCampinas = await local('Recepção de Campinas', ids.campinas);
    expect((await alterar('bruno', emCampinas, { nome: 'Recepção' })).statusCode).toBe(403);
    const emJundiai = await local('Sala de reunião', ids.administrativo);
    expect((await alterar('bruno', emJundiai, { tipo: 'sala' })).statusCode).toBe(200);
  });

  it('responde 404 ao local que não existe', async () => {
    const r = await alterar('ana', '0199a000-0000-7000-8000-000000000000', { nome: 'X' });
    expect(r.statusCode).toBe(404);
  });
});

describe('POST /locais/:id/movimento', () => {
  it('move o local com tudo o que está dentro dele', async () => {
    const predio = await local('Prédio A', ids.jundiai);
    const fabrica = await local('Fábrica', ids.jundiai);
    const andar = await local('1º andar', predio);
    const sala = await local('Sala 12', andar);
    const r = await mover('ana', andar, fabrica);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id: andar, paiId: fabrica });
    expect(await paiDe(andar)).toBe(fabrica);
    expect(await paiDe(sala)).toBe(andar);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'local.movido',
        alvoId: andar,
        antes: { paiId: predio, caminho: 'Jundiaí › Prédio A › 1º andar' },
        depois: { paiId: fabrica, caminho: 'Jundiaí › Fábrica › 1º andar' },
      },
    ]);
  });

  it('recusa o ciclo, sem mudar a árvore', async () => {
    const r = await mover('ana', ids.jundiai ?? '', ids.expedicao ?? '');
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe('Um local não pode ficar dentro dele mesmo.');
    expect(await paiDe(ids.jundiai ?? '')).toBeNull();
  });

  it('exige a permissão no local e no destino', async () => {
    const deJundiai = await local('Arquivo', ids.jundiai);
    const deCampinas = await local('Arquivo morto', ids.campinas);
    expect((await mover('bruno', deJundiai, ids.campinas ?? '')).statusCode).toBe(403);
    expect((await mover('bruno', deCampinas, ids.jundiai ?? '')).statusCode).toBe(403);
    expect((await mover('bruno', deJundiai, null)).statusCode).toBe(403);
    expect(await paiDe(deJundiai)).toBe(ids.jundiai);
    expect((await mover('bruno', deJundiai, ids.administrativo ?? '')).statusCode).toBe(200);
  });

  it('recusa o destino inativo, o nome repetido e os níveis demais', async () => {
    const caixa = await local('Caixa', ids.jundiai);
    const inativo = await mover('ana', caixa, ids.doca ?? '');
    expect(inativo.json()).toMatchObject({
      type: 'urn:grafite:problema:local-pai-inativo',
      detail: 'O local escolhido está inativo. Escolha um local ativo.',
    });

    await local('Caixa', ids.campinas);
    const repetido = await mover('ana', caixa, ids.campinas ?? '');
    expect(repetido.json().campos).toEqual({ nome: 'Já existe um local com este nome aqui.' });

    let fundo: string | null = null;
    for (let nivel = 1; nivel <= 6; nivel += 1) fundo = await local(`Fundo ${nivel}`, fundo);
    const x = await local('Ramo X');
    const y = await local('Ramo Y', x);
    await local('Ramo Z', y);
    const demais = await mover('ana', x, fundo);
    expect(demais.statusCode).toBe(409);
    expect(demais.json().detail).toBe('A árvore de locais tem no máximo 8 níveis.');
    expect((await mover('ana', y, fundo)).statusCode).toBe(200);
  });
});

describe('inativação e reativação', () => {
  it('inativa o local de que nada ativo depende e o reativa, com a auditoria', async () => {
    const deposito = await local('Depósito', ids.campinas);
    const inativado = await inativar('ana', deposito);
    expect(inativado.statusCode).toBe(200);
    expect(inativado.json()).toMatchObject({ id: deposito, situacao: 'inativo' });
    expect(await auditoriaDaRequisicao(api, org, inativado)).toMatchObject([
      {
        acao: 'local.inativado',
        alvoId: deposito,
        antes: { situacao: 'ativo' },
        depois: { situacao: 'inativo', caminho: 'Campinas › Depósito' },
      },
    ]);
    const reativado = await reativar('ana', deposito);
    expect(reativado.json()).toMatchObject({ situacao: 'ativo' });
    expect(await auditoriaDaRequisicao(api, org, reativado)).toMatchObject([
      { acao: 'local.reativado', antes: { situacao: 'inativo' }, depois: { situacao: 'ativo' } },
    ]);
  });

  it('recusa inativar com um local ativo dentro, dizendo o motivo', async () => {
    const bloco = await local('Bloco B', ids.campinas);
    const sala = await local('Sala B1', bloco);
    const r = await inativar('ana', bloco);
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:local-em-uso',
      detail: 'Há 1 local ativo dentro deste. Inative ou mova-o antes.',
    });
    expect((await inativar('ana', sala)).statusCode).toBe(200);
    expect((await inativar('ana', bloco)).statusCode).toBe(200);
  });

  it('recusa inativar com pessoas ativas no local', async () => {
    const recepcao = await local('Recepção', ids.campinas);
    for (const nome of ['Gabriela', 'Heitor', 'Iara']) {
      await criarPessoa(api, org, { nome, localId: recepcao });
    }
    await criarPessoa(api, org, { nome: 'Joana', localId: recepcao, situacao: 'inativa' });
    const r = await inativar('ana', recepcao);
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe(
      'Há 3 pessoas ativas com o local de trabalho aqui. Mude o local delas antes.',
    );
  });

  it('recusa inativar com atribuição de perfil em vigor no local', async () => {
    const laboratorio = await local('Laboratório', ids.campinas);
    const encerrada = await atribuir(api, org, {
      perfilId: ids.tecnico ?? '',
      contaId: ids.davi ?? '',
      localId: laboratorio,
    });
    await naOrganizacao(api.banco, org, (tx) =>
      tx.execute(sql`update atribuicoes set encerrada_em = now() where id = ${encerrada}`),
    );
    await atribuir(api, org, {
      perfilId: ids.tecnico ?? '',
      contaId: ids.davi ?? '',
      localId: laboratorio,
    });
    const r = await inativar('ana', laboratorio);
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe(
      'Há 1 atribuição de perfil em vigor neste local. Encerre-a antes.',
    );
  });

  it('diz todos os motivos juntos', async () => {
    const galpao = await local('Galpão', ids.campinas);
    await local('Mezanino', galpao);
    await local('Doca 1', galpao);
    await criarPessoa(api, org, { nome: 'Lucas', localId: galpao });
    const r = await inativar('ana', galpao);
    expect(r.json().detail).toBe(
      'Há 2 locais ativos dentro deste. Inative ou mova-os antes. ' +
        'Há 1 pessoa ativa com o local de trabalho aqui. Mude o local dela antes.',
    );
  });

  it('recusa reativar dentro de um local inativo', async () => {
    const andar = await local('2º andar', ids.campinas, 'inativo');
    const sala = await local('Sala 21', andar, 'inativo');
    const r = await reativar('ana', sala);
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:local-pai-inativo',
      detail: 'Reative antes o local onde este fica.',
    });
  });

  it('exige a permissão no local', async () => {
    const copa = await local('Copa', ids.campinas);
    expect((await inativar('bruno', copa)).statusCode).toBe(403);
    const cozinha = await local('Cozinha', ids.expedicao);
    expect((await inativar('bruno', cozinha)).statusCode).toBe(200);
    expect((await reativar('bruno', cozinha)).statusCode).toBe(200);
  });
});
