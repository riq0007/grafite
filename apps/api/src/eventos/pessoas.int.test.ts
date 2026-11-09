// O evento das pessoas (spec eventos-em-tempo-real; design do F2c, decisão 9): toda escrita de uma
// pessoa ou da conta dela grava pessoas.mudaram com a pessoa no alvo, os locais de trabalho de antes
// e de depois e a conta da pessoa no público, pela administração, pela própria conta e pelo comando
// no servidor.
import { eventos, naOrganizacao } from '@grafite/db';
import { asc } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  type Entrada,
} from '../../test/integracao.ts';
import { criarConta as criarContaPeloComando } from '../comando/conta.ts';

const host = 'grafite.eventos-das-pessoas.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
let ana: Entrada;
const ids: Record<string, string> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', tipo: 'setor' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  const conta = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administrador, contaId: conta.id });
  ana = await cliente.entrar('ana');
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const gravados = (tipo = 'pessoas.mudaram') =>
  naOrganizacao(api.banco, org, async (tx) =>
    (await tx.select().from(eventos).orderBy(asc(eventos.id))).filter((e) => e.tipo === tipo),
  );

describe('pessoas.mudaram', () => {
  it('a pessoa cadastrada leva o local de trabalho dela', async () => {
    const r = await cliente.enviar('POST', '/pessoas', ana, {
      nome: 'João da Silva',
      localId: ids.expedicao,
    });
    expect(r.statusCode).toBe(201);
    expect(await gravados()).toMatchObject([
      {
        alvoTipo: 'pessoa',
        alvoId: r.json().id,
        permissao: 'pessoas.ver',
        locais: [ids.expedicao],
        contas: null,
      },
    ]);
  });

  it('a pessoa sem local de trabalho leva o local nulo, que só a organização inteira alcança', async () => {
    const r = await cliente.enviar('POST', '/pessoas', ana, { nome: 'Fábio Mendes' });
    expect(await gravados()).toMatchObject([{ alvoId: r.json().id, locais: [null] }]);
  });

  it('a mudança do local de trabalho leva o local de antes e o de depois', async () => {
    const pessoa = await criarPessoa(api, org, { nome: 'Carla Dias', localId: ids.expedicao });
    const r = await cliente.enviar('PATCH', `/pessoas/${pessoa}`, ana, { localId: ids.campinas });
    expect(r.statusCode).toBe(200);
    expect(await gravados()).toMatchObject([
      { alvoId: pessoa, locais: [ids.expedicao, ids.campinas] },
    ]);
  });

  it('a edição que não muda o local leva o local uma vez', async () => {
    const pessoa = await criarPessoa(api, org, { nome: 'Davi Rocha', localId: ids.campinas });
    await cliente.enviar('PATCH', `/pessoas/${pessoa}`, ana, { telefone: '2040' });
    expect(await gravados()).toMatchObject([{ alvoId: pessoa, locais: [ids.campinas] }]);
  });

  it('a conta criada pela administração põe a conta da pessoa no público', async () => {
    const pessoa = await criarPessoa(api, org, { nome: 'Érica Lima', localId: ids.campinas });
    const r = await cliente.enviar('POST', `/pessoas/${pessoa}/conta`, ana, {
      usuario: 'erica.lima',
      exigeDoisPassos: false,
    });
    expect(r.statusCode).toBe(201);
    expect(await gravados()).toMatchObject([
      {
        alvoTipo: 'pessoa',
        alvoId: pessoa,
        locais: [ids.campinas],
        contas: [r.json().conta.id],
      },
    ]);
  });

  it('a inativação da conta leva o evento da pessoa e o fim de cada sessão', async () => {
    const conta = await criarConta(api, org, {
      usuario: 'gustavo',
      nome: 'Gustavo Alves',
      localId: ids.expedicao,
    });
    await cliente.entrar('gustavo');
    const r = await cliente.enviar('POST', `/contas/${conta.id}/inativacao`, ana);
    expect(r.statusCode).toBe(200);
    expect(await gravados()).toMatchObject([
      { alvoId: conta.pessoaId, locais: [ids.expedicao], contas: [conta.id] },
    ]);
    expect(await gravados('sessao.encerrada')).toHaveLength(1);
  });

  it('a troca da própria senha leva o evento da pessoa, com a própria conta', async () => {
    const conta = await criarConta(api, org, {
      usuario: 'helena',
      nome: 'Helena Prado',
      localId: ids.campinas,
    });
    const helena = await cliente.entrar('helena');
    const r = await cliente.enviar('PUT', '/conta/senha', helena, {
      senhaAtual: 'cavalo bateria grampo correto',
      senhaNova: 'jabuticaba azul no quintal',
    });
    expect(r.statusCode).toBe(200);
    expect(await gravados()).toMatchObject([
      { alvoTipo: 'pessoa', alvoId: conta.pessoaId, locais: [ids.campinas], contas: [conta.id] },
    ]);
  });

  it('a conta criada pelo comando no servidor leva o evento da pessoa e o da conta', async () => {
    await criarContaPeloComando(api.banco, api.relogio.agora, {
      endereco: host,
      pessoa: 'Igor Nunes',
      usuario: 'igor.nunes',
      exigirDoisPassos: false,
      administrador: false,
    });
    const [pessoa, conta] = await gravados();
    expect(pessoa).toMatchObject({ alvoTipo: 'pessoa', locais: [null], contas: null });
    expect(conta).toMatchObject({ alvoTipo: 'pessoa', alvoId: pessoa?.alvoId, locais: [null] });
    expect(conta?.contas).toHaveLength(1);
  });
});
