// O registro e a configuração do aparelho da aba (spec aba-dos-colaboradores, "Aparelho registrado
// pela chave" e "Configuração da aba"; design, decisões 2 e 3): a chave, o token e o re-registro com
// a entrada e o bloqueio mantidos, o bloqueio no registro e no contato, o token recusado, o
// re-registro com outro nome na auditoria e o limite por token.
import { aparelhosDaAba, auditoria, configuracoesDaAba, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarOrganizacao, novoIp } from '../../test/integracao.ts';
import { exigirEntrada } from '../aba/escopo.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { executarComando } from '../comando/executar.ts';
import { ProblemaDaApi } from '../problemas.ts';

let api: ApiDeTeste;
let org = '';
let outraOrg = '';
const host = 'grafite.rotas-aba.local';
const outroHost = 'grafite.rotas-aba-outra.local';
let chave = '';
let chaveDaOutra = '';
const MINUTO = 60_000;

const comando = async (...argumentos: string[]) => {
  const saida: string[] = [];
  const codigo = await executarComando(argumentos, {
    banco: () => api.banco,
    agora: api.relogio.agora,
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => saida.push(texto),
  });
  expect(codigo).toBe(0);
  return saida.join('\n');
};
const chaveDa = async (endereco: string, acao = 'criar') =>
  /Chave da aba: (\S+)/.exec(await comando('aba', 'chave', acao, '--endereco', endereco))?.[1] ??
  '';

const registrar = (
  corpo: Record<string, unknown>,
  { endereco = host, ip = novoIp() }: { endereco?: string; ip?: string } = {},
) =>
  api.app.inject({
    method: 'POST',
    url: '/api/aba/aparelho',
    remoteAddress: ip,
    headers: { host: endereco },
    payload: { identificadorDaMaquina: 'guid-fin-09', nome: 'PC-FIN-09', ...corpo },
  });

const configuracao = (
  token: string,
  { headers = {}, ip = novoIp() }: { headers?: Record<string, string>; ip?: string } = {},
) =>
  api.app.inject({
    method: 'GET',
    url: '/api/aba/configuracao',
    remoteAddress: ip,
    headers: { host, authorization: `Bearer ${token}`, ...headers },
  });

const aparelhoDa = async (maquina: string) =>
  (
    await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(aparelhosDaAba).where(eq(aparelhosDaAba.identificadorDaMaquina, maquina)),
    )
  )[0];

const acoes = (acao: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(auditoria).where(eq(auditoria.acao, acao)).orderBy(auditoria.momento),
  );

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  outraOrg = await criarOrganizacao(api, { nome: 'Outra', enderecos: [outroHost] });
  chave = await chaveDa(host);
  chaveDaOutra = await chaveDa(outroHost);
});

afterAll(async () => {
  await api?.fechar();
});

let tokenDoFin = '';

describe('o registro', () => {
  it('o primeiro contato cria o aparelho com a entrada sugerida, a versão e o último contato', async () => {
    const r = await registrar({ chave, versao: '0.2.0', entradaSugerida: 'windows' });
    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo).toMatchObject({
      entrada: 'windows',
      identificadorCurto: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{6}$/),
    });
    expect(corpo.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    tokenDoFin = corpo.token;
    const aparelho = await aparelhoDa('guid-fin-09');
    expect(aparelho).toMatchObject({
      nome: 'PC-FIN-09',
      versao: '0.2.0',
      entrada: 'windows',
      identificadorCurto: corpo.identificadorCurto,
      ultimoContatoEm: api.relogio.agora(),
    });
    expect(aparelho?.tokenHash).toEqual(hashDoToken(corpo.token));
    expect(aparelho?.registradoEm).toEqual(aparelho?.tokenTrocadoEm);
    expect(await acoes('aparelho-da-aba.registrado')).toMatchObject([
      {
        atorTipo: 'anonimo',
        alvoId: aparelho?.id,
        dados: { computador: 'PC-FIN-09', primeiro: true, entrada: 'windows' },
      },
    ]);
  });

  it('sem sugestão, a entrada é pelo Windows; com a senha sugerida, pela senha', async () => {
    const semSugestao = await registrar({
      chave,
      identificadorDaMaquina: 'guid-rh-01',
      nome: 'PC-RH-01',
    });
    expect(semSugestao.json().entrada).toBe('windows');
    const generico = await registrar({
      chave,
      identificadorDaMaquina: 'guid-prod-03',
      nome: 'PC-PROD-03',
      entradaSugerida: 'senha',
    });
    expect(generico.json().entrada).toBe('senha');
  });

  it('a chave que não vale é recusada, e a de outra organização também, com a auditoria', async () => {
    const ip = novoIp();
    const errada = await registrar({ chave: 'nao-e-a-chave' }, { ip });
    expect(errada.statusCode).toBe(401);
    expect(errada.json()).toMatchObject({ detail: 'Chave da aba recusada.' });
    const deOutra = await registrar({ chave: chaveDaOutra }, { ip });
    expect(deOutra.statusCode).toBe(401);
    // A mesma recusa do mesmo endereço em 10 minutos vai à auditoria uma vez só.
    const recusas = await acoes('chave-da-aba.recusada');
    expect(recusas).toMatchObject([{ ip, dados: { computador: 'PC-FIN-09' } }]);
    expect(JSON.stringify(recusas)).not.toContain('nao-e-a-chave');
  });

  it('o re-registro troca o token, mantém a entrada e o bloqueio, e o anterior para de valer', async () => {
    await comando('aba', 'entrada', 'PC-RH-01', 'senha', '--endereco', host);
    const antes = await aparelhoDa('guid-rh-01');
    api.relogio.avancar(2 * 60 * MINUTO);
    const anterior = (
      await registrar({ chave, identificadorDaMaquina: 'guid-rh-01', nome: 'PC-RH-01' })
    ).json().token;
    api.relogio.avancar(MINUTO);
    const r = await registrar({
      chave,
      identificadorDaMaquina: 'guid-rh-01',
      nome: 'PC-RH-01',
      entradaSugerida: 'windows',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      entrada: 'senha',
      identificadorCurto: antes?.identificadorCurto,
    });
    const depois = await aparelhoDa('guid-rh-01');
    expect(depois?.id).toBe(antes?.id);
    expect(depois?.registradoEm).toEqual(antes?.registradoEm);
    expect(depois?.tokenTrocadoEm).toEqual(api.relogio.agora());
    expect((await configuracao(anterior)).statusCode).toBe(401);
    expect((await configuracao(r.json().token)).statusCode).toBe(200);
  });

  it('o re-registro com outro nome em menos de 1 hora vai à auditoria', async () => {
    api.relogio.avancar(10 * MINUTO);
    const r = await registrar({ chave, identificadorDaMaquina: 'guid-rh-01', nome: 'PC-RH-01-B' });
    expect(r.statusCode).toBe(200);
    expect(await acoes('aparelho-da-aba.registrado-com-outro-nome')).toMatchObject([
      { antes: { nome: 'PC-RH-01' }, depois: { nome: 'PC-RH-01-B' } },
    ]);
    // Depois de 1 hora, o outro nome é só o re-registro.
    api.relogio.avancar(2 * 60 * MINUTO);
    await registrar({ chave, identificadorDaMaquina: 'guid-rh-01', nome: 'PC-RH-01' });
    expect(await acoes('aparelho-da-aba.registrado-com-outro-nome')).toHaveLength(1);
  });

  it('a chave trocada recusa o registro novo, e o aparelho registrado segue com o token', async () => {
    const anterior = chave;
    chave = await chaveDa(host, 'trocar');
    expect(
      (await registrar({ chave: anterior, identificadorDaMaquina: 'guid-novo' })).statusCode,
    ).toBe(401);
    expect((await configuracao(tokenDoFin)).statusCode).toBe(200);
    expect(
      (await registrar({ chave, identificadorDaMaquina: 'guid-novo', nome: 'PC-NOVO' })).statusCode,
    ).toBe(200);
  });

  it('o mesmo identificador da máquina em outra organização é outro aparelho', async () => {
    const r = await registrar({ chave: chaveDaOutra }, { endereco: outroHost });
    expect(r.statusCode).toBe(200);
    const daOutra = await naOrganizacao(api.banco, outraOrg, (tx) =>
      tx
        .select()
        .from(aparelhosDaAba)
        .where(eq(aparelhosDaAba.identificadorDaMaquina, 'guid-fin-09')),
    );
    expect(daOutra).toHaveLength(1);
    expect(daOutra[0]?.id).not.toBe((await aparelhoDa('guid-fin-09'))?.id);
    // O token de uma organização não vale no endereço da outra.
    const cruzado = await api.app.inject({
      method: 'GET',
      url: '/api/aba/configuracao',
      remoteAddress: novoIp(),
      headers: { host: outroHost, authorization: `Bearer ${tokenDoFin}` },
    });
    expect(cruzado.statusCode).toBe(401);
  });

  it('o pedido sem os campos é dado inválido', async () => {
    const r = await registrar({ chave, nome: '' });
    expect(r.statusCode).toBe(400);
  });
});

describe('a configuração', () => {
  it('sem a configuração gravada, a forma de fábrica, sem contato, com a versão 0 e a entrada', async () => {
    const r = await configuracao(tokenDoFin);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      forma: 'pilula',
      contato: null,
      entrada: 'windows',
      versao: 0,
      proximaEm: 60,
    });
  });

  it('com a configuração e a entrada do comando', async () => {
    await comando(
      'aba',
      'configurar',
      '--endereco',
      host,
      '--forma',
      'entalhe',
      '--contato',
      'Ramal 2000',
    );
    await comando('aba', 'entrada', 'PC-FIN-09', 'senha', '--endereco', host);
    expect((await configuracao(tokenDoFin)).json()).toMatchObject({
      forma: 'entalhe',
      contato: 'Ramal 2000',
      entrada: 'senha',
      versao: 1,
    });
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(configuracoesDaAba),
    );
    expect(linha?.versao).toBe(1);
  });

  it('o contato grava o último contato no máximo a cada minuto, e o nome e a versão quando mudam', async () => {
    const antes = await aparelhoDa('guid-fin-09');
    api.relogio.avancar(10_000);
    await configuracao(tokenDoFin);
    expect((await aparelhoDa('guid-fin-09'))?.ultimoContatoEm).toEqual(antes?.ultimoContatoEm);
    await configuracao(tokenDoFin, {
      headers: { 'x-grafite-versao-da-aba': '0.3.0', 'x-grafite-computador': 'PC-FIN-09B' },
    });
    expect(await aparelhoDa('guid-fin-09')).toMatchObject({
      versao: '0.3.0',
      nome: 'PC-FIN-09B',
      ultimoContatoEm: api.relogio.agora(),
    });
  });

  it('o token que não vale deixa o computador sem registro, com a auditoria uma vez por endereço', async () => {
    const ip = novoIp();
    for (const _ of [1, 2]) {
      const r = await configuracao('token-que-nao-existe', { ip });
      expect(r.statusCode).toBe(401);
      expect(r.json()).toMatchObject({
        detail: 'Este computador precisa ser registrado de novo. Fale com a TI.',
      });
    }
    const sem = await api.app.inject({
      method: 'GET',
      url: '/api/aba/configuracao',
      remoteAddress: ip,
      headers: { host },
    });
    expect(sem.statusCode).toBe(401);
    expect((await acoes('token-da-aba.recusado')).filter((r) => r.ip === ip)).toHaveLength(1);
  });

  it('o limite de requisições é por token', async () => {
    const r = await registrar({ chave, identificadorDaMaquina: 'guid-limite', nome: 'PC-LIMITE' });
    const token = r.json().token;
    const respostas = [];
    for (let i = 0; i < 121; i++) respostas.push((await configuracao(token)).statusCode);
    expect(respostas.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(respostas[120]).toBe(429);
    // Outro token, do mesmo endereço, segue.
    expect((await configuracao(tokenDoFin)).statusCode).toBe(200);
  });
});

describe('o bloqueio', () => {
  it('o aparelho bloqueado é recusado no contato e no registro, sem trocar o token', async () => {
    const aparelho = await aparelhoDa('guid-fin-09');
    await comando('aba', 'bloquear', aparelho?.identificadorCurto ?? '', '--endereco', host);
    const contato = await configuracao(tokenDoFin);
    expect(contato.statusCode).toBe(403);
    expect(contato.json()).toMatchObject({
      detail: 'Este computador foi bloqueado na aba. Fale com a TI.',
    });
    const registro = await registrar({ chave });
    expect(registro.statusCode).toBe(403);
    expect((await aparelhoDa('guid-fin-09'))?.tokenHash).toEqual(hashDoToken(tokenDoFin));
    // Desbloqueado, o mesmo token volta a valer.
    await comando('aba', 'desbloquear', aparelho?.identificadorCurto ?? '', '--endereco', host);
    expect((await configuracao(tokenDoFin)).statusCode).toBe(200);
  });
});

describe('a entrada do aparelho', () => {
  it('recusa o pedido pela outra entrada, com a frase da entrada do aparelho', () => {
    expect(() => exigirEntrada({ entrada: 'windows' }, 'windows')).not.toThrow();
    const recusa = (() => {
      try {
        exigirEntrada({ entrada: 'senha' }, 'windows');
      } catch (erro) {
        return erro;
      }
    })();
    expect(recusa).toBeInstanceOf(ProblemaDaApi);
    expect((recusa as ProblemaDaApi).dados).toMatchObject({
      status: 403,
      detalhe: 'Este computador entra na aba pelo usuário e pela senha do AD.',
    });
  });
});

// O aparelho sem organização no endereço não chega à rota.
it('o endereço desconhecido é recusado', async () => {
  const r = await api.app.inject({
    method: 'POST',
    url: '/api/aba/aparelho',
    remoteAddress: novoIp(),
    headers: { host: 'ninguem.local' },
    payload: { chave, identificadorDaMaquina: 'x', nome: 'x' },
  });
  expect(r.statusCode).toBe(404);
});
