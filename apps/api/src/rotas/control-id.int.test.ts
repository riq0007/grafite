// A saúde do Control iD no tipo de ativo pela API (spec saude-do-control-id, "Saúde do Control iD",
// catalogo-de-ativos, "Capacidades", e cofre-de-segredos, "Login do Control iD usado pelo coletor";
// change p2c-saude-do-control-id, design, decisão 2): o campo de IP, a porta e o login do cofre, as
// recusas, o campo de IP preso pela capacidade e a lista dos logins, com o Cofre ligado e desligado.
import { campos, naOrganizacao } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CofreDeTeste,
  ligarOCofre,
  montarCofre,
  mudarSituacaoDoSegredo,
  type UsuarioDoCofre,
} from '../../test/cofre.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  criarPerfil,
} from '../../test/integracao.ts';

const host = 'grafite.control-id.local';
const SENHA = 'senha-do-controle';

let api: ApiDeTeste;
let cofre: CofreDeTeste;
let org = '';
const ids: Record<string, string> = {};

/** Um campo da organização, direto no banco. */
async function criarCampo(rotulo: string, tipo: 'texto' | 'ip' = 'ip') {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [campo] = await tx
      .insert(campos)
      .values({ orgId: org, rotulo, rotuloNormalizado: normalizarTexto(rotulo), tipo })
      .returning({ id: campos.id });
    return campo?.id ?? '';
  });
}

const enviar = (metodo: 'POST' | 'PATCH', url: string, usuario: UsuarioDoCofre, pedido?: object) =>
  cofre.cliente.enviar(metodo, url, cofre.como(usuario), pedido);
const consultar = (url: string, usuario: UsuarioDoCofre = 'ana') =>
  cofre.cliente.consultar(url, cofre.como(usuario));

async function segredo(
  nome: string,
  {
    tipo = 'conta-administrativa',
    identificador = 'admin' as string | null,
  }: { tipo?: string; identificador?: string | null } = {},
) {
  const r = await enviar('POST', '/cofre/segredos', 'ana', {
    nome,
    tipo,
    classificacao: 'equipamento',
    ...(identificador === null ? {} : { identificador }),
    valor: SENHA,
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as string;
}

beforeAll(async () => {
  api = await abrirApi();
  cofre = await montarCofre(api, host);
  org = cofre.org;
  // Ana também administra o catálogo; Eva não.
  const catalogo = await criarPerfil(api, org, {
    nome: 'Catálogo',
    permissoes: ['catalogo.administrar'],
  });
  await atribuir(api, org, { perfilId: catalogo, contaId: cofre.contas.ana.id });
  ids.ip = await criarCampo('IP');
  ids.ipDaGerencia = await criarCampo('IP da gerência');
  ids.hostname = await criarCampo('Hostname', 'texto');
  ids.admin = await segredo('Admin dos controles');
  ids.portaria = await segredo('Portaria norte', { tipo: 'usuario-e-senha' });
  ids.semUsuario = await segredo('Sem usuário', { identificador: null });
  ids.comunidade = await segredo('Comunidade das impressoras', {
    tipo: 'comunidade-snmp',
    identificador: null,
  });
});

afterAll(async () => {
  await api?.fechar();
});

let nomes = 0;
const doControle = (configuracao: object) => ({ 'controlid.saude': configuracao });
const cadastrar = (configuracao: object, extras: object = {}) =>
  enviar('POST', '/tipos-de-ativo', 'ana', {
    nome: `Controle de acesso ${++nomes}`,
    icone: 'generico',
    capacidades: ['controlid.saude'],
    campos: [{ campoId: ids.ip }, { campoId: ids.ipDaGerencia }, { campoId: ids.hostname }],
    configuracaoDasCapacidades: doControle(configuracao),
    ...extras,
  });

describe('a saúde do Control iD no tipo', () => {
  it('a lista das capacidades diz que a saúde pede o IP, a porta e o login', async () => {
    const r = await consultar('/capacidades', 'eva');
    expect(
      r
        .json()
        .capacidades.find(
          (capacidade: { chave: string }) => capacidade.chave === 'controlid.saude',
        ),
    ).toEqual({
      chave: 'controlid.saude',
      nome: 'Saúde do Control iD',
      descricao: 'Confere, a cada 5 minutos, se o controle de acesso responde e aceita o login.',
      campos: [],
      configuracao: 'control-id',
    });
  });

  it('liga com o campo de IP, a porta e o login do cofre, com a escolha na auditoria', async () => {
    const r = await cadastrar({ campoDoIp: ids.ip, porta: 8080, segredoId: ids.admin });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().configuracaoDasCapacidades).toEqual(
      doControle({ campoDoIp: ids.ip, porta: 8080, segredoId: ids.admin }),
    );
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'tipo-de-ativo.criado',
        depois: {
          capacidades: ['controlid.saude'],
          controlId: { ip: 'IP', porta: 8080, login: 'Admin dos controles' },
        },
      },
    ]);
    expect(JSON.stringify(await auditoriaDaRequisicao(api, org, r))).not.toContain(SENHA);
  });

  it('sem a porta, vale a 80, e o login pode ser de Usuário e senha', async () => {
    const r = await cadastrar({ campoDoIp: ids.ipDaGerencia, segredoId: ids.portaria });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().configuracaoDasCapacidades).toEqual(
      doControle({ campoDoIp: ids.ipDaGerencia, porta: 80, segredoId: ids.portaria }),
    );
  });

  // O login do tipo é opcional (change login-de-cada-controle, design, decisão 1).
  it('liga sem o login, que fica nulo', async () => {
    const r = await cadastrar({ campoDoIp: ids.ip });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().configuracaoDasCapacidades).toEqual(
      doControle({ campoDoIp: ids.ip, porta: 80, segredoId: null }),
    );
  });

  it('recusa sem o campo, com a porta fora da faixa e com o segredo que não é um login', async () => {
    const recusa = async (configuracao: object) => {
      const r = await cadastrar(configuracao);
      expect(r.statusCode, r.body).toBe(400);
      return r.json().campos.configuracaoDasCapacidades as string;
    };
    expect(await recusa({ segredoId: ids.admin })).toBe(
      'Escolha o campo de IP que a sondagem usa.',
    );
    expect(await recusa({ campoDoIp: ids.ip, porta: 0, segredoId: ids.admin })).toBe(
      'Informe uma porta de 1 a 65535.',
    );
    const login =
      'Escolha um login ativo do cofre, do tipo Usuário e senha ou Conta administrativa, com o usuário preenchido.';
    expect(await recusa({ campoDoIp: ids.ip, segredoId: ids.semUsuario })).toBe(login);
    expect(await recusa({ campoDoIp: ids.ip, segredoId: ids.comunidade })).toBe(login);
    expect(
      await recusa({ campoDoIp: ids.ip, segredoId: '0199a6e0-0000-7000-8000-00000000ffff' }),
    ).toBe(login);
  });

  it('recusa o login inativo ao escolhê-lo, e o já escolhido fica mesmo inativo', async () => {
    const tipo = await cadastrar({ campoDoIp: ids.ip, segredoId: ids.portaria });
    expect(tipo.statusCode, tipo.body).toBe(201);
    await mudarSituacaoDoSegredo(api, org, ids.portaria ?? '', 'inativo');
    try {
      const nova = await cadastrar({ campoDoIp: ids.ip, segredoId: ids.portaria });
      expect(nova.json().campos).toEqual({
        configuracaoDasCapacidades:
          'Escolha um login ativo do cofre, do tipo Usuário e senha ou Conta administrativa, com o usuário preenchido.',
      });
      const renomeado = await enviar('PATCH', `/tipos-de-ativo/${tipo.json().id}`, 'ana', {
        nome: 'Controle renomeado',
      });
      expect(renomeado.statusCode, renomeado.body).toBe(200);
      expect(renomeado.json().configuracaoDasCapacidades['controlid.saude'].segredoId).toBe(
        ids.portaria,
      );
    } finally {
      await mudarSituacaoDoSegredo(api, org, ids.portaria ?? '', 'ativo');
    }
  });

  it('com o Cofre desligado, o login escolhido fica, e trocar por outro espera o módulo', async () => {
    const tipo = await cadastrar({ campoDoIp: ids.ip, segredoId: ids.admin });
    await ligarOCofre(api, org, false);
    try {
      const url = `/tipos-de-ativo/${tipo.json().id}`;
      const mesmo = await enviar('PATCH', url, 'ana', {
        configuracaoDasCapacidades: doControle({
          campoDoIp: ids.ipDaGerencia,
          porta: 8080,
          segredoId: ids.admin,
        }),
      });
      expect(mesmo.statusCode, mesmo.body).toBe(200);
      const outro = await enviar('PATCH', url, 'ana', {
        configuracaoDasCapacidades: doControle({ campoDoIp: ids.ip, segredoId: ids.portaria }),
      });
      expect(outro.statusCode).toBe(400);
      expect(outro.json().campos).toEqual({
        configuracaoDasCapacidades:
          'Com o módulo Cofre desligado, a escolha de outro login espera o módulo ser ligado.',
      });
    } finally {
      await ligarOCofre(api, org, true);
    }
  });

  it('o campo que é o IP da sondagem não sai do tipo nem é inativado', async () => {
    const tipo = await cadastrar(
      { campoDoIp: ids.ipDaGerencia, segredoId: ids.admin },
      { campos: [{ campoId: ids.ipDaGerencia }, { campoId: ids.hostname }] },
    );
    expect(tipo.statusCode, tipo.body).toBe(201);
    const semOIp = await enviar('PATCH', `/tipos-de-ativo/${tipo.json().id}`, 'ana', {
      campos: [{ campoId: ids.hostname }],
    });
    expect(semOIp.json().campos).toEqual({
      campos:
        'O campo IP da gerência é o IP da saúde do Control iD neste tipo: escolha outro antes de tirá-lo.',
    });
    const inativar = await enviar('POST', `/campos/${ids.ipDaGerencia}/inativacao`, 'ana');
    expect(inativar.statusCode).toBe(409);
    expect(inativar.json().detail).toMatch(
      /^O campo IP da gerência é o IP (da saúde do Control iD|dos suprimentos e contadores|da disponibilidade) em \d+ tipos?: escolha outro campo/,
    );
  });
});

describe('os logins do Control iD no cofre', () => {
  it('quem administra o catálogo vê o id e o nome dos logins que servem, sem o usuário nem a senha', async () => {
    const r = await consultar('/catalogo/logins-do-control-id');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      logins: [
        { id: ids.admin, nome: 'Admin dos controles' },
        { id: ids.portaria, nome: 'Portaria norte' },
      ],
      motivo: null,
    });
    expect(r.body).not.toContain('admin"');
    expect(r.body).not.toContain(SENHA);
  });

  it('o login inativo sai da lista', async () => {
    await mudarSituacaoDoSegredo(api, org, ids.portaria ?? '', 'inativo');
    try {
      expect((await consultar('/catalogo/logins-do-control-id')).json().logins).toEqual([
        { id: ids.admin, nome: 'Admin dos controles' },
      ]);
    } finally {
      await mudarSituacaoDoSegredo(api, org, ids.portaria ?? '', 'ativo');
    }
  });

  it('sem catalogo.administrar, a lista é recusada', async () => {
    expect((await consultar('/catalogo/logins-do-control-id', 'eva')).statusCode).toBe(403);
  });

  it('com o Cofre desligado, a lista vem vazia, com o motivo', async () => {
    await ligarOCofre(api, org, false);
    try {
      expect((await consultar('/catalogo/logins-do-control-id')).json()).toEqual({
        logins: [],
        motivo:
          'Com o módulo Cofre desligado, o login escolhido continua, e a escolha de outro espera o módulo ser ligado.',
      });
    } finally {
      await ligarOCofre(api, org, true);
    }
  });
});
