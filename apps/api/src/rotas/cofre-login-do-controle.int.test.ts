// O login de cada controle escolhido na ficha dele (spec saude-do-control-id, "Login escolhido na
// ficha do controle", e cofre-de-segredos, "Login do Control iD usado pelo coletor"; change
// login-de-cada-controle, design, decisões 3 e 4): a lista dos logins que servem, a escolha que
// liga o segredo ao controle e desliga os outros logins, a volta ao login do tipo, a auditoria de
// cada segredo que mudou, as recusas e quem vê o "Escolher login".
import { ativos, campos, naOrganizacao, segredosDosAtivos, tiposDeAtivo } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CofreDeTeste,
  ligarOCofre,
  montarCofre,
  mudarSituacaoDoSegredo,
  type UsuarioDoCofre,
} from '../../test/cofre.ts';
import { type ApiDeTeste, abrirApi, auditoriaDaRequisicao } from '../../test/integracao.ts';

const host = 'grafite.login-do-controle.local';

let api: ApiDeTeste;
let cofre: CofreDeTeste;
let org = '';
const ids: Record<string, string> = {};
const id = (nome: string) => ids[nome] ?? '';

async function tipo(nome: string, capacidades: string[], configuracao: Record<string, unknown>) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        icone: 'generico',
        capacidades,
        configuracaoDasCapacidades: configuracao,
      })
      .returning({ id: tiposDeAtivo.id });
    return linha?.id ?? '';
  });
}

async function ativo(tipoId: string, ip: string, situacao: 'ativo' | 'inativo' = 'ativo') {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId,
        busca: '',
        situacao,
        valores: { [id('ip')]: ip },
      } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    return linha?.id ?? '';
  });
}

async function segredo(
  nome: string,
  {
    tipo: doTipo = 'conta-administrativa',
    identificador = 'admin' as string | null,
    ativoIds = [] as string[],
  } = {},
) {
  const r = await cofre.cliente.enviar('POST', '/cofre/segredos', cofre.como('ana'), {
    nome,
    tipo: doTipo,
    classificacao: 'equipamento',
    ...(identificador === null ? {} : { identificador }),
    ativoIds,
    valor: `senha de ${nome}`,
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as string;
}

/** Os ativos ligados ao segredo, direto no banco. */
const ativosDo = (segredoId: string) =>
  naOrganizacao(api.banco, org, async (tx) =>
    (
      await tx
        .select({ ativoId: segredosDosAtivos.ativoId })
        .from(segredosDosAtivos)
        .where(eq(segredosDosAtivos.segredoId, segredoId))
    ).map((linha) => linha.ativoId),
  );

const url = (ativoId: string) => `/cofre/controles/${ativoId}/login`;
const ler = (ativoId: string, usuario: UsuarioDoCofre = 'ana') =>
  cofre.cliente.consultar(url(ativoId), cofre.como(usuario));
const escolher = (ativoId: string, segredoId: string | null, usuario: UsuarioDoCofre = 'ana') =>
  cofre.cliente.enviar('PUT', url(ativoId), cofre.como(usuario), { segredoId });
const ficha = async (ativoId: string, usuario: UsuarioDoCofre = 'ana') => {
  const r = await cofre.cliente.consultar(`/ativos/${ativoId}`, cofre.como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};

beforeAll(async () => {
  api = await abrirApi();
  cofre = await montarCofre(api, host);
  org = cofre.org;
  await naOrganizacao(api.banco, org, async (tx) => {
    const [ip] = await tx
      .insert(campos)
      .values({ orgId: org, rotulo: 'IP', rotuloNormalizado: 'ip', tipo: 'ip' })
      .returning({ id: campos.id });
    ids.ip = ip?.id ?? '';
  });
  ids.admin = await segredo('Admin dos controles');
  ids.controle = await tipo('Controle de acesso', ['controlid.saude'], {
    'controlid.saude': { campoDoIp: id('ip'), porta: 80, segredoId: id('admin') },
  });
  ids.faceId = await tipo('Face ID', ['controlid.saude'], {
    'controlid.saude': { campoDoIp: id('ip'), porta: 80, segredoId: null },
  });
  ids.soPing = await tipo('Switch', ['rede.disponibilidade'], {
    'rede.disponibilidade': { campoDoIp: id('ip') },
  });
  ids.pat778 = await ativo(id('controle'), '10.0.6.78');
  ids.face = await ativo(id('faceId'), '10.0.6.90');
  ids.switch = await ativo(id('soPing'), '10.0.6.10');
  ids.inativo = await ativo(id('controle'), '10.0.6.99', 'inativo');
  ids.norte = await segredo('Portaria norte', { tipo: 'usuario-e-senha', identificador: 'norte' });
  ids.sul = await segredo('Portaria sul', { identificador: 'sul' });
  ids.semUsuario = await segredo('Sem usuário', { identificador: null });
  ids.antigo = await segredo('Admin antigo', { identificador: 'antigo' });
  await mudarSituacaoDoSegredo(api, org, id('antigo'), 'inativo');
  // O Wi-Fi ligado ao controle não é um login: a escolha não o toca.
  ids.wifi = await segredo('Wi-Fi da portaria', {
    tipo: 'wi-fi',
    identificador: 'portaria',
    ativoIds: [id('pat778')],
  });
});

afterAll(async () => {
  await api?.fechar();
});

describe('o login do controle no cofre', () => {
  it('lista pelo nome os logins que servem, sem o usuário nem a senha, e diz se o tipo tem login', async () => {
    const r = await ler(id('pat778'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      logins: [
        { id: id('admin'), nome: 'Admin dos controles' },
        { id: id('norte'), nome: 'Portaria norte' },
        { id: id('sul'), nome: 'Portaria sul' },
      ],
      proprio: null,
      tipoTemLogin: true,
    });
    expect((await ler(id('face'))).json()).toMatchObject({ proprio: null, tipoTemLogin: false });
  });

  it('a escolha liga o login ao controle, com a auditoria do segredo, e a ficha diz de onde ele vem', async () => {
    const r = await escolher(id('pat778'), id('norte'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ proprio: id('norte'), tipoTemLogin: true });
    expect(await ativosDo(id('norte'))).toEqual([id('pat778')]);
    expect(await ativosDo(id('wifi'))).toEqual([id('pat778')]);
    expect((await ficha(id('pat778'))).controlId).toMatchObject({ login: 'controle' });
    const auditoria = await auditoriaDaRequisicao(api, org, r);
    expect(auditoria).toMatchObject([
      {
        acao: 'segredo.alterado',
        alvoTipo: 'segredo',
        alvoId: id('norte'),
        antes: { ativoIds: [] },
        depois: { ativoIds: [id('pat778')] },
      },
    ]);
    expect(JSON.stringify(auditoria)).not.toContain('senha de');
  });

  it('trocar de login desliga o anterior, com a auditoria dos dois', async () => {
    const r = await escolher(id('pat778'), id('sul'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ proprio: id('sul') });
    expect(await ativosDo(id('norte'))).toEqual([]);
    expect(await ativosDo(id('sul'))).toEqual([id('pat778')]);
    const alterados = (await auditoriaDaRequisicao(api, org, r)).map((registro) => registro.alvoId);
    expect(alterados.sort()).toEqual([id('norte'), id('sul')].sort());
  });

  it('escolher o mesmo login de novo não muda nada', async () => {
    const r = await escolher(id('pat778'), id('sul'));
    expect(r.statusCode, r.body).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
  });

  it('a volta ao login do tipo desliga os logins do controle, e o Wi-Fi fica', async () => {
    const r = await escolher(id('pat778'), null);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ proprio: null });
    expect(await ativosDo(id('sul'))).toEqual([]);
    expect(await ativosDo(id('wifi'))).toEqual([id('pat778')]);
    expect((await ficha(id('pat778'))).controlId).toMatchObject({ login: 'tipo' });
  });

  it('com dois logins ligados, a escolha de um desliga o outro', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(segredosDosAtivos).values([
        { orgId: org, segredoId: id('norte'), ativoId: id('face') },
        { orgId: org, segredoId: id('sul'), ativoId: id('face') },
      ]),
    );
    expect((await ler(id('face'))).json()).toMatchObject({ proprio: null });
    expect((await ficha(id('face'))).controlId).toMatchObject({
      motivo: 'Há mais de um login ligado a este controle no cofre.',
    });
    const r = await escolher(id('face'), id('norte'));
    expect(r.statusCode, r.body).toBe(200);
    expect(await ativosDo(id('sul'))).toEqual([]);
    expect((await ficha(id('face'))).controlId).toMatchObject({ login: 'controle' });
  });

  it('recusa o segredo que não serve de login', async () => {
    const login =
      'Escolha um login ativo do cofre, do tipo Usuário e senha ou Conta administrativa, com o usuário preenchido.';
    for (const segredoId of [id('semUsuario'), id('antigo'), id('wifi')]) {
      const r = await escolher(id('pat778'), segredoId);
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().campos).toEqual({ segredoId: login });
    }
  });

  it('recusa o controle inativo e o ativo de um tipo sem a saúde do Control iD', async () => {
    const inativo = await escolher(id('inativo'), id('norte'));
    expect(inativo.statusCode, inativo.body).toBe(409);
    expect(inativo.json().detail).toBe('O ativo está inativo.');
    const semControlId = await ler(id('switch'));
    expect(semControlId.statusCode, semControlId.body).toBe(409);
    expect(semControlId.json().detail).toBe('O tipo deste ativo não sonda o Control iD.');
  });

  it('só quem administra o cofre lê e escolhe o login', async () => {
    expect((await ler(id('pat778'), 'bruno')).statusCode).toBe(403);
    expect((await escolher(id('pat778'), id('norte'), 'eva')).statusCode).toBe(403);
  });
});

describe('o "Escolher login" na ficha', () => {
  it('aparece para quem administra o cofre, no controle ativo de um tipo com a saúde do Control iD', async () => {
    expect((await ficha(id('pat778'))).permite.escolherLoginDoControle).toBe(true);
    expect((await ficha(id('face'))).permite.escolherLoginDoControle).toBe(true);
    expect((await ficha(id('switch'))).permite.escolherLoginDoControle).toBe(false);
    expect((await ficha(id('inativo'))).permite.escolherLoginDoControle).toBe(false);
  });

  it('não aparece com o Cofre desligado', async () => {
    await ligarOCofre(api, org, false);
    try {
      expect((await ficha(id('pat778'))).permite.escolherLoginDoControle).toBe(false);
    } finally {
      await ligarOCofre(api, org, true);
    }
  });
});
