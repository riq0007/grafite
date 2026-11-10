// Os aparelhos confiáveis pela API (spec verificacao-em-dois-passos, "Aparelho confiável" e "Prazo
// da confiança"; change aparelho-confiavel, design, decisões 1 a 3): a marcação no passo do código,
// com o cookie só das rotas da entrada e só o hash no banco, e a entrada seguinte que dispensa o
// código no mesmo navegador, conferida depois da senha certa.
import { createHash } from 'node:crypto';
import {
  aparelhosConfiaveis,
  auditoria,
  contas,
  naOrganizacao,
  politicaDeEntrada,
  sessoes,
  tentativasDeEntrada,
} from '@grafite/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  ativarDoisPassos,
  atribuir,
  criarConta,
  criarOrganizacao,
  criarPerfil,
} from '../../test/integracao.ts';
import { gerarCodigoTotp } from '../acesso/totp.ts';

const host = 'grafite.aparelhos.local';
const senha = 'cavalo bateria grampo correto';
const COOKIE_DO_APARELHO = '__Secure-grafite-aparelho';
const NO_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const DIA = 24 * 60 * 60 * 1000;

let api: ApiDeTeste;
let org = '';
let ipDoCaso = 0;
const novoIp = () => `10.7.${Math.floor(++ipDoCaso / 250)}.${ipDoCaso % 250}`;
const contaDe: Record<string, string> = {};
const chaveDe: Record<string, Buffer> = {};
const recuperacaoDe: Record<string, string[]> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  for (const usuario of [
    'bruno',
    'carla',
    'davi',
    'eva',
    'joao',
    'fabio',
    'gina',
    'helio',
    'ines',
    'lia',
  ]) {
    const conta = await criarConta(api, org, { usuario, senha });
    contaDe[usuario] = conta.id;
    const { chaveDoApp, codigos } = await ativarDoisPassos(api, org, conta.id);
    chaveDe[usuario] = chaveDoApp;
    recuperacaoDe[usuario] = codigos;
  }
});

afterAll(async () => {
  await api?.fechar();
});

interface Entrada {
  cookie: string;
  csrf: string;
}

/** Os cookies que a resposta grava, pelo nome: o valor e os atributos. */
function cookiesDa(resposta: { headers: Record<string, unknown> }) {
  const lista = [resposta.headers['set-cookie'] ?? []].flat().map(String);
  return new Map(
    lista.map((linha) => {
      const [par = '', ...atributos] = linha.split(';').map((parte) => parte.trim());
      const [nome = '', ...valor] = par.split('=');
      return [nome, { valor: valor.join('='), atributos }];
    }),
  );
}

/** O cookie que o navegador manda: o da sessão e, se houver, o do aparelho. */
const comAparelho = (cookie: string, aparelho?: string) =>
  aparelho ? `${cookie}; ${COOKIE_DO_APARELHO}=${aparelho}` : cookie;

/** A senha, no navegador que pode ter o cookie do aparelho. */
async function entrarComSenha(
  usuario: string,
  { aparelho, senhaDigitada = senha }: { aparelho?: string; senhaDigitada?: string } = {},
) {
  const r = await api.app.inject({
    method: 'POST',
    url: '/sessao',
    remoteAddress: novoIp(),
    headers: {
      host,
      'sec-fetch-site': 'same-origin',
      'user-agent': NO_CHROME,
      ...(aparelho ? { cookie: `${COOKIE_DO_APARELHO}=${aparelho}` } : {}),
    },
    payload: { usuario, senha: senhaDigitada },
  });
  const sessao = r.statusCode === 200 ? r.json().sessao : null;
  const entrada: Entrada = {
    cookie: cookiesDa(r).get('__Host-grafite-sessao')?.valor
      ? `__Host-grafite-sessao=${cookiesDa(r).get('__Host-grafite-sessao')?.valor}`
      : '',
    csrf: sessao?.csrf ?? '',
  };
  return { r, entrada, pendencia: sessao?.pendencia ?? null };
}

/** O código do app no momento do relógio, que depois avança: cada código serve uma vez. */
function codigoDoApp(usuario: string): string {
  const codigo = gerarCodigoTotp(chaveDe[usuario] as Buffer, api.relogio.agora().getTime());
  return codigo;
}

function mandarCodigo(
  entrada: Entrada,
  codigo: string,
  { confiar, aparelho }: { confiar?: boolean; aparelho?: string } = {},
) {
  return api.app.inject({
    method: 'POST',
    url: '/sessao/segundo-passo',
    remoteAddress: novoIp(),
    headers: {
      host,
      cookie: comAparelho(entrada.cookie, aparelho),
      'x-grafite-csrf': entrada.csrf,
      'sec-fetch-site': 'same-origin',
      'user-agent': NO_CHROME,
    },
    payload: { codigo, ...(confiar === undefined ? {} : { confiar }) },
  });
}

/** Entra com a senha e o código, marcando o aparelho, e devolve o token do cookie dele. */
async function marcar(usuario: string): Promise<string> {
  api.relogio.avancar(31_000);
  const { entrada } = await entrarComSenha(usuario);
  const r = await mandarCodigo(entrada, codigoDoApp(usuario), { confiar: true });
  expect(r.statusCode).toBe(200);
  const token = cookiesDa(r).get(COOKIE_DO_APARELHO)?.valor;
  if (!token) throw new Error(`O aparelho de ${usuario} não foi marcado.`);
  return token;
}

const aparelhosDe = (usuario: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select()
      .from(aparelhosConfiaveis)
      .where(eq(aparelhosConfiaveis.contaId, contaDe[usuario] as string)),
  );

const hashDe = (token: string) => createHash('sha256').update(token).digest();

/** O cookie do aparelho que a resposta apaga: sem valor, no caminho da entrada. */
const apagouOAparelho = (resposta: { headers: Record<string, unknown> }) => {
  const cookie = cookiesDa(resposta).get(COOKIE_DO_APARELHO);
  return cookie?.valor === '' && cookie.atributos.includes('Path=/api/sessao');
};

describe('marcar o aparelho no passo do código', () => {
  it('Confiar no aparelho: o código do app com "confiar" marca o navegador, com o cookie da entrada', async () => {
    api.relogio.avancar(31_000);
    const { entrada, pendencia } = await entrarComSenha('bruno');
    expect(pendencia).toBe('segundo-passo');
    const r = await mandarCodigo(entrada, codigoDoApp('bruno'), { confiar: true });
    expect(r.statusCode).toBe(200);
    expect(r.json().sessao.pendencia).toBeNull();

    const cookie = cookiesDa(r).get(COOKIE_DO_APARELHO);
    expect(cookie?.valor).toMatch(/^[\w-]{43}$/);
    expect(cookie?.atributos).toEqual(
      expect.arrayContaining([
        `Max-Age=${30 * 24 * 60 * 60}`,
        'Path=/api/sessao',
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
      ]),
    );

    const [aparelho] = await aparelhosDe('bruno');
    expect(aparelho).toMatchObject({ dispositivo: 'Chrome no Windows', ip: expect.any(String) });
    // Tabela dos aparelhos lida: só o hash, que não serve como cookie.
    expect(aparelho?.tokenHash.equals(hashDe(cookie?.valor ?? ''))).toBe(true);
    expect(aparelho?.tokenHash.toString('utf8')).not.toContain(cookie?.valor);

    // A sessão guarda o aparelho que marcou, e a auditoria registra o dispositivo, sem o token.
    const [sessao] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ aparelhoId: sessoes.aparelhoId })
        .from(sessoes)
        .where(
          and(
            eq(sessoes.contaId, contaDe.bruno as string),
            eq(sessoes.aparelhoId, aparelho?.id ?? ''),
          ),
        ),
    );
    expect(sessao?.aparelhoId).toBe(aparelho?.id);
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'aparelho.marcado')),
    );
    expect(registros).toEqual([
      expect.objectContaining({
        atorContaId: contaDe.bruno,
        alvoTipo: 'aparelho',
        alvoId: aparelho?.id,
        dados: { dispositivo: 'Chrome no Windows' },
      }),
    ]);
    expect(JSON.stringify(registros)).not.toContain(cookie?.valor);
  });

  it('sem "confiar", o código não marca o aparelho', async () => {
    api.relogio.avancar(31_000);
    const { entrada } = await entrarComSenha('carla');
    const r = await mandarCodigo(entrada, codigoDoApp('carla'));
    expect(r.statusCode).toBe(200);
    expect(cookiesDa(r).has(COOKIE_DO_APARELHO)).toBe(false);
    expect(await aparelhosDe('carla')).toEqual([]);
  });

  it('Código de recuperação: o "confiar" não marca o aparelho', async () => {
    const { entrada } = await entrarComSenha('carla');
    const r = await mandarCodigo(entrada, recuperacaoDe.carla?.[0] ?? '', { confiar: true });
    expect(r.statusCode).toBe(200);
    expect(r.json().codigosRestantes).toBe(9);
    expect(cookiesDa(r).has(COOKIE_DO_APARELHO)).toBe(false);
    expect(await aparelhosDe('carla')).toEqual([]);
  });

  it('o prazo zero não marca o aparelho', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(contas)
        .set({ diasDeConfianca: 0 })
        .where(eq(contas.id, contaDe.davi as string)),
    );
    api.relogio.avancar(31_000);
    const { entrada } = await entrarComSenha('davi');
    const r = await mandarCodigo(entrada, codigoDoApp('davi'), { confiar: true });
    expect(r.statusCode).toBe(200);
    expect(cookiesDa(r).has(COOKIE_DO_APARELHO)).toBe(false);
    expect(await aparelhosDe('davi')).toEqual([]);
  });

  it('o cookie dura o prazo da conta na hora da marcação', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(contas)
        .set({ diasDeConfianca: 7 })
        .where(eq(contas.id, contaDe.joao as string)),
    );
    api.relogio.avancar(31_000);
    const { entrada } = await entrarComSenha('joao');
    const r = await mandarCodigo(entrada, codigoDoApp('joao'), { confiar: true });
    expect(cookiesDa(r).get(COOKIE_DO_APARELHO)?.atributos).toContain(
      `Max-Age=${7 * 24 * 60 * 60}`,
    );
  });

  it('o décimo primeiro aparelho tira o usado há mais tempo', async () => {
    const agora = api.relogio.agora().getTime();
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(aparelhosConfiaveis).values(
        Array.from({ length: 10 }, (_, i) => ({
          orgId: org,
          contaId: contaDe.eva as string,
          tokenHash: hashDe(`eva-${i}`),
          dispositivo: `Navegador ${i + 1}`,
          criadoEm: new Date(agora - 20 * DIA),
          usadoEm: new Date(agora - (i + 1) * DIA),
        })),
      ),
    );
    await marcar('eva');
    const restantes = await aparelhosDe('eva');
    expect(restantes).toHaveLength(10);
    // O "Navegador 10" foi usado há 10 dias, o mais antigo de todos.
    expect(restantes.map((um) => um.dispositivo)).not.toContain('Navegador 10');
    expect(restantes.map((um) => um.dispositivo)).toContain('Chrome no Windows');
  });

  it('o aparelho vencido sai na entrada que o recusa, e a marcação nova toma o lugar dele', async () => {
    // João tem o prazo de 7 dias.
    const tokenAntigo = await marcar('joao');
    api.relogio.avancar(8 * DIA);
    const { r, entrada } = await entrarComSenha('joao', { aparelho: tokenAntigo });
    expect(r.json().sessao.pendencia).toBe('segundo-passo');
    expect(apagouOAparelho(r)).toBe(true);
    const doJoao = await aparelhosDe('joao');
    expect(doJoao.some((um) => um.tokenHash.equals(hashDe(tokenAntigo)))).toBe(false);

    api.relogio.avancar(31_000);
    const remarcado = await mandarCodigo(entrada, codigoDoApp('joao'), { confiar: true });
    const tokenNovo = cookiesDa(remarcado).get(COOKIE_DO_APARELHO)?.valor ?? '';
    const depois = await aparelhosDe('joao');
    expect(depois).toHaveLength(doJoao.length + 1);
    expect(depois.some((um) => um.tokenHash.equals(hashDe(tokenNovo)))).toBe(true);
  });
});

describe('a entrada pelo aparelho confiável', () => {
  let doFabio = '';

  beforeAll(async () => {
    doFabio = await marcar('fabio');
  });

  it('Entrada seguinte no mesmo navegador: 3 dias depois, a senha certa dispensa o código', async () => {
    api.relogio.avancar(3 * DIA);
    const { r, pendencia } = await entrarComSenha('fabio', { aparelho: doFabio });
    expect(r.statusCode).toBe(200);
    expect(pendencia).toBeNull();
    expect(cookiesDa(r).get('__Host-grafite-sessao')?.valor).toBeTruthy();
    expect(cookiesDa(r).has(COOKIE_DO_APARELHO)).toBe(false);
    // O uso fica registrado no aparelho, e a sessão guarda por qual aparelho entrou.
    const [aparelho] = await aparelhosDe('fabio');
    expect(aparelho?.usadoEm).toEqual(api.relogio.agora());
    const pelaEntrada = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ segundoPassoEm: sessoes.segundoPassoEm })
        .from(sessoes)
        .where(
          and(
            eq(sessoes.contaId, contaDe.fabio as string),
            eq(sessoes.aparelhoId, aparelho?.id ?? ''),
          ),
        ),
    );
    expect(pelaEntrada.length).toBeGreaterThan(0);
  });

  it('Outro navegador: sem o cookie, a tela pede o código, com o prazo da caixa', async () => {
    const { pendencia, r } = await entrarComSenha('fabio');
    expect(pendencia).toBe('segundo-passo');
    expect(r.json().sessao.diasDeConfianca).toBe(30);
  });

  it('o cookie que nenhum aparelho tem é apagado, e a tela pede o código', async () => {
    const { pendencia, r } = await entrarComSenha('fabio', { aparelho: 'nao-existe' });
    expect(pendencia).toBe('segundo-passo');
    expect(apagouOAparelho(r)).toBe(true);
  });

  it('Cookie de outra conta: a tela pede o código de Gina, e o aparelho de Fábio continua', async () => {
    const { pendencia, r } = await entrarComSenha('gina', { aparelho: doFabio });
    expect(pendencia).toBe('segundo-passo');
    expect(apagouOAparelho(r)).toBe(true);
    expect(await aparelhosDe('fabio')).toHaveLength(1);
  });

  it('Senha errada com o aparelho confiável: a mesma recusa de qualquer navegador, e ela conta para o bloqueio', async () => {
    const semCookie = await entrarComSenha('fabio', { senhaDigitada: 'senha errada aqui' });
    const comCookie = await entrarComSenha('fabio', {
      senhaDigitada: 'senha errada aqui',
      aparelho: doFabio,
    });
    expect(comCookie.r.statusCode).toBe(401);
    const recusa = ({ status, title, detail }: Record<string, unknown>) => ({
      status,
      title,
      detail,
    });
    expect(recusa(comCookie.r.json())).toEqual(recusa(semCookie.r.json()));
    expect(cookiesDa(comCookie.r).has(COOKIE_DO_APARELHO)).toBe(false);
    const [tentativas] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ falhas: tentativasDeEntrada.falhasSeguidas })
        .from(tentativasDeEntrada)
        .where(eq(tentativasDeEntrada.usuario, 'fabio')),
    );
    expect(tentativas?.falhas).toBe(2);
    // A senha certa, pelo aparelho, zera as recusas.
    const certa = await entrarComSenha('fabio', { aparelho: doFabio });
    expect(certa.pendencia).toBeNull();
  });

  it('Prazo de fábrica: no 31º dia depois da marcação, a entrada pede o código de novo', async () => {
    api.relogio.avancar(28 * DIA);
    const { pendencia, r } = await entrarComSenha('fabio', { aparelho: doFabio });
    expect(pendencia).toBe('segundo-passo');
    expect(apagouOAparelho(r)).toBe(true);
  });

  it('Aparelho confiável com a senha temporária: a tela não pede o código e pede a senha nova', async () => {
    const doHelio = await marcar('helio');
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(contas)
        .set({ senhaTemporaria: true })
        .where(eq(contas.id, contaDe.helio as string)),
    );
    const { pendencia } = await entrarComSenha('helio', { aparelho: doHelio });
    expect(pendencia).toBe('trocar-senha');
  });

  it('Cofre no aparelho confiável: a entrada sem o código não libera o cofre', async () => {
    const perfil = await criarPerfil(api, org, { nome: 'Cofre', permissoes: ['cofre.usar'] });
    await atribuir(api, org, { perfilId: perfil, contaId: contaDe.ines as string });
    const daInes = await marcar('ines');
    const { entrada, pendencia } = await entrarComSenha('ines', { aparelho: daInes });
    expect(pendencia).toBeNull();
    const liberacao = await api.app.inject({
      method: 'GET',
      url: '/cofre/liberacao',
      headers: { host, cookie: entrada.cookie },
    });
    expect(liberacao.statusCode).toBe(200);
    expect(liberacao.json()).toEqual({ liberadoAte: null });
  });

  it('Prazo reduzido: com a organização em 7 dias, o aparelho marcado há 10 pede o código', async () => {
    const daLia = await marcar('lia');
    api.relogio.avancar(10 * DIA);
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(politicaDeEntrada).values({ orgId: org, diasDeConfianca: 7 }),
    );
    try {
      const { pendencia, r } = await entrarComSenha('lia', { aparelho: daLia });
      expect(pendencia).toBe('segundo-passo');
      expect(r.json().sessao.diasDeConfianca).toBe(7);
    } finally {
      await naOrganizacao(api.banco, org, (tx) => tx.delete(politicaDeEntrada));
    }
  });
});
