// Os segredos na ficha do ativo (spec cadastro-de-ativos, "Segredos na ficha do ativo"; design do
// P6, decisão 7): a ficha mostra os segredos ligados ao ativo que a conta vê no cofre, pelo nome,
// com o tipo e o identificador, só com o Cofre ligado, `cofre.usar` e os dois passos ativos, e
// nunca um valor.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CofreDeTeste,
  criarAtivo,
  liberar,
  ligarOCofre,
  montarCofre,
  mudarSituacaoDoSegredo,
  type UsuarioDoCofre,
} from '../../test/cofre.ts';
import { type ApiDeTeste, abrirApi, atribuir, criarPerfil } from '../../test/integracao.ts';

const host = 'grafite.ativos-segredos.local';

let api: ApiDeTeste;
let cofre: CofreDeTeste;
let org = '';
let switchDoCpd = '';
let segredoDoSwitch = '';

beforeAll(async () => {
  api = await abrirApi();
  cofre = await montarCofre(api, host);
  org = cofre.org;
  const leitura = await criarPerfil(api, org, {
    nome: 'Leitura de ativos',
    permissoes: ['ativos.ver'],
  });
  for (const usuario of ['bruno', 'carla', 'davi', 'eva'] as const) {
    await atribuir(api, org, { perfilId: leitura, contaId: cofre.contas[usuario].id });
  }
  switchDoCpd = await criarAtivo(api, org, { patrimonio: 'PAT-00610', nome: 'Switch do CPD' });
  const r = await cofre.cliente.enviar('POST', '/cofre/segredos', cofre.como('ana'), {
    nome: 'Switch do CPD',
    tipo: 'conta-administrativa',
    classificacao: 'equipamento',
    identificador: 'admin',
    ativoIds: [switchDoCpd],
    valor: 'S3nh@ do switch',
  });
  expect(r.statusCode, r.body).toBe(201);
  segredoDoSwitch = r.json().id;
  await liberar(api, org, segredoDoSwitch, { contaId: cofre.contas.bruno.id });
});

afterAll(async () => {
  await api?.fechar();
});

const fichaDoSwitch = async (usuario: UsuarioDoCofre) => {
  const r = await cofre.cliente.consultar(`/ativos/${switchDoCpd}`, cofre.como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  expect(r.body).not.toContain('S3nh@');
  return r.json();
};

describe('segredos na ficha do ativo', () => {
  it('quem alcança o segredo o vê pelo nome, com o tipo e o identificador, sem o valor', async () => {
    expect((await fichaDoSwitch('bruno')).segredos).toEqual([
      {
        id: segredoDoSwitch,
        nome: 'Switch do CPD',
        tipo: 'conta-administrativa',
        identificador: 'admin',
        situacao: 'ativo',
      },
    ]);
  });

  it('quem usa o cofre sem alcançar o segredo não o vê', async () => {
    expect((await fichaDoSwitch('carla')).segredos).toEqual([]);
  });

  it('sem os dois passos ou sem o cofre, a ficha não tem os segredos', async () => {
    expect(await fichaDoSwitch('davi')).not.toHaveProperty('segredos');
    expect(await fichaDoSwitch('eva')).not.toHaveProperty('segredos');
  });

  it('com o Cofre desligado, a ficha não tem os segredos', async () => {
    await ligarOCofre(api, org, false);
    try {
      expect(await fichaDoSwitch('bruno')).not.toHaveProperty('segredos');
    } finally {
      await ligarOCofre(api, org, true);
    }
  });

  it('o segredo inativo some para quem usa e continua para quem administra', async () => {
    await mudarSituacaoDoSegredo(api, org, segredoDoSwitch, 'inativo');
    try {
      expect((await fichaDoSwitch('bruno')).segredos).toEqual([]);
      expect((await fichaDoSwitch('ana')).segredos).toEqual([
        expect.objectContaining({ id: segredoDoSwitch, situacao: 'inativo' }),
      ]);
    } finally {
      await mudarSituacaoDoSegredo(api, org, segredoDoSwitch, 'ativo');
    }
  });
});
