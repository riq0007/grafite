// O bilhete do chat da aba (change aba-dos-colaboradores, design, decisão 8; tarefa 3.11): a aba pede
// com o token da sessão dela um bilhete de uso único, de 60 s, com o destino fechado, e o chat da aba
// o troca pela sessão do chat na aba, sem cookie. O usado, o vencido e o desconhecido têm a mesma
// resposta, e a troca calcula de novo a pendência e confere a sessão da aba e o aparelho. Na entrada
// pelo Windows, a conta com os dois passos não recebe o bilhete: entra pela página do chat com a marca
// da aba, e a sessão que sai dali nasce no alcance, ligada à sessão da aba.
import {
  aparelhosDaAba,
  atribuicoes,
  auditoria,
  contas,
  grupos,
  naOrganizacao,
  sessoes,
  sessoesDaAba,
} from '@grafite/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ligarDiretorioSimulado } from '../../test/diretorio.ts';
import {
  type ApiDeTeste,
  abrirApi,
  ativarDoisPassos,
  criarOrganizacao,
  criarPerfil,
  novoIp,
} from '../../test/integracao.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { gerarCodigoTotp } from '../acesso/totp.ts';
import { executarComando } from '../comando/executar.ts';
import { criarDiretorioSimulado } from '../diretorio/simulado.ts';

const host = 'grafite.bilhete-da-aba.local';
const ad = criarDiretorioSimulado();
let api: ApiDeTeste;
let org = '';
let aparelho = '';
let curto = '';
let chaveDoBruno: Buffer | null = null;

/** Os dois passos de Bruno, ativados uma vez para os casos que precisam deles. */
async function doisPassosDoBruno(contaId: string): Promise<Buffer> {
  chaveDoBruno ??= (await ativarDoisPassos(api, org, contaId)).chaveDoApp;
  return chaveDoBruno;
}

const SID_FERNANDA = 'S-1-5-21-1004336348-1177238915-682003330-1105';
const SID_BRUNO = 'S-1-5-21-1004336348-1177238915-682003330-1106';

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

/** A sessão da aba pelo Windows, com o token dela e a linha. */
async function abrirAba(sid = SID_FERNANDA) {
  const r = await api.app.inject({
    method: 'POST',
    url: '/api/aba/sessao',
    remoteAddress: novoIp(),
    headers: { host, authorization: `Bearer ${aparelho}` },
    payload: { entrada: 'windows', sid },
  });
  expect(r.statusCode, r.body).toBe(200);
  const token: string = r.json().token;
  const [linha] = await naOrg((tx) =>
    tx
      .select()
      .from(sessoesDaAba)
      .where(eq(sessoesDaAba.tokenHash, hashDoToken(token))),
  );
  return { token, id: linha?.id ?? '', contaId: linha?.contaId ?? '' };
}

const pedirBilhete = (token: string, destino: object = { destino: 'chat' }) =>
  api.app.inject({
    method: 'POST',
    url: '/api/aba/bilhete',
    remoteAddress: novoIp(),
    headers: { host, authorization: `Bearer ${token}` },
    payload: destino,
  });

async function bilheteDe(token: string, destino?: object): Promise<string> {
  const r = await pedirBilhete(token, destino);
  expect(r.statusCode, r.body).toBe(200);
  return r.json().bilhete;
}

const trocar = (bilhete: string, ip = novoIp()) =>
  api.app.inject({
    method: 'POST',
    url: '/api/sessao/bilhete',
    remoteAddress: ip,
    headers: { host, 'sec-fetch-site': 'same-origin' },
    payload: { bilhete },
  });

const cookieDa = (r: { headers: Record<string, unknown> }) =>
  String(r.headers['set-cookie']).split(';')[0] ?? '';

const consultar = (url: string, cookie: string) =>
  api.app.inject({ method: 'GET', url, remoteAddress: novoIp(), headers: { host, cookie } });

const entrarComAMarca = (usuario: string, senha: string, marca: string) =>
  api.app.inject({
    method: 'POST',
    url: '/api/sessao',
    remoteAddress: novoIp(),
    headers: { host, 'sec-fetch-site': 'same-origin' },
    payload: { usuario, senha, aba: marca },
  });

/** A resposta sem o que muda a cada pedido: o rastreio e a instância. */
const semRastreio = (r: { statusCode: number; json: () => Record<string, unknown> }) => {
  const { codigoDeRastreio: _c, ...resto } = r.json();
  return { status: r.statusCode, ...resto };
};

beforeAll(async () => {
  api = await abrirApi({ conectarDiretorio: ad.conectar });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const linhas: string[] = [];
  await executarComando(['aba', 'chave', 'criar', '--endereco', host], {
    banco: () => api.banco,
    agora: api.relogio.agora,
    escrever: (texto) => linhas.push(texto),
    escreverErro: (texto) => linhas.push(texto),
  });
  const chave = /Chave da aba: (\S+)/.exec(linhas.join('\n'))?.[1] ?? '';
  const perfil = await criarPerfil(api, org, {
    nome: 'Colaborador',
    permissoes: ['chat.usar', 'chamados.pedir'],
  });
  const fernanda = ad.usuario({
    usuario: 'fernanda.lima',
    nome: 'Fernanda Lima',
    senha: 'senha-da-fernanda',
    sid: SID_FERNANDA,
  });
  const bruno = ad.usuario({
    usuario: 'bruno.alves',
    nome: 'Bruno Alves',
    senha: 'senha-do-bruno',
    sid: SID_BRUNO,
  });
  const grupoDoAd = ad.grupo('Financeiro', [fernanda, bruno]);
  const [grupo] = await naOrg((tx) =>
    tx
      .insert(grupos)
      .values({ orgId: org, nome: 'Financeiro', nomeNormalizado: 'financeiro' })
      .returning({ id: grupos.id }),
  );
  await naOrg((tx) =>
    tx.insert(atribuicoes).values({ orgId: org, perfilId: perfil, grupoId: grupo?.id ?? '' }),
  );
  await ligarDiretorioSimulado(api, org, [[grupoDoAd, grupo?.id ?? '']]);
  const r = await api.app.inject({
    method: 'POST',
    url: '/api/aba/aparelho',
    remoteAddress: novoIp(),
    headers: { host },
    payload: {
      chave,
      identificadorDaMaquina: 'guid-fin-09',
      nome: 'PC-FIN-09',
      entradaSugerida: 'windows',
    },
  });
  expect(r.statusCode, r.body).toBe(200);
  aparelho = r.json().token;
  curto = r.json().identificadorCurto;
});

afterAll(async () => {
  await api?.fechar();
});

describe('o bilhete pedido pela aba', () => {
  it('vale 60 s e leva o chat da aba à sessão dele, no alcance, com o destino', async () => {
    const aba = await abrirAba();
    const pedido = await pedirBilhete(aba.token);
    expect(pedido.statusCode, pedido.body).toBe(200);
    const { bilhete, expiraEm } = pedido.json();
    expect(new Date(expiraEm).getTime() - api.relogio.agora().getTime()).toBe(60_000);
    const r = await trocar(bilhete);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      destino: { destino: 'chat' },
      sessao: { naAba: true, pendencia: null, conta: { usuario: 'fernanda.lima' } },
    });
    const cookie = cookieDa(r);
    expect((await consultar('/api/chat/conversas', cookie)).statusCode).toBe(200);
    const fora = await consultar('/api/locais', cookie);
    expect(fora.statusCode).toBe(403);
    expect(fora.json()).toMatchObject({ type: 'urn:grafite:problema:fora-do-alcance-da-aba' });
    const [sessao] = await naOrg((tx) =>
      tx
        .select({ alcance: sessoes.alcance, sessaoDaAbaId: sessoes.sessaoDaAbaId })
        .from(sessoes)
        .where(eq(sessoes.tokenHash, hashDoToken(cookie.split('=')[1] ?? ''))),
    );
    expect(sessao).toEqual({ alcance: 'chat-da-aba', sessaoDaAbaId: aba.id });
  });

  it('leva ao chamado pelo número', async () => {
    const aba = await abrirAba();
    const r = await trocar(await bilheteDe(aba.token, { destino: 'chamado', numero: 7 }));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ destino: { destino: 'chamado', numero: 7 } });
  });

  it('o destino é fechado: o chat ou um chamado pelo número', async () => {
    const aba = await abrirAba();
    for (const destino of [
      { destino: 'casca' },
      { destino: 'chamado' },
      { destino: 'chat', url: '/ativos' },
      { destino: 'chamado', numero: 0 },
    ]) {
      const r = await pedirBilhete(aba.token, destino);
      expect(r.statusCode, JSON.stringify(destino)).toBe(400);
    }
  });

  it('o usado, o vencido, o desconhecido e o da sessão da aba terminada têm a mesma resposta', async () => {
    const aba = await abrirAba();
    const usado = await bilheteDe(aba.token);
    expect((await trocar(usado)).statusCode).toBe(200);
    const vencido = await bilheteDe(aba.token);
    const daTerminada = await bilheteDe(aba.token);
    api.relogio.avancar(60_001);
    const respostas = [await trocar(usado), await trocar(vencido), await trocar('desconhecido')];
    const outra = await abrirAba();
    const daOutra = await bilheteDe(outra.token);
    const saiu = await api.app.inject({
      method: 'DELETE',
      url: '/api/aba/sessao',
      remoteAddress: novoIp(),
      headers: { host, authorization: `Bearer ${outra.token}` },
    });
    expect(saiu.statusCode, saiu.body).toBe(204);
    respostas.push(await trocar(daOutra));
    expect(daTerminada).not.toBe(daOutra);
    const [primeira, ...resto] = respostas.map(semRastreio);
    expect(primeira).toMatchObject({
      status: 401,
      type: 'urn:grafite:problema:bilhete-recusado',
    });
    for (const outraResposta of resto) expect(outraResposta).toEqual(primeira);
  });

  it('o aparelho bloqueado depois do pedido recusa a troca', async () => {
    const aba = await abrirAba();
    const bilhete = await bilheteDe(aba.token);
    await naOrg((tx) =>
      tx
        .update(aparelhosDaAba)
        .set({ bloqueadoEm: api.relogio.agora() })
        .where(eq(aparelhosDaAba.identificadorCurto, curto)),
    );
    try {
      const r = await trocar(bilhete);
      expect(r.statusCode).toBe(401);
      expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:bilhete-recusado' });
    } finally {
      await naOrg((tx) =>
        tx
          .update(aparelhosDaAba)
          .set({ bloqueadoEm: null })
          .where(eq(aparelhosDaAba.identificadorCurto, curto)),
      );
    }
  });

  it('a troca calcula de novo a pendência da conta', async () => {
    const aba = await abrirAba();
    const bilhete = await bilheteDe(aba.token);
    await naOrg((tx) =>
      tx.update(contas).set({ senhaTemporaria: true }).where(eq(contas.id, aba.contaId)),
    );
    try {
      const r = await trocar(bilhete);
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json()).toMatchObject({ sessao: { naAba: true, pendencia: 'trocar-senha' } });
    } finally {
      await naOrg((tx) =>
        tx.update(contas).set({ senhaTemporaria: false }).where(eq(contas.id, aba.contaId)),
      );
    }
  });

  it('a troca vai à auditoria, com a conta e o computador', async () => {
    const aba = await abrirAba();
    const r = await trocar(await bilheteDe(aba.token));
    expect(r.statusCode, r.body).toBe(200);
    const registros = await naOrg((tx) =>
      tx
        .select()
        .from(auditoria)
        .where(
          and(
            eq(auditoria.acao, 'sessao-do-chat-da-aba.aberta'),
            eq(auditoria.atorContaId, aba.contaId),
          ),
        ),
    );
    expect(registros.at(-1)).toMatchObject({
      dados: { pelo: 'bilhete', computador: 'PC-FIN-09', identificador: curto },
    });
  });

  it('a troca tem o limite da entrada', async () => {
    const ip = novoIp();
    const respostas = [];
    for (let i = 0; i < 21; i++) respostas.push((await trocar(`desconhecido-${i}`, ip)).statusCode);
    expect(respostas.slice(0, 20).every((status) => status === 401)).toBe(true);
    expect(respostas[20]).toBe(429);
  });
});

describe('a conta com os dois passos, na entrada pelo Windows', () => {
  it('não recebe o bilhete, com a marca da aba para a página de entrada do chat', async () => {
    const aba = await abrirAba(SID_BRUNO);
    await doisPassosDoBruno(aba.contaId);
    const r = await pedirBilhete(aba.token);
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:bilhete-pede-a-entrada',
      aba: curto,
    });
  });

  it('a que exige os dois passos sem os ter também não recebe', async () => {
    const aba = await abrirAba();
    await naOrg((tx) =>
      tx.update(contas).set({ exigeDoisPassos: true }).where(eq(contas.id, aba.contaId)),
    );
    try {
      const r = await pedirBilhete(aba.token);
      expect(r.statusCode, r.body).toBe(403);
      expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:bilhete-pede-a-entrada' });
    } finally {
      await naOrg((tx) =>
        tx.update(contas).set({ exigeDoisPassos: false }).where(eq(contas.id, aba.contaId)),
      );
    }
  });
});

describe('a entrada do chat com a marca da aba', () => {
  it('nasce no alcance, ligada à sessão da aba da mesma conta no mesmo aparelho', async () => {
    const aba = await abrirAba();
    const r = await entrarComAMarca('fernanda.lima', 'senha-da-fernanda', curto.toLowerCase());
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ sessao: { naAba: true, pendencia: null } });
    const cookie = cookieDa(r);
    expect((await consultar('/api/chat/conversas', cookie)).statusCode).toBe(200);
    expect((await consultar('/api/locais', cookie)).statusCode).toBe(403);
    const [sessao] = await naOrg((tx) =>
      tx
        .select({ sessaoDaAbaId: sessoes.sessaoDaAbaId })
        .from(sessoes)
        .where(eq(sessoes.tokenHash, hashDoToken(cookie.split('=')[1] ?? ''))),
    );
    expect(sessao?.sessaoDaAbaId).toBe(aba.id);
  });

  it('sem a sessão da aba, com a marca de outro aparelho ou falsa, a entrada é recusada', async () => {
    const outraConta = await entrarComAMarca('bruno.alves', 'senha-do-bruno', 'ZZZZZZ');
    expect(outraConta.statusCode, outraConta.body).toBe(403);
    expect(outraConta.json()).toMatchObject({
      type: 'urn:grafite:problema:sem-sessao-da-aba',
    });
    const aba = await abrirAba();
    await api.app.inject({
      method: 'DELETE',
      url: '/api/aba/sessao',
      remoteAddress: novoIp(),
      headers: { host, authorization: `Bearer ${aba.token}` },
    });
    const semAba = await entrarComAMarca('fernanda.lima', 'senha-da-fernanda', curto);
    expect(semAba.statusCode, semAba.body).toBe(403);
    expect(semAba.json()).toMatchObject({ type: 'urn:grafite:problema:sem-sessao-da-aba' });
  });

  it('a conta com os dois passos chega ao código pela sessão pendente e segue no alcance', async () => {
    const aba = await abrirAba(SID_BRUNO);
    const chaveDoApp = await doisPassosDoBruno(aba.contaId);
    const pendente = await entrarComAMarca('bruno.alves', 'senha-do-bruno', curto);
    expect(pendente.statusCode, pendente.body).toBe(200);
    expect(pendente.json()).toMatchObject({ sessao: { naAba: true, pendencia: 'segundo-passo' } });
    api.relogio.avancar(30_000);
    const r = await api.app.inject({
      method: 'POST',
      url: '/api/sessao/segundo-passo',
      remoteAddress: novoIp(),
      headers: {
        host,
        cookie: cookieDa(pendente),
        'x-grafite-csrf': pendente.json().sessao.csrf,
        'sec-fetch-site': 'same-origin',
      },
      payload: { codigo: gerarCodigoTotp(chaveDoApp, api.relogio.agora().getTime()) },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ sessao: { naAba: true, pendencia: null } });
    const cookie = cookieDa(r);
    expect((await consultar('/api/chat/conversas', cookie)).statusCode).toBe(200);
    expect((await consultar('/api/locais', cookie)).statusCode).toBe(403);
  });
});
