// O alcance `chat-da-aba` (change aba-dos-colaboradores, design, decisão 8; tarefa 3.10): a sessão
// do chat na aba só vale nas rotas da lista, fixada aqui, e fora dela recebe o 403
// `fora-do-alcance-da-aba`, e não o 401, para uma rota esquecida não derrubar o chat em laço com o
// bilhete. O `lerSessao` recusa o alcance por padrão (a ponte dos painéis não passa nenhum) e confere
// ao vivo a sessão da aba ligada: vencida, terminada ou com o aparelho bloqueado, a do chat também
// termina. A conexão de eventos dela recebe só os tipos do chat e segue depois das conferências, e
// o `/api/sessao` diz `naAba`.
import {
  aparelhosDaAba,
  atribuicoes,
  grupos,
  naOrganizacao,
  sessoes,
  sessoesDaAba,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ligarDiretorioSimulado } from '../../test/diretorio.ts';
import { abrirEventos, type FluxoDeEventos } from '../../test/eventos.ts';
import {
  type ApiDeTeste,
  abrirApi,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  novoIp,
} from '../../test/integracao.ts';
import { executarComando } from '../comando/executar.ts';
import { criarDiretorioSimulado } from '../diretorio/simulado.ts';
import { registrarEvento } from '../eventos/saida.ts';
import { ROTAS_DO_CHAT_DA_ABA } from './escopo.ts';
import { criarSessao, hashDoToken, lerSessao, NOME_DO_COOKIE } from './sessoes.ts';

const host = 'grafite.chat-da-aba.local';
const ad = criarDiretorioSimulado();
let api: ApiDeTeste;
let org = '';
let chave = '';
let cliente: ReturnType<typeof clienteDaApi>;
let aparelho = '';
const abertos: FluxoDeEventos[] = [];

const SID_FERNANDA = 'S-1-5-21-1004336348-1177238915-682003330-1105';

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

const comToken = (token: string) => ({ host, authorization: `Bearer ${token}` });

/** A sessão da aba de Fernanda no computador, pelo Windows. */
async function abrirAba() {
  const r = await api.app.inject({
    method: 'POST',
    url: '/api/aba/sessao',
    remoteAddress: novoIp(),
    headers: comToken(aparelho),
    payload: { entrada: 'windows', sid: SID_FERNANDA },
  });
  expect(r.statusCode, r.body).toBe(200);
  const token: string = r.json().token;
  const [linha] = await naOrg((tx) =>
    tx
      .select()
      .from(sessoesDaAba)
      .where(eq(sessoesDaAba.tokenHash, hashDoToken(token))),
  );
  return {
    id: linha?.id ?? '',
    contaId: linha?.contaId ?? '',
    aparelhoId: linha?.aparelhoId ?? '',
  };
}

/** A sessão do chat na aba, com a linha posta à mão, como o bilhete da 3.11 a criará. */
async function abrirChatNaAba(aba: { id: string; contaId: string }) {
  return naOrg(async (tx) => {
    const criada = await criarSessao(tx, {
      contaId: aba.contaId,
      momento: api.relogio.agora(),
      ip: '127.0.0.1',
      agente: 'Grafite Aba',
      pendente: false,
    });
    await tx
      .update(sessoes)
      .set({ alcance: 'chat-da-aba', sessaoDaAbaId: aba.id })
      .where(eq(sessoes.id, criada.id));
    const entrada: Entrada = {
      cookie: `${NOME_DO_COOKIE}=${criada.token}`,
      csrf: criada.tokenCsrf,
    };
    return { id: criada.id, token: criada.token, entrada };
  });
}

const eventosDoChat = async (entrada: Entrada) => {
  const fluxo = await abrirEventos(api, host, entrada, { caminho: '/api/eventos' });
  abertos.push(fluxo);
  return fluxo;
};

const tipos = (fluxo: FluxoDeEventos) =>
  fluxo.mensagens.filter((m) => m.evento).map((m) => m.evento);

beforeAll(async () => {
  api = await abrirApi({
    conectarDiretorio: ad.conectar,
    intervalosDosEventos: { conferencia: 150, sinalDeVida: 100 },
  });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  const linhas: string[] = [];
  await executarComando(['aba', 'chave', 'criar', '--endereco', host], {
    banco: () => api.banco,
    agora: api.relogio.agora,
    escrever: (texto) => linhas.push(texto),
    escreverErro: (texto) => linhas.push(texto),
  });
  chave = /Chave da aba: (\S+)/.exec(linhas.join('\n'))?.[1] ?? '';
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
  const grupoDoAd = ad.grupo('Financeiro', [fernanda]);
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
  aparelho = (r.json() as { token: string }).token;
});

afterAll(async () => {
  for (const fluxo of abertos) fluxo.fechar();
  await api?.fechar();
});

describe('as rotas do alcance', () => {
  it('a lista é a escolhida: o chat, a sessão, as fotos e os eventos', () => {
    const fora = [...ROTAS_DO_CHAT_DA_ABA].filter(
      (rota) =>
        !rota.split(' ')[1]?.startsWith('/chat/') &&
        ![
          'GET /sessao',
          'POST /sessao/segundo-passo',
          'GET /eventos',
          'GET /pessoas/:id/foto/:arquivo/:tamanho',
          'GET /conta/foto/:arquivo/:tamanho',
        ].includes(rota),
    );
    expect(fora).toEqual([]);
    for (const rota of [
      'GET /sessao',
      'POST /sessao/segundo-passo',
      'GET /eventos',
      'GET /pessoas/:id/foto/:arquivo/:tamanho',
      'GET /conta/foto/:arquivo/:tamanho',
      'GET /chat/conversas',
      'POST /chat/chamados/:numero/aberta',
      'POST /chat/anexos',
    ]) {
      expect(ROTAS_DO_CHAT_DA_ABA, rota).toContain(rota);
    }
    for (const rota of [
      'PUT /conta/foto',
      'PATCH /conta/preferencias',
      'GET /conta/sessoes',
      'DELETE /sessao',
      'POST /sessao',
      'POST /sessao/bilhete',
      'GET /pessoas/nomes',
    ]) {
      expect(ROTAS_DO_CHAT_DA_ABA, rota).not.toContain(rota);
    }
  });

  it('o chat e a sessão valem, com o naAba; fora da lista, o 403 fora-do-alcance-da-aba', async () => {
    const chat = await abrirChatNaAba(await abrirAba());
    const conversas = await cliente.consultar('/chat/conversas', chat.entrada);
    expect(conversas.statusCode, conversas.body).toBe(200);
    const lida = await cliente.consultar('/sessao', chat.entrada);
    expect(lida.statusCode, lida.body).toBe(200);
    expect(lida.json()).toMatchObject({ sessao: { naAba: true } });
    for (const url of ['/conta/sessoes', '/chamados/abertura', '/locais']) {
      const r = await cliente.consultar(url, chat.entrada);
      expect(r.statusCode, `${url}: ${r.body}`).toBe(403);
      expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:fora-do-alcance-da-aba' });
    }
    const foto = await cliente.enviar('PATCH', '/conta/preferencias', chat.entrada, {});
    expect(foto.statusCode).toBe(403);
    expect(foto.json()).toMatchObject({ type: 'urn:grafite:problema:fora-do-alcance-da-aba' });
  });

  it('a entrada com o cookie do chat na aba abre como sem sessão', async () => {
    const chat = await abrirChatNaAba(await abrirAba());
    const r = await api.app.inject({
      method: 'POST',
      url: '/api/sessao',
      remoteAddress: novoIp(),
      headers: { host, cookie: chat.entrada.cookie },
      payload: { usuario: 'fernanda.lima', senha: 'senha-da-fernanda' },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ sessao: { naAba: false, pendencia: null } });
  });

  it('a sessão comum segue sem o naAba', async () => {
    const navegador = await cliente.entrar('fernanda.lima', 'senha-da-fernanda');
    expect((await cliente.consultar('/sessao', navegador)).json()).toMatchObject({
      sessao: { naAba: false },
    });
  });
});

describe('a sessão da aba ligada, conferida ao vivo', () => {
  it('a ponte dos painéis, que não passa alcance, não lê a sessão do chat na aba', async () => {
    const chat = await abrirChatNaAba(await abrirAba());
    const ler = (alcances?: readonly ('comum' | 'chat-da-aba')[]) =>
      lerSessao(api.banco, { orgId: org, token: chat.token, agora: api.relogio.agora(), alcances });
    expect(await ler()).toBeNull();
    expect(await ler(['chat-da-aba'])).toMatchObject({ id: chat.id, naAba: true });
  });

  it.each([
    [
      'terminada',
      { encerradaEm: new Date('2026-01-01T00:00:00Z'), motivoDoFim: 'encerrada-pelo-usuario' },
    ],
    ['vencida', { expiraEm: new Date('2026-01-01T00:00:00Z') }],
    ['pendente', { ativadaEm: null }],
    [
      'pela senha parada há 30 min',
      { entrada: 'senha', ultimoUsoEm: new Date('2026-01-01T00:00:00Z') },
    ],
  ] as const)('a sessão da aba %s leva a do chat junto', async (_, mudanca) => {
    const aba = await abrirAba();
    const chat = await abrirChatNaAba(aba);
    expect((await cliente.consultar('/chat/conversas', chat.entrada)).statusCode).toBe(200);
    await naOrg((tx) => tx.update(sessoesDaAba).set(mudanca).where(eq(sessoesDaAba.id, aba.id)));
    expect((await cliente.consultar('/chat/conversas', chat.entrada)).statusCode).toBe(401);
  });

  it('o aparelho bloqueado leva a sessão do chat junto', async () => {
    const aba = await abrirAba();
    const chat = await abrirChatNaAba(aba);
    await naOrg((tx) =>
      tx
        .update(aparelhosDaAba)
        .set({ bloqueadoEm: api.relogio.agora() })
        .where(eq(aparelhosDaAba.id, aba.aparelhoId)),
    );
    try {
      expect((await cliente.consultar('/chat/conversas', chat.entrada)).statusCode).toBe(401);
    } finally {
      await naOrg((tx) =>
        tx
          .update(aparelhosDaAba)
          .set({ bloqueadoEm: null })
          .where(eq(aparelhosDaAba.id, aba.aparelhoId)),
      );
    }
  });
});

describe('os eventos do chat na aba', () => {
  it('só os tipos do chat, e a conexão segue depois de mais de uma conferência', async () => {
    const chat = await abrirChatNaAba(await abrirAba());
    const fluxo = await eventosDoChat(chat.entrada);
    expect(fluxo.status).toBe(200);
    // Mais de duas conferências (150 ms): a sessão do chat na aba segue valendo nelas.
    await new Promise((pronto) => setTimeout(pronto, 500));
    expect(fluxo.terminou()).toBe(false);
    await naOrg(async (tx) => {
      await registrarEvento(tx, { tipo: 'ativos.mudaram', alvo: null, publico: { todas: true } });
      await registrarEvento(tx, { tipo: 'chat.mudou', alvo: null, publico: { todas: true } });
    });
    await vi.waitFor(() => expect(tipos(fluxo)).toContain('chat.mudou'), { timeout: 2000 });
    expect(tipos(fluxo)).not.toContain('ativos.mudaram');
  });
});
