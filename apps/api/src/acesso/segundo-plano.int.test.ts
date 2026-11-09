// O uso da sessão (spec entrada-e-sessoes; design do F2c, decisão 13): a requisição que a tela faz
// sozinha, sem o usuário interagir, vem marcada com x-grafite-segundo-plano e não conta como uso.
import { contas, naOrganizacao, sessoes } from '@grafite/db';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  type Entrada,
  novoIp,
} from '../../test/integracao.ts';

const host = 'grafite.segundo-plano.local';
const MINUTO = 60_000;

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
});

afterAll(async () => {
  await api?.fechar();
});

async function entrarComo(usuario: string): Promise<Entrada> {
  await criarConta(api, org, { usuario });
  return cliente.entrar(usuario);
}

/** O estado da sessão, como a web o consulta, em segundo plano ou não. */
function consultarSessao({ cookie }: Entrada, segundoPlano: boolean) {
  return api.app.inject({
    method: 'GET',
    url: '/sessao',
    remoteAddress: novoIp(),
    headers: { host, cookie, ...(segundoPlano ? { 'x-grafite-segundo-plano': '1' } : {}) },
  });
}

/** O último uso gravado na sessão mais recente da conta. */
function ultimoUso(usuario: string): Promise<Date | undefined> {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .select({ ultimoUsoEm: sessoes.ultimoUsoEm })
      .from(sessoes)
      .innerJoin(contas, and(eq(contas.orgId, sessoes.orgId), eq(contas.id, sessoes.contaId)))
      .where(eq(contas.usuario, usuario))
      .orderBy(desc(sessoes.criadaEm))
      .limit(1);
    return linha?.ultimoUsoEm;
  });
}

describe('uso da sessão', () => {
  it('a requisição em segundo plano não conta como uso', async () => {
    const entrada = await entrarComo('ana');
    const antes = await ultimoUso('ana');
    api.relogio.avancar(30 * MINUTO);
    const r = await consultarSessao(entrada, true);
    expect(r.json().sessao).not.toBeNull();
    expect(await ultimoUso('ana')).toEqual(antes);
  });

  it('a requisição sem a marca conta como uso', async () => {
    const entrada = await entrarComo('bruno');
    api.relogio.avancar(30 * MINUTO);
    await consultarSessao(entrada, false);
    expect(await ultimoUso('bruno')).toEqual(api.relogio.agora());
  });

  it('a marca vale só para a requisição que a traz', async () => {
    const entrada = await entrarComo('davi');
    api.relogio.avancar(5 * MINUTO);
    await consultarSessao(entrada, true);
    await consultarSessao(entrada, false);
    expect(await ultimoUso('davi')).toEqual(api.relogio.agora());
  });

  it('a sessão só com requisições em segundo plano expira 2 horas depois do último uso', async () => {
    const entrada = await entrarComo('carla');
    for (const minutos of [40, 40, 39]) {
      api.relogio.avancar(minutos * MINUTO);
      expect((await consultarSessao(entrada, true)).json().sessao).not.toBeNull();
    }
    api.relogio.avancar(2 * MINUTO);
    expect((await consultarSessao(entrada, true)).json().sessao).toBeNull();
    expect((await cliente.consultar('/conta', entrada)).statusCode).toBe(401);
  });
});
