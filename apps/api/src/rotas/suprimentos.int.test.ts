// Os suprimentos e contadores no tipo de ativo pela API (spec impressoras-por-snmp, "Suprimentos e
// contadores", catalogo-de-ativos, "Capacidades", e cofre-de-segredos, "Comunidade SNMP usada pelo
// coletor"; change p2b-impressoras-por-snmp, design, decisão 3): o campo de IP, a versão e a
// comunidade do cofre, as recusas, o campo de IP preso pela capacidade e a lista das comunidades,
// com o Cofre ligado e desligado.
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

const host = 'grafite.suprimentos.local';

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

async function segredo(nome: string, tipo = 'comunidade-snmp') {
  const r = await enviar('POST', '/cofre/segredos', 'ana', {
    nome,
    tipo,
    classificacao: 'equipamento',
    valor: 'comunidade-secreta',
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
  ids.comunidade = await segredo('Comunidade das impressoras');
  ids.outra = await segredo('Comunidade do CPD');
  ids.daConta = await segredo('Console do switch', 'conta-administrativa');
});

afterAll(async () => {
  await api?.fechar();
});

let nomes = 0;
const doSnmp = (configuracao: object) => ({ 'snmp.suprimentos': configuracao });
const cadastrar = (configuracao: object, extras: object = {}) =>
  enviar('POST', '/tipos-de-ativo', 'ana', {
    nome: `Impressora ${++nomes}`,
    icone: 'impressora',
    capacidades: ['snmp.suprimentos'],
    campos: [{ campoId: ids.ip }, { campoId: ids.ipDaGerencia }, { campoId: ids.hostname }],
    configuracaoDasCapacidades: doSnmp(configuracao),
    ...extras,
  });

describe('os suprimentos e contadores no tipo', () => {
  it('a lista das capacidades diz que os suprimentos pedem o IP, a versão e a comunidade', async () => {
    const r = await consultar('/capacidades', 'eva');
    expect(
      r
        .json()
        .capacidades.find(
          (capacidade: { chave: string }) => capacidade.chave === 'snmp.suprimentos',
        ),
    ).toEqual({
      chave: 'snmp.suprimentos',
      nome: 'Suprimentos e contadores',
      descricao:
        'Lê por SNMP, a cada 10 minutos, os suprimentos, os contadores e as condições da impressora.',
      campos: [],
      configuracao: 'snmp',
    });
  });

  it('liga com o campo de IP, a versão e a comunidade do cofre, com a escolha na auditoria', async () => {
    const r = await cadastrar({ campoDoIp: ids.ip, versao: '1', segredoId: ids.comunidade });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().configuracaoDasCapacidades).toEqual(
      doSnmp({ campoDoIp: ids.ip, versao: '1', segredoId: ids.comunidade }),
    );
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'tipo-de-ativo.criado',
        depois: {
          capacidades: ['snmp.suprimentos'],
          suprimentos: { ip: 'IP', versao: '1', comunidade: 'Comunidade das impressoras' },
        },
      },
    ]);
  });

  it('sem a versão e sem a comunidade, vale a 2c e a public', async () => {
    const r = await cadastrar({ campoDoIp: ids.ipDaGerencia });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().configuracaoDasCapacidades).toEqual(
      doSnmp({ campoDoIp: ids.ipDaGerencia, versao: '2c', segredoId: null }),
    );
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { depois: { suprimentos: { ip: 'IP da gerência', versao: '2c', comunidade: 'public' } } },
    ]);
  });

  it('recusa sem o campo, com um campo que não é IP, e o segredo de outro tipo ou que não existe', async () => {
    const recusa = async (configuracao: object) => {
      const r = await cadastrar(configuracao);
      expect(r.statusCode).toBe(400);
      return r.json().campos.configuracaoDasCapacidades as string;
    };
    expect(await recusa({ versao: '2c' })).toBe('Escolha o campo de IP que o SNMP usa.');
    expect(await recusa({ campoDoIp: ids.hostname })).toBe('O campo Hostname não é do tipo IP.');
    const comunidade = 'Escolha uma comunidade SNMP ativa do cofre.';
    expect(await recusa({ campoDoIp: ids.ip, segredoId: ids.daConta })).toBe(comunidade);
    expect(
      await recusa({ campoDoIp: ids.ip, segredoId: '0199a6e0-0000-7000-8000-00000000ffff' }),
    ).toBe(comunidade);
  });

  it('recusa a comunidade inativa ao escolhê-la, e a já escolhida fica mesmo inativa', async () => {
    const tipo = await cadastrar({ campoDoIp: ids.ip, segredoId: ids.outra });
    expect(tipo.statusCode).toBe(201);
    await mudarSituacaoDoSegredo(api, org, ids.outra ?? '', 'inativo');
    try {
      const nova = await cadastrar({ campoDoIp: ids.ip, segredoId: ids.outra });
      expect(nova.json().campos).toEqual({
        configuracaoDasCapacidades: 'Escolha uma comunidade SNMP ativa do cofre.',
      });
      const renomeado = await enviar('PATCH', `/tipos-de-ativo/${tipo.json().id}`, 'ana', {
        nome: 'Impressora renomeada',
      });
      expect(renomeado.statusCode, renomeado.body).toBe(200);
      expect(renomeado.json().configuracaoDasCapacidades['snmp.suprimentos'].segredoId).toBe(
        ids.outra,
      );
    } finally {
      await mudarSituacaoDoSegredo(api, org, ids.outra ?? '', 'ativo');
    }
  });

  it('com o Cofre desligado, a comunidade escolhida fica, e trocar por outra espera o módulo', async () => {
    const tipo = await cadastrar({ campoDoIp: ids.ip, segredoId: ids.comunidade });
    await ligarOCofre(api, org, false);
    try {
      const url = `/tipos-de-ativo/${tipo.json().id}`;
      const mesma = await enviar('PATCH', url, 'ana', {
        configuracaoDasCapacidades: doSnmp({
          campoDoIp: ids.ipDaGerencia,
          versao: '2c',
          segredoId: ids.comunidade,
        }),
      });
      expect(mesma.statusCode, mesma.body).toBe(200);
      const outra = await enviar('PATCH', url, 'ana', {
        configuracaoDasCapacidades: doSnmp({ campoDoIp: ids.ip, segredoId: ids.outra }),
      });
      expect(outra.statusCode).toBe(400);
      expect(outra.json().campos).toEqual({
        configuracaoDasCapacidades:
          'Com o módulo Cofre desligado, a escolha de outra comunidade espera o módulo ser ligado.',
      });
    } finally {
      await ligarOCofre(api, org, true);
    }
  });

  it('o campo que é o IP dos suprimentos não sai do tipo nem é inativado', async () => {
    const tipo = await cadastrar(
      { campoDoIp: ids.ipDaGerencia },
      { campos: [{ campoId: ids.ipDaGerencia }, { campoId: ids.hostname }] },
    );
    expect(tipo.statusCode, tipo.body).toBe(201);
    const semOIp = await enviar('PATCH', `/tipos-de-ativo/${tipo.json().id}`, 'ana', {
      campos: [{ campoId: ids.hostname }],
    });
    expect(semOIp.json().campos).toEqual({
      campos:
        'O campo IP da gerência é o IP dos suprimentos e contadores neste tipo: escolha outro antes de tirá-lo.',
    });
    const inativar = await enviar('POST', `/campos/${ids.ipDaGerencia}/inativacao`, 'ana');
    expect(inativar.statusCode).toBe(409);
    expect(inativar.json().detail).toMatch(
      /^O campo IP da gerência é o IP dos suprimentos e contadores em \d+ tipos?: escolha outro campo/,
    );
  });
});

describe('as comunidades SNMP do cofre', () => {
  it('quem administra o catálogo vê o id e o nome das comunidades ativas, sem o valor', async () => {
    await mudarSituacaoDoSegredo(api, org, ids.outra ?? '', 'inativo');
    try {
      const r = await consultar('/catalogo/comunidades-snmp');
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({
        comunidades: [{ id: ids.comunidade, nome: 'Comunidade das impressoras' }],
        motivo: null,
      });
      expect(r.body).not.toContain('comunidade-secreta');
    } finally {
      await mudarSituacaoDoSegredo(api, org, ids.outra ?? '', 'ativo');
    }
  });

  it('sem catalogo.administrar, a lista é recusada', async () => {
    expect((await consultar('/catalogo/comunidades-snmp', 'eva')).statusCode).toBe(403);
  });

  it('com o Cofre desligado, a lista vem vazia, com o motivo', async () => {
    await ligarOCofre(api, org, false);
    try {
      expect((await consultar('/catalogo/comunidades-snmp')).json()).toEqual({
        comunidades: [],
        motivo:
          'Com o módulo Cofre desligado, a comunidade escolhida continua, e a escolha de outra espera o módulo ser ligado.',
      });
    } finally {
      await ligarOCofre(api, org, true);
    }
  });
});
