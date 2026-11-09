// O simulador da API do Control iD (change p2c-saude-do-control-id, design, decisão 5), conferido
// pelo fetch do Node: cada modo, as sessões abertas e as gravações montadas.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  iniciarSimuladorControlId,
  lerGravacaoDoControle,
  type SimuladorControlId,
} from './simulador-control-id.ts';

const GRAVACOES = join(import.meta.dirname, 'gravacoes', 'control-id');
const USUARIO = 'admin';
const SENHA = 'senha-do-controle';

let simulador: SimuladorControlId | undefined;

afterEach(async () => {
  await simulador?.fechar();
  simulador = undefined;
});

async function iniciar(modo?: Parameters<typeof iniciarSimuladorControlId>[0]['modo']) {
  simulador = await iniciarSimuladorControlId({
    gravacao: { arquivo: join(GRAVACOES, 'idaccess-pro.json') },
    usuario: USUARIO,
    senha: SENHA,
    modo,
  });
  return simulador;
}

/** Um POST em JSON, como o PMG faz, com a sessão no endereço quando houver. */
async function postar(
  porta: number,
  caminho: string,
  corpo: object = {},
  { sessao, espera = 2000 }: { sessao?: string; espera?: number } = {},
) {
  const endereco = `http://127.0.0.1:${porta}/${caminho}${sessao ? `?session=${sessao}` : ''}`;
  const resposta = await fetch(endereco, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(espera),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto === '' ? null : (JSON.parse(texto) as unknown) };
}

describe('o simulador da API do Control iD', () => {
  it('aceita o login certo, dá as informações do sistema da gravação e fecha a sessão na saída', async () => {
    const { porta, sessoesAbertas } = await iniciar();
    const login = await postar(porta, 'login.fcgi', { login: USUARIO, password: SENHA });
    expect(login.status).toBe(200);
    const { session } = login.corpo as { session: string };
    expect(session).toMatch(/^[0-9a-f]{32}$/);
    expect(sessoesAbertas()).toBe(1);
    const informacoes = await postar(porta, 'system_information.fcgi', {}, { sessao: session });
    expect(informacoes).toEqual({
      status: 200,
      corpo: expect.objectContaining({
        serial: '0M0400/123456',
        firmware: '6.12.2',
        product_name: 'iDAccess Pro',
      }),
    });
    expect(informacoes.corpo).not.toHaveProperty('_origem');
    expect(await postar(porta, 'logout.fcgi', {}, { sessao: session })).toEqual({
      status: 200,
      corpo: {},
    });
    expect(sessoesAbertas()).toBe(0);
  });

  it('recusa a senha errada e a sessão que não existe, com 401', async () => {
    const { porta, sessoesAbertas } = await iniciar();
    expect((await postar(porta, 'login.fcgi', { login: USUARIO, password: 'errada' })).status).toBe(
      401,
    );
    expect((await postar(porta, 'system_information.fcgi', {}, { sessao: 'outra' })).status).toBe(
      401,
    );
    expect(sessoesAbertas()).toBe(0);
  });

  it('conta as sessões que entraram e ainda não saíram', async () => {
    const { porta, sessoesAbertas, pedidos } = await iniciar();
    const entrar = async () =>
      (
        (await postar(porta, 'login.fcgi', { login: USUARIO, password: SENHA })).corpo as {
          session: string;
        }
      ).session;
    const primeira = await entrar();
    await entrar();
    expect(sessoesAbertas()).toBe(2);
    await postar(porta, 'logout.fcgi', {}, { sessao: primeira });
    expect(sessoesAbertas()).toBe(1);
    expect(pedidos().map(({ caminho }) => caminho)).toEqual([
      '/login.fcgi',
      '/login.fcgi',
      '/logout.fcgi',
    ]);
  });

  it('no modo recusa, o login responde 401; no sem-sessao, 200 sem a sessão', async () => {
    const atual = await iniciar('recusa');
    expect(
      (await postar(atual.porta, 'login.fcgi', { login: USUARIO, password: SENHA })).status,
    ).toBe(401);
    atual.definirModo('sem-sessao');
    expect(await postar(atual.porta, 'login.fcgi', { login: USUARIO, password: SENHA })).toEqual({
      status: 200,
      corpo: {},
    });
    expect(atual.sessoesAbertas()).toBe(0);
  });

  it('no modo outro, tudo responde 404, como uma impressora', async () => {
    const { porta } = await iniciar('outro');
    expect((await postar(porta, 'login.fcgi', { login: USUARIO, password: SENHA })).status).toBe(
      404,
    );
    expect((await postar(porta, 'system_information.fcgi')).status).toBe(404);
  });

  it('no modo cala, o pedido fica sem resposta até quem pediu desistir', async () => {
    const { porta, pedidos } = await iniciar('cala');
    await expect(
      postar(porta, 'login.fcgi', { login: USUARIO, password: SENHA }, { espera: 300 }),
    ).rejects.toThrow();
    expect(pedidos()).toHaveLength(1);
  });
});

describe('as gravações dos controles', () => {
  it('cada uma traz o firmware, por um dos dois nomes, e diz de onde veio', () => {
    for (const [arquivo, firmware] of [
      ['idaccess-pro.json', '6.12.2'],
      ['idflex.json', '5.8.1'],
      ['so-firmware.json', '4.1.0'],
    ] as const) {
      const texto = readFileSync(join(GRAVACOES, arquivo), 'utf8');
      expect((JSON.parse(texto) as { _origem?: string })._origem, arquivo).toMatch(/^Montada /);
      const lida = lerGravacaoDoControle(texto);
      expect(lida.firmware ?? lida.version, arquivo).toBe(firmware);
      expect(lida, arquivo).not.toHaveProperty('_origem');
    }
  });
});
