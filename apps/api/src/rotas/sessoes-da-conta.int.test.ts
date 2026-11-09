// A saída e as sessões da conta (spec entrada-e-sessoes): o usuário vê as próprias sessões abertas,
// sem token e sem as de outra conta, encerra uma delas ou todas as outras, e sai.
import { auditoria, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';

const host = 'grafite.sessoes-conta.local';
const senha = 'cavalo bateria grampo correto';
const COMPUTADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const CELULAR =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let api: ApiDeTeste;
let org = '';
let ipDoCaso = 0;
const novoIp = () => `10.3.${Math.floor(++ipDoCaso / 250)}.${ipDoCaso % 250}`;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  for (const usuario of ['ana', 'bruno', 'carla', 'davi', 'eva']) {
    await criarConta(api, org, { usuario, senha });
  }
});

afterAll(async () => {
  await api?.fechar();
});

interface Entrada {
  cookie: string;
  csrf: string;
}

async function entrar(usuario: string, agente = COMPUTADOR, ip = novoIp()): Promise<Entrada> {
  const r = await api.app.inject({
    method: 'POST',
    url: '/sessao',
    remoteAddress: ip,
    headers: { host, 'sec-fetch-site': 'same-origin', 'user-agent': agente },
    payload: { usuario, senha },
  });
  return {
    cookie: String(r.headers['set-cookie']).split(';')[0] ?? '',
    csrf: r.json().sessao.csrf,
  };
}

function pedir(metodo: 'GET' | 'DELETE', url: string, { cookie, csrf }: Entrada) {
  return api.app.inject({
    method: metodo,
    url,
    remoteAddress: novoIp(),
    headers: { host, cookie, 'x-grafite-csrf': csrf, 'sec-fetch-site': 'same-origin' },
  });
}

const sessaoDo = async (entrada: Entrada) => (await pedir('GET', '/sessao', entrada)).json().sessao;
const listar = async (entrada: Entrada) => (await pedir('GET', '/conta/sessoes', entrada)).json();

const ultimoEncerramento = async () =>
  (
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select()
        .from(auditoria)
        .where(eq(auditoria.acao, 'sessao.encerrada'))
        .orderBy(auditoria.id),
    )
  ).at(-1);

describe('DELETE /sessao', () => {
  it('sai: a sessão termina no servidor, o cookie é apagado e a cópia dele não vale mais', async () => {
    const entrada = await entrar('ana');
    const r = await pedir('DELETE', '/sessao', entrada);
    expect(r.statusCode).toBe(204);
    expect(String(r.headers['set-cookie'])).toMatch(/^__Host-grafite-sessao=;/);
    expect(await sessaoDo(entrada)).toBeNull();
    expect(await ultimoEncerramento()).toMatchObject({
      atorTipo: 'conta',
      dados: { motivo: 'saida' },
    });
  });
});

describe('GET /conta/sessoes', () => {
  it('lista as sessões abertas da conta, com o dispositivo, o IP, os horários e a atual, sem token', async () => {
    const computador = await entrar('bruno', COMPUTADOR, '10.9.0.1');
    api.relogio.avancar(60_000);
    await entrar('bruno', CELULAR, '10.9.0.2');
    await entrar('carla');
    const sessoes = await listar(computador);
    expect(sessoes).toHaveLength(2);
    expect(sessoes.map((s: { dispositivo: string }) => s.dispositivo).sort()).toEqual([
      'Chrome no Windows',
      'Safari no iPhone',
    ]);
    const atual = sessoes.find((s: { atual: boolean }) => s.atual);
    expect(atual).toMatchObject({ dispositivo: 'Chrome no Windows', ip: '10.9.0.1' });
    for (const sessao of sessoes) {
      expect(Object.keys(sessao).sort()).toEqual(
        ['atual', 'criadaEm', 'dispositivo', 'id', 'ip', 'ultimoUsoEm'].sort(),
      );
      expect(new Date(sessao.criadaEm).getTime()).not.toBeNaN();
    }
  });
});

describe('DELETE /conta/sessoes/:id', () => {
  it('encerra outra sessão da conta, que passa a ser recusada', async () => {
    const computador = await entrar('davi', COMPUTADOR);
    const celular = await entrar('davi', CELULAR);
    const doCelular = (await listar(computador)).find((s: { atual: boolean }) => !s.atual);
    const r = await pedir('DELETE', `/conta/sessoes/${doCelular.id}`, computador);
    expect(r.statusCode).toBe(204);
    expect(await sessaoDo(celular)).toBeNull();
    expect(await sessaoDo(computador)).not.toBeNull();
    expect((await ultimoEncerramento())?.dados).toEqual({ motivo: 'encerrada-pelo-usuario' });
  });

  it('a sessão de outra conta é tratada como não encontrada', async () => {
    const deDavi = await entrar('davi');
    const deEva = await entrar('eva');
    const daEva = (await listar(deEva))[0];
    const r = await pedir('DELETE', `/conta/sessoes/${daEva.id}`, deDavi);
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:nao-encontrado' });
    expect(await sessaoDo(deEva)).not.toBeNull();
  });

  it('encerrar a sessão atual é o mesmo que sair', async () => {
    const entrada = await entrar('eva');
    const atual = (await listar(entrada)).find((s: { atual: boolean }) => s.atual);
    const r = await pedir('DELETE', `/conta/sessoes/${atual.id}`, entrada);
    expect(r.statusCode).toBe(204);
    expect(String(r.headers['set-cookie'])).toMatch(/^__Host-grafite-sessao=;/);
    expect(await sessaoDo(entrada)).toBeNull();
    expect((await ultimoEncerramento())?.dados).toEqual({ motivo: 'saida' });
  });
});

describe('DELETE /conta/sessoes', () => {
  it('encerra todas as outras sessões da conta e mantém a atual', async () => {
    const atual = await entrar('carla');
    const outras = [await entrar('carla', CELULAR), await entrar('carla')];
    const antes = (await listar(atual)).length;
    const r = await pedir('DELETE', '/conta/sessoes', atual);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ encerradas: antes - 1 });
    for (const outra of outras) expect(await sessaoDo(outra)).toBeNull();
    expect(await sessaoDo(atual)).not.toBeNull();
    expect((await ultimoEncerramento())?.dados).toEqual({ motivo: 'outras-encerradas' });
  });
});
