// O cadastro da verificação em dois passos (spec verificacao-em-dois-passos): a chave e a URI do
// app, a ativação só com o código certo, os 10 códigos de recuperação mostrados uma vez, as outras
// sessões encerradas e a pendência do cadastro exigido resolvida.
import { auditoria, contas, doisPassos, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHAVE_DOIS_PASSOS_DE_TESTE } from '../../test/dependencias.ts';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';
import { decifrarChaveDoApp } from '../acesso/cifra.ts';
import { decodificarBase32, gerarCodigoTotp } from '../acesso/totp.ts';

const host = 'grafite.dois-passos.local';
const senha = 'cavalo bateria grampo correto';

let api: ApiDeTeste;
let org = '';
let ipDoCaso = 0;
const novoIp = () => `10.5.${Math.floor(++ipDoCaso / 250)}.${ipDoCaso % 250}`;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  for (const usuario of ['ana', 'bruno', 'davi', 'eva']) {
    await criarConta(api, org, { usuario, senha });
  }
  await criarConta(api, org, { usuario: 'carla', senha, exigeDoisPassos: true });
});

afterAll(async () => {
  await api?.fechar();
});

interface Entrada {
  cookie: string;
  csrf: string;
}

async function entrar(usuario: string): Promise<{ entrada: Entrada; pendencia: string | null }> {
  const r = await api.app.inject({
    method: 'POST',
    url: '/sessao',
    remoteAddress: novoIp(),
    headers: { host, 'sec-fetch-site': 'same-origin' },
    payload: { usuario, senha },
  });
  return {
    entrada: {
      cookie: String(r.headers['set-cookie']).split(';')[0] ?? '',
      csrf: r.json().sessao.csrf,
    },
    pendencia: r.json().sessao.pendencia,
  };
}

function escrever(url: string, { cookie, csrf }: Entrada, payload: object = {}) {
  return api.app.inject({
    method: 'POST',
    url,
    remoteAddress: novoIp(),
    headers: { host, cookie, 'x-grafite-csrf': csrf, 'sec-fetch-site': 'same-origin' },
    payload,
  });
}

const consultar = async (url: string, { cookie }: Entrada) =>
  (
    await api.app.inject({ method: 'GET', url, remoteAddress: novoIp(), headers: { host, cookie } })
  ).json();

const codigoDaChave = (chave: string) =>
  gerarCodigoTotp(decodificarBase32(chave), api.relogio.agora().getTime());

async function contaDo(usuario: string) {
  const [conta] = await naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(contas).where(eq(contas.usuario, usuario)),
  );
  return conta;
}

describe('POST /conta/dois-passos/cadastro', () => {
  it('devolve a chave em grupos de 4 e a URI do app, e um novo cadastro gera outra chave', async () => {
    const { entrada } = await entrar('ana');
    const r = await escrever('/conta/dois-passos/cadastro', entrada);
    expect(r.statusCode).toBe(200);
    const { chave, uri } = r.json();
    expect(chave).toMatch(/^[A-Z2-7]{4}( [A-Z2-7]{4}){7}$/);
    expect(uri).toBe(
      `otpauth://totp/Grafite%3Aana%20(Empresa)?secret=${chave.replaceAll(' ', '')}&issuer=Grafite&algorithm=SHA1&digits=6&period=30`,
    );
    const outra = (await escrever('/conta/dois-passos/cadastro', entrada)).json().chave;
    expect(outra).not.toBe(chave);
  });

  it('guarda a chave do app cifrada, nunca em texto', async () => {
    const { entrada } = await entrar('bruno');
    const { chave } = (await escrever('/conta/dois-passos/cadastro', entrada)).json();
    const conta = await contaDo('bruno');
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select()
        .from(doisPassos)
        .where(eq(doisPassos.contaId, conta?.id ?? '')),
    );
    const bytes = decodificarBase32(chave);
    expect(linha?.ativadoEm).toBeNull();
    expect(linha?.segredoCifrado.includes(bytes)).toBe(false);
    expect(
      decifrarChaveDoApp(
        linha?.segredoCifrado ?? Buffer.alloc(0),
        CHAVE_DOIS_PASSOS_DE_TESTE,
        conta?.id ?? '',
      ),
    ).toEqual(bytes);
  });
});

describe('POST /conta/dois-passos/confirmacao', () => {
  it('o código errado não ativa a verificação', async () => {
    const { entrada } = await entrar('davi');
    await escrever('/conta/dois-passos/cadastro', entrada);
    const r = await escrever('/conta/dois-passos/confirmacao', entrada, { codigo: '000000' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:codigo-invalido',
      detail: 'Código incorreto. Confira se o relógio do celular está certo e tente de novo.',
    });
    expect((await consultar('/conta', entrada)).doisPassos.situacao).toBe('desativada');
  });

  it('o código certo ativa, mostra os 10 códigos de recuperação e encerra as outras sessões', async () => {
    const { entrada: atual } = await entrar('eva');
    const { entrada: outra } = await entrar('eva');
    const { chave } = (await escrever('/conta/dois-passos/cadastro', atual)).json();
    const r = await escrever('/conta/dois-passos/confirmacao', atual, {
      codigo: codigoDaChave(chave),
    });
    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo.codigosDeRecuperacao).toHaveLength(10);
    expect(corpo).toMatchObject({ sessao: { pendencia: null }, sessoesEncerradas: 1 });
    expect((await consultar('/conta', atual)).doisPassos).toEqual({
      situacao: 'ativa',
      exigida: false,
      exigidaPor: { conta: false, perfis: [] },
      codigosRestantes: 10,
    });
    expect((await consultar('/sessao', outra)).sessao).toBeNull();
    expect((await entrar('eva')).pendencia).toBe('segundo-passo');

    const conta = await contaDo('eva');
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select()
        .from(auditoria)
        .where(eq(auditoria.alvoId, conta?.id ?? '')),
    );
    expect(registros.map((r) => r.acao)).toEqual(
      expect.arrayContaining(['dois-passos.ativados', 'codigos-de-recuperacao.gerados']),
    );
    const texto = JSON.stringify(registros);
    for (const codigo of corpo.codigosDeRecuperacao) expect(texto).not.toContain(codigo);
  });

  it('um novo cadastro com a verificação já ativa é recusado', async () => {
    const { entrada } = await entrar('bruno');
    const { chave } = (await escrever('/conta/dois-passos/cadastro', entrada)).json();
    expect(
      (await escrever('/conta/dois-passos/confirmacao', entrada, { codigo: codigoDaChave(chave) }))
        .statusCode,
    ).toBe(200);
    const recusado = await escrever('/conta/dois-passos/cadastro', entrada);
    expect(recusado.statusCode).toBe(409);
    expect(recusado.json()).toMatchObject({ type: 'urn:grafite:problema:dois-passos-ativos' });
  });

  it('resolve a pendência do cadastro exigido: a sessão passa a valer, com um token novo', async () => {
    const { entrada, pendencia } = await entrar('carla');
    expect(pendencia).toBe('cadastrar-dois-passos');
    const { chave } = (await escrever('/conta/dois-passos/cadastro', entrada)).json();
    const r = await escrever('/conta/dois-passos/confirmacao', entrada, {
      codigo: codigoDaChave(chave),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().sessao.pendencia).toBeNull();
    const cookieNovo = String(r.headers['set-cookie']).split(';')[0] ?? '';
    expect(cookieNovo).not.toBe(entrada.cookie);
    expect((await consultar('/sessao', { cookie: cookieNovo, csrf: '' })).sessao).toMatchObject({
      pendencia: null,
    });
  });
});
