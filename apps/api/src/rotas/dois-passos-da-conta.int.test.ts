// A gestão da verificação em dois passos ativa (spec verificacao-em-dois-passos): desativar com um
// código, quando ela não é exigida, e gerar códigos de recuperação novos, que invalidam os antigos.
import { auditoria, codigosDeRecuperacao, contas, doisPassos, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  ativarDoisPassos,
  criarConta,
  criarOrganizacao,
} from '../../test/integracao.ts';
import { gerarCodigoTotp } from '../acesso/totp.ts';

const host = 'grafite.dois-passos-conta.local';
const senha = 'cavalo bateria grampo correto';
const PASSO = 30_000;

let api: ApiDeTeste;
let org = '';
let ipDoCaso = 0;
const novoIp = () => `10.6.${Math.floor(++ipDoCaso / 250)}.${ipDoCaso % 250}`;
const chaves: Record<string, { id: string; chaveDoApp: Buffer; codigos: string[] }> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  for (const usuario of ['ana', 'carla', 'davi', 'eva', 'fabio']) {
    const conta = await criarConta(api, org, { usuario, senha });
    chaves[usuario] = { id: conta.id, ...(await ativarDoisPassos(api, org, conta.id)) };
  }
  const bruno = await criarConta(api, org, { usuario: 'bruno', senha, exigeDoisPassos: true });
  chaves.bruno = { id: bruno.id, ...(await ativarDoisPassos(api, org, bruno.id)) };
});

afterAll(async () => {
  await api?.fechar();
});

interface Entrada {
  cookie: string;
  csrf: string;
}

/** O código que o app mostra agora; o relógio anda um passo, para o próximo não ser repetido. */
function codigoDoApp(usuario: string) {
  api.relogio.avancar(PASSO);
  return gerarCodigoTotp(
    chaves[usuario]?.chaveDoApp ?? Buffer.alloc(0),
    api.relogio.agora().getTime(),
  );
}

function escrever(url: string, { cookie, csrf }: Entrada, payload: object) {
  return api.app.inject({
    method: 'POST',
    url,
    remoteAddress: novoIp(),
    headers: { host, cookie, 'x-grafite-csrf': csrf, 'sec-fetch-site': 'same-origin' },
    payload,
  });
}

async function entrar(usuario: string, codigo = codigoDoApp(usuario)) {
  const r = await api.app.inject({
    method: 'POST',
    url: '/sessao',
    remoteAddress: novoIp(),
    headers: { host, 'sec-fetch-site': 'same-origin' },
    payload: { usuario, senha },
  });
  const pendente: Entrada = {
    cookie: String(r.headers['set-cookie']).split(';')[0] ?? '',
    csrf: r.json().sessao.csrf,
  };
  if (r.json().sessao.pendencia === null) return { status: 200, entrada: pendente };
  const passo = await escrever('/sessao/segundo-passo', pendente, { codigo });
  return {
    status: passo.statusCode,
    entrada: {
      cookie: String(passo.headers['set-cookie']).split(';')[0] ?? '',
      csrf: passo.json().sessao?.csrf ?? '',
    } satisfies Entrada,
  };
}

const linhasDosDoisPassos = (usuario: string) =>
  naOrganizacao(api.banco, org, async (tx) => ({
    doisPassos: await tx
      .select()
      .from(doisPassos)
      .where(eq(doisPassos.contaId, chaves[usuario]?.id ?? '')),
    codigos: await tx
      .select()
      .from(codigosDeRecuperacao)
      .where(eq(codigosDeRecuperacao.contaId, chaves[usuario]?.id ?? '')),
  }));

describe('POST /conta/dois-passos/desativacao', () => {
  it('com o código do app, desativa e apaga a chave e os códigos', async () => {
    const { entrada } = await entrar('ana');
    const r = await escrever('/conta/dois-passos/desativacao', entrada, {
      codigo: codigoDoApp('ana'),
    });
    expect(r.statusCode).toBe(204);
    expect(await linhasDosDoisPassos('ana')).toEqual({ doisPassos: [], codigos: [] });
    const [registro] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'dois-passos.desativados')),
    );
    expect(registro).toMatchObject({ atorContaId: chaves.ana?.id, alvoId: chaves.ana?.id });
    const depois = await api.app.inject({
      method: 'POST',
      url: '/sessao',
      remoteAddress: novoIp(),
      headers: { host, 'sec-fetch-site': 'same-origin' },
      payload: { usuario: 'ana', senha },
    });
    expect(depois.json().sessao.pendencia).toBeNull();
  });

  it('com um código de recuperação, também desativa', async () => {
    const { entrada } = await entrar('eva');
    const r = await escrever('/conta/dois-passos/desativacao', entrada, {
      codigo: chaves.eva?.codigos[3] ?? '',
    });
    expect(r.statusCode).toBe(204);
    expect((await linhasDosDoisPassos('eva')).doisPassos).toEqual([]);
  });

  it('a conta que exige os dois passos não os desativa', async () => {
    const { entrada } = await entrar('bruno');
    const r = await escrever('/conta/dois-passos/desativacao', entrada, {
      codigo: codigoDoApp('bruno'),
    });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:dois-passos-exigidos',
      detail: 'A verificação em dois passos é exigida para a sua conta.',
    });
    expect((await linhasDosDoisPassos('bruno')).doisPassos).toHaveLength(1);
  });

  it('com o código errado, a verificação continua ativa', async () => {
    const { entrada } = await entrar('davi');
    const r = await escrever('/conta/dois-passos/desativacao', entrada, { codigo: '000000' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:codigo-invalido' });
    expect((await linhasDosDoisPassos('davi')).doisPassos).toHaveLength(1);
  });
});

describe('POST /conta/dois-passos/codigos-de-recuperacao', () => {
  it('gera 10 códigos novos, e os antigos deixam de valer', async () => {
    const { entrada } = await entrar('carla');
    const r = await escrever('/conta/dois-passos/codigos-de-recuperacao', entrada, {
      codigo: codigoDoApp('carla'),
    });
    expect(r.statusCode).toBe(200);
    const novos: string[] = r.json().codigosDeRecuperacao;
    expect(novos).toHaveLength(10);
    expect(novos).not.toContain(chaves.carla?.codigos[0]);
    expect((await entrar('carla', chaves.carla?.codigos[0])).status).toBe(401);
    expect((await entrar('carla', novos[0])).status).toBe(200);
    const [conta] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(contas).where(eq(contas.usuario, 'carla')),
    );
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'codigos-de-recuperacao.gerados')),
    );
    expect(registros.filter((r) => r.alvoId === conta?.id)).toHaveLength(1);
  });

  it('com o código errado, os códigos não mudam', async () => {
    // Os códigos vêm sem ORDER BY, na ordem que o banco escolher: a comparação é pelo conjunto.
    const idsDosCodigos = async () =>
      (await linhasDosDoisPassos('fabio')).codigos.map((c) => c.id).sort();
    const { entrada } = await entrar('fabio');
    const antes = await idsDosCodigos();
    const r = await escrever('/conta/dois-passos/codigos-de-recuperacao', entrada, {
      codigo: '000000',
    });
    expect(r.statusCode).toBe(400);
    expect(await idsDosCodigos()).toEqual(antes);
  });
});
