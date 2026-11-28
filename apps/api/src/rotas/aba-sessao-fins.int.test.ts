// Os fins da sessão da aba e a lista (spec entrada-e-sessoes, "Sessões do usuário" e "Sessões
// encerradas pelas mudanças da conta"; spec aba-dos-colaboradores, "Sessão da aba"): as mudanças da
// conta, o "Encerrar as outras", o encerramento de uma pela lista, o bloqueio e a troca da entrada
// do aparelho encerram a sessão da aba com a do chat na aba dela; a lista mostra "Aba · PC-FIN-09" e
// "Chat na aba · PC-FIN-09", com a frase do bloqueio na entrada pelo Windows.
import { atribuicoes, auditoria, grupos, naOrganizacao, sessoes, sessoesDaAba } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ligarDiretorioSimulado } from '../../test/diretorio.ts';
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
import { encerrarSessoesDaConta } from '../acesso/encerramento.ts';
import { AVISO_DA_ABA_PELO_WINDOWS, criarSessao, hashDoToken } from '../acesso/sessoes.ts';
import { executarComando } from '../comando/executar.ts';
import { criarDiretorioSimulado } from '../diretorio/simulado.ts';

const host = 'grafite.aba-fins.local';
const ad = criarDiretorioSimulado();
let api: ApiDeTeste;
let org = '';
let chave = '';
let cliente: ReturnType<typeof clienteDaApi>;

const SID_FERNANDA = 'S-1-5-21-1004336348-1177238915-682003330-1105';

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

const comando = async (...argumentos: string[]) => {
  const saida: string[] = [];
  const codigo = await executarComando(argumentos, {
    banco: () => api.banco,
    agora: api.relogio.agora,
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => saida.push(texto),
  });
  return { codigo, saida: saida.join('\n') };
};

async function registrar(maquina: string, nome: string, entradaSugerida = 'windows') {
  const r = await api.app.inject({
    method: 'POST',
    url: '/api/aba/aparelho',
    remoteAddress: novoIp(),
    headers: { host },
    payload: { chave, identificadorDaMaquina: maquina, nome, entradaSugerida },
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as { token: string; identificadorCurto: string };
}

const comToken = (token: string) => ({ host, authorization: `Bearer ${token}` });

/** A sessão da aba de Fernanda no computador, pelo Windows. */
async function abrirAba(tokenDoAparelho: string) {
  const r = await api.app.inject({
    method: 'POST',
    url: '/api/aba/sessao',
    remoteAddress: novoIp(),
    headers: comToken(tokenDoAparelho),
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
  return { token, id: linha?.id ?? '', contaId: linha?.contaId ?? '' };
}

/** A sessão do chat na aba, ligada à sessão da aba, como a do bilhete (tarefa 3.9). */
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
    return criada.id;
  });
}

const renovar = (token: string) =>
  api.app.inject({
    method: 'POST',
    url: '/api/aba/sessao/renovar',
    remoteAddress: novoIp(),
    headers: comToken(token),
    payload: { sid: SID_FERNANDA },
  });

const fimDaAba = async (id: string) =>
  (await naOrg((tx) => tx.select().from(sessoesDaAba).where(eq(sessoesDaAba.id, id))))[0]
    ?.motivoDoFim ?? null;

const fimDoChat = async (id: string) =>
  (await naOrg((tx) => tx.select().from(sessoes).where(eq(sessoes.id, id))))[0]?.motivoDoFim ??
  null;

let fin: { token: string; identificadorCurto: string };
let navegador: Entrada;

beforeAll(async () => {
  api = await abrirApi({ conectarDiretorio: ad.conectar });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  const { saida } = await comando('aba', 'chave', 'criar', '--endereco', host);
  chave = /Chave da aba: (\S+)/.exec(saida)?.[1] ?? '';
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
  fin = await registrar('guid-fin-09', 'PC-FIN-09');
  await abrirAba(fin.token);
  navegador = await cliente.entrar('fernanda.lima', 'senha-da-fernanda');
});

afterAll(async () => {
  await api?.fechar();
});

describe('a lista das sessões', () => {
  it('Sessão da aba na lista: "Aba · PC-FIN-09" e "Chat na aba · PC-FIN-09" ao lado do navegador', async () => {
    const aba = await abrirAba(fin.token);
    await abrirChatNaAba(aba);
    const r = await cliente.consultar('/conta/sessoes', navegador);
    expect(r.statusCode, r.body).toBe(200);
    const lista: { id: string; dispositivo: string; aviso: string | null; atual: boolean }[] =
      r.json();
    const daAba = lista.find((sessao) => sessao.id === aba.id);
    expect(daAba).toMatchObject({
      dispositivo: 'Aba · PC-FIN-09',
      aviso: AVISO_DA_ABA_PELO_WINDOWS,
      atual: false,
    });
    expect(lista.map((sessao) => sessao.dispositivo)).toContain('Chat na aba · PC-FIN-09');
    expect(lista.find((sessao) => sessao.atual)?.aviso).toBeNull();
    expect(JSON.stringify(lista)).not.toContain(aba.token);
  });

  it('a sessão da aba vencida não entra na lista', async () => {
    const aba = await abrirAba(fin.token);
    await naOrg((tx) =>
      tx
        .update(sessoesDaAba)
        .set({ expiraEm: api.relogio.agora() })
        .where(eq(sessoesDaAba.id, aba.id)),
    );
    const lista: { id: string }[] = (await cliente.consultar('/conta/sessoes', navegador)).json();
    expect(lista.map((sessao) => sessao.id)).not.toContain(aba.id);
  });

  it('encerrar a sessão da aba pela lista encerra o chat na aba dela', async () => {
    const aba = await abrirAba(fin.token);
    const chat = await abrirChatNaAba(aba);
    const r = await cliente.enviar('DELETE', `/conta/sessoes/${aba.id}`, navegador);
    expect(r.statusCode, r.body).toBe(204);
    expect(await fimDaAba(aba.id)).toBe('encerrada-pelo-usuario');
    expect(await fimDoChat(chat)).toBe('sessao-da-aba-encerrada');
    const recusada = await renovar(aba.token);
    expect(recusada.statusCode).toBe(401);
    expect(recusada.json()).toMatchObject({ motivoDoFim: 'encerrada-pelo-usuario' });
    const registros = await naOrg((tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'sessao-da-aba.encerrada')),
    );
    const registro = registros.find(
      (linha) => (linha.dados as { motivo?: string } | null)?.motivo === 'encerrada-pelo-usuario',
    );
    expect(registro).toMatchObject({
      atorTipo: 'conta',
      atorContaId: aba.contaId,
      alvoTipo: 'aparelho-da-aba',
      dados: expect.objectContaining({ computador: 'PC-FIN-09', usuario: 'fernanda.lima' }),
    });
  });

  it('o id da sessão da aba de outra conta dá 404, e a sessão continua', async () => {
    const aba = await abrirAba(fin.token);
    const daAna = await cliente.entrar('ana');
    const r = await cliente.enviar('DELETE', `/conta/sessoes/${aba.id}`, daAna);
    expect(r.statusCode).toBe(404);
    expect(await fimDaAba(aba.id)).toBeNull();
  });

  it('a da senha parada há 30 minutos e a pendente ficam fora da lista', async () => {
    const parada = await abrirAba(fin.token);
    await naOrg((tx) =>
      tx
        .update(sessoesDaAba)
        .set({
          entrada: 'senha',
          ultimoUsoEm: new Date(api.relogio.agora().getTime() - 30 * 60_000),
        })
        .where(eq(sessoesDaAba.id, parada.id)),
    );
    const pc = await registrar('guid-fin-12', 'PC-FIN-12');
    const pendente = await abrirAba(pc.token);
    await naOrg((tx) =>
      tx.update(sessoesDaAba).set({ ativadaEm: null }).where(eq(sessoesDaAba.id, pendente.id)),
    );
    const lista: { id: string }[] = (await cliente.consultar('/conta/sessoes', navegador)).json();
    expect(lista.map((sessao) => sessao.id)).not.toContain(parada.id);
    expect(lista.map((sessao) => sessao.id)).not.toContain(pendente.id);
  });

  it('o chat na aba sai da lista com a sessão da aba vencida', async () => {
    const aba = await abrirAba(fin.token);
    const chat = await abrirChatNaAba(aba);
    await naOrg((tx) =>
      tx
        .update(sessoesDaAba)
        .set({ expiraEm: api.relogio.agora() })
        .where(eq(sessoesDaAba.id, aba.id)),
    );
    const lista: { id: string }[] = (await cliente.consultar('/conta/sessoes', navegador)).json();
    expect(lista.map((sessao) => sessao.id)).not.toContain(chat);
  });

  it('a renovação pelo Windows conta como uso na lista', async () => {
    const aba = await abrirAba(fin.token);
    api.relogio.avancar(50 * 60_000);
    expect((await renovar(aba.token)).statusCode).toBe(200);
    api.relogio.avancar(50 * 60_000);
    expect((await renovar(aba.token)).statusCode).toBe(200);
    const lista: { id: string; criadaEm: string; ultimoUsoEm: string }[] = (
      await cliente.consultar(
        '/conta/sessoes',
        await cliente.entrar('fernanda.lima', 'senha-da-fernanda'),
      )
    ).json();
    const daAba = lista.find((sessao) => sessao.id === aba.id);
    expect(new Date(daAba?.ultimoUsoEm ?? 0).getTime()).toBe(api.relogio.agora().getTime());
    expect(daAba?.ultimoUsoEm).not.toBe(daAba?.criadaEm);
  });

  it('Encerrar todas as outras: a sessão da aba e a do chat terminam, e a atual continua', async () => {
    const aba = await abrirAba(fin.token);
    const chat = await abrirChatNaAba(aba);
    const r = await cliente.enviar('DELETE', '/conta/sessoes', navegador);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().encerradas).toBeGreaterThanOrEqual(2);
    expect(await fimDaAba(aba.id)).toBe('outras-encerradas');
    expect(await fimDoChat(chat)).not.toBeNull();
    expect((await cliente.consultar('/conta/sessoes', navegador)).statusCode).toBe(200);
  });
});

describe('as mudanças da conta e do aparelho', () => {
  it('a senha trocada encerra a sessão da aba, como as outras', async () => {
    const aba = await abrirAba(fin.token);
    const chat = await abrirChatNaAba(aba);
    await naOrg((tx) =>
      encerrarSessoesDaConta(tx, {
        contaId: aba.contaId,
        motivo: 'senha-trocada',
        momento: api.relogio.agora(),
        ator: { tipo: 'conta', contaId: aba.contaId },
      }),
    );
    expect(await fimDaAba(aba.id)).toBe('senha-trocada');
    expect(await fimDoChat(chat)).toBe('senha-trocada');
    expect((await renovar(aba.token)).json()).toMatchObject({ motivoDoFim: 'senha-trocada' });
  });

  it('Aparelho bloqueado: as sessões da aba e do chat dele terminam', async () => {
    const pc = await registrar('guid-fin-10', 'PC-FIN-10');
    const aba = await abrirAba(pc.token);
    const chat = await abrirChatNaAba(aba);
    expect((await comando('aba', 'bloquear', 'PC-FIN-10', '--endereco', host)).codigo).toBe(0);
    expect(await fimDaAba(aba.id)).toBe('aparelho-bloqueado');
    expect(await fimDoChat(chat)).toBe('sessao-da-aba-encerrada');
    expect((await renovar(aba.token)).statusCode).toBe(401);
  });

  it('a da senha parada há 30 minutos termina no pedido seguinte, com o chat na aba dela', async () => {
    const aba = await abrirAba(fin.token);
    const chat = await abrirChatNaAba(aba);
    await naOrg((tx) =>
      tx
        .update(sessoesDaAba)
        .set({
          entrada: 'senha',
          ultimoUsoEm: new Date(api.relogio.agora().getTime() - 30 * 60_000),
        })
        .where(eq(sessoesDaAba.id, aba.id)),
    );
    const r = await renovar(aba.token);
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ motivoDoFim: 'sem-uso' });
    expect(await fimDaAba(aba.id)).toBe('sem-uso');
    expect(await fimDoChat(chat)).toBe('sessao-da-aba-encerrada');
  });

  it('a troca da entrada do aparelho encerra as sessões da aba dele', async () => {
    const pc = await registrar('guid-fin-11', 'PC-FIN-11');
    const aba = await abrirAba(pc.token);
    expect((await comando('aba', 'entrada', 'PC-FIN-11', 'senha', '--endereco', host)).codigo).toBe(
      0,
    );
    expect(await fimDaAba(aba.id)).toBe('encerrada-pela-administracao');
  });

  it('o "Sair" da aba e a entrada nova encerram o chat na aba da sessão que termina', async () => {
    const aba = await abrirAba(fin.token);
    const chat = await abrirChatNaAba(aba);
    // A entrada nova no mesmo computador encerra a aberta da mesma conta, com o chat dela.
    const nova = await abrirAba(fin.token);
    expect(await fimDaAba(aba.id)).toBe('outra-sessao-no-aparelho');
    expect(await fimDoChat(chat)).toBe('sessao-da-aba-encerrada');
    const chatDaNova = await abrirChatNaAba(nova);
    const saida = await api.app.inject({
      method: 'DELETE',
      url: '/api/aba/sessao',
      remoteAddress: novoIp(),
      headers: comToken(nova.token),
    });
    expect(saida.statusCode).toBe(204);
    expect(await fimDoChat(chatDaNova)).toBe('sessao-da-aba-encerrada');
  });
});
