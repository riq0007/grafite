// O estado e os eventos da aba (spec aba-dos-colaboradores, "Estado da aba" e "Auditoria e eventos
// da aba"; spec eventos-em-tempo-real; design, decisão 6): o `GET /api/aba/estado` com as não lidas,
// as respostas novas e a versão da configuração, e o `GET /api/aba/eventos`, que manda à aba só os
// tipos que mudam o estado dela, com a marca dos que vão a muita gente, o sinal de vida e o fim da
// sessão. Qual evento chega a qual aba: a configuração a todas, a entrada e o bloqueio às do
// aparelho, o fim da sessão à aba e ao chat da aba daquela sessão.
import {
  atribuicoes,
  contas,
  grupos,
  horarioDaTi,
  naOrganizacao,
  numeracaoDosChamados,
  organizacoes,
  sessoes,
  sessoesDaAba,
  tiposDeChamado,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HORARIO_DOS_CHAMADOS } from '../../test/chamados.ts';
import { ligarDiretorioSimulado } from '../../test/diretorio.ts';
import { abrirEventos, type FluxoDeEventos } from '../../test/eventos.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  novoIp,
} from '../../test/integracao.ts';
import { encerrarSessoesDaConta } from '../acesso/encerramento.ts';
import { criarSessao, hashDoToken, NOME_DO_COOKIE } from '../acesso/sessoes.ts';
import { criarTiposDeFabrica } from '../chamados/fabrica.ts';
import { executarComando } from '../comando/executar.ts';
import { criarDiretorioSimulado } from '../diretorio/simulado.ts';
import { registrarEvento } from '../eventos/saida.ts';

const host = 'grafite.aba-eventos.local';
const ad = criarDiretorioSimulado();
let api: ApiDeTeste;
let org = '';
let chave = '';
let cliente: ReturnType<typeof clienteDaApi>;
let ana: Entrada;
let contaDaFernanda = '';
const abertos: FluxoDeEventos[] = [];

const SID_FERNANDA = 'S-1-5-21-1004336348-1177238915-682003330-1105';

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

const comando = async (...argumentos: string[]) => {
  const codigo = await executarComando([...argumentos, '--endereco', host], {
    banco: () => api.banco,
    agora: api.relogio.agora,
    escrever: () => {},
    escreverErro: () => {},
  });
  expect(codigo).toBe(0);
};

async function registrar(maquina: string, nome: string) {
  const r = await api.app.inject({
    method: 'POST',
    url: '/api/aba/aparelho',
    remoteAddress: novoIp(),
    headers: { host },
    payload: { chave, identificadorDaMaquina: maquina, nome, entradaSugerida: 'windows' },
  });
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as { token: string }).token;
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
  return (r.json() as { token: string }).token;
}

/** Os eventos da aba, pelo token da sessão da aba. */
async function eventosDaAba(token: string) {
  const fluxo = await abrirEventos(
    api,
    host,
    { cookie: '', csrf: '' },
    { caminho: '/api/aba/eventos', cabecalhos: { authorization: `Bearer ${token}` } },
  );
  abertos.push(fluxo);
  return fluxo;
}

const tipos = (fluxo: FluxoDeEventos) =>
  fluxo.mensagens.filter((m) => m.evento).map((m) => m.evento);

const estado = (token: string) =>
  api.app.inject({
    method: 'GET',
    url: '/api/aba/estado',
    remoteAddress: novoIp(),
    headers: comToken(token),
  });

let pcFin09 = '';
let pcFin10 = '';

beforeAll(async () => {
  api = await abrirApi({
    conectarDiretorio: ad.conectar,
    // A conferência fica nos 60 s: os fins pelo evento não passam por ela. O teste da conferência
    // abre outra API, no mesmo banco, com a curta.
    intervalosDosEventosDaAba: { sinalDeVida: 100 },
  });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const colaborador = await criarPerfil(api, org, {
    nome: 'Colaborador',
    permissoes: ['chat.usar', 'chamados.pedir'],
  });
  const daAna = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: colaborador, contaId: daAna.id });
  ana = await cliente.entrar('ana');
  const { saida } = await (async () => {
    const linhas: string[] = [];
    await executarComando(['aba', 'chave', 'criar', '--endereco', host], {
      banco: () => api.banco,
      agora: api.relogio.agora,
      escrever: (texto) => linhas.push(texto),
      escreverErro: (texto) => linhas.push(texto),
    });
    return { saida: linhas.join('\n') };
  })();
  chave = /Chave da aba: (\S+)/.exec(saida)?.[1] ?? '';
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
    tx.insert(atribuicoes).values({ orgId: org, perfilId: colaborador, grupoId: grupo?.id ?? '' }),
  );
  await ligarDiretorioSimulado(api, org, [[grupoDoAd, grupo?.id ?? '']]);
  pcFin09 = await registrar('guid-fin-09', 'PC-FIN-09');
  pcFin10 = await registrar('guid-fin-10', 'PC-FIN-10');
  // A primeira sessão da aba cria a conta de Fernanda pelo AD.
  await abrirAba(pcFin09);
  const [conta] = await naOrg((tx) =>
    tx.select({ id: contas.id }).from(contas).where(eq(contas.usuario, 'fernanda.lima')),
  );
  contaDaFernanda = conta?.id ?? '';
});

afterAll(async () => {
  for (const fluxo of abertos) fluxo.fechar();
  await api?.fechar();
});

describe('GET /aba/estado', () => {
  it('as não lidas, as respostas novas e a versão da configuração', async () => {
    const token = await abrirAba(pcFin09);
    const antes = await estado(token);
    expect(antes.statusCode, antes.body).toBe(200);
    expect(antes.json()).toEqual({
      naoLidas: 0,
      respostasNovas: 0,
      porVer: { quantas: 0, ultima: null },
      versaoDaConfiguracao: 0,
    });
    const mandada = await cliente.enviar(
      'POST',
      `/chat/diretas/${contaDaFernanda}/mensagens`,
      ana,
      {
        texto: 'O toner chegou.',
      },
    );
    expect(mandada.statusCode, mandada.body).toBe(201);
    await comando('aba', 'configurar', '--contato', 'Ramal 2000');
    expect((await estado(token)).json()).toEqual({
      naoLidas: 1,
      respostasNovas: 0,
      porVer: { quantas: 0, ultima: null },
      versaoDaConfiguracao: 1,
    });
  });

  it('a resposta por ver, com a última: quem, o chamado e a hora', async () => {
    const token = await abrirAba(pcFin09);
    await naOrg(async (tx) => {
      await criarTiposDeFabrica(tx, {
        ator: { tipo: 'sistema', descricao: 'teste da aba' },
        momento: api.relogio.agora(),
      });
      await tx
        .insert(horarioDaTi)
        .values({ orgId: org, ...HORARIO_DOS_CHAMADOS, dias: [...HORARIO_DOS_CHAMADOS.dias] });
      await tx.insert(numeracaoDosChamados).values({ orgId: org, ultimo: 1040 });
    });
    const [tipo] = await naOrg((tx) =>
      tx
        .select({ id: tiposDeChamado.id })
        .from(tiposDeChamado)
        .where(eq(tiposDeChamado.nome, 'Outro')),
    );
    const [daFernanda] = await naOrg((tx) =>
      tx.select({ pessoaId: contas.pessoaId }).from(contas).where(eq(contas.id, contaDaFernanda)),
    );
    const daTi = await criarPerfil(api, org, {
      nome: 'TI',
      permissoes: ['chat.usar', 'chamados.atender', 'pessoas.ver'],
    });
    const doTiago = await criarConta(api, org, { usuario: 'tiago', nome: 'Tiago Melo' });
    await atribuir(api, org, { perfilId: daTi, contaId: doTiago.id });
    const tiago = await cliente.entrar('tiago');
    const aberto = await cliente.enviar('POST', '/chamados', tiago, {
      pessoa: daFernanda?.pessoaId,
      tipo: tipo?.id,
      respostas: { relato: 'O monitor pisca.' },
      ficaComigo: true,
    });
    expect(aberto.statusCode, aberto.body).toBe(201);
    const { numero } = aberto.json() as { numero: number };
    const respondida = await cliente.enviar('POST', `/chamados/${numero}/mensagem`, tiago, {
      texto: 'Já vou ver.',
    });
    expect(respondida.statusCode, respondida.body).toBe(200);
    const lido = await estado(token);
    expect(lido.statusCode, lido.body).toBe(200);
    expect(lido.json()).toMatchObject({
      respostasNovas: 1,
      porVer: {
        quantas: 1,
        ultima: {
          quem: 'Tiago Melo',
          numero,
          titulo: expect.any(String),
          momento: api.relogio.agora().toISOString(),
        },
      },
    });
  });

  it('o token do aparelho não serve no lugar do da sessão', async () => {
    expect((await estado(pcFin09)).statusCode).toBe(401);
  });
});

describe('GET /aba/eventos', () => {
  it('abre o fluxo pelo token da sessão, com o sinal de vida', async () => {
    const fluxo = await eventosDaAba(await abrirAba(pcFin09));
    expect(fluxo.status).toBe(200);
    expect(fluxo.cabecalhos['content-type']).toBe('text/event-stream; charset=utf-8');
    await vi.waitFor(() => expect(fluxo.mensagens.some((m) => m.comentario === 'vivo')).toBe(true));
  });

  it('sem a sessão, recusa com 401', async () => {
    const fluxo = await eventosDaAba('token-que-nao-existe');
    expect(fluxo.status).toBe(401);
  });

  it('a mensagem direta à pessoa chega na hora, e o que é só da web não chega', async () => {
    const fluxo = await eventosDaAba(await abrirAba(pcFin09));
    await naOrg((tx) =>
      registrarEvento(tx, { tipo: 'padroes.mudaram', alvo: null, publico: { todas: true } }),
    );
    await cliente.enviar('POST', `/chat/diretas/${contaDaFernanda}/mensagens`, ana, {
      texto: 'Pode trazer o notebook.',
    });
    await vi.waitFor(() => expect(tipos(fluxo)).toContain('chat.mudou'), { timeout: 2000 });
    const mensagem = fluxo.mensagens.find((m) => m.evento === 'chat.mudou');
    expect(mensagem?.dados).toMatchObject({ tipo: 'chat.mudou', deMuitos: false });
    expect(tipos(fluxo)).not.toContain('padroes.mudaram');
  });

  it('a mensagem num canal vai a muita gente: a aba relê com o atraso', async () => {
    const fluxo = await eventosDaAba(await abrirAba(pcFin09));
    await naOrg((tx) =>
      registrarEvento(tx, {
        tipo: 'chat.mudou',
        alvo: { tipo: 'conversa', id: '0192a000-0000-7000-8000-00000000c0a1' },
        publico: { permissao: 'chat.usar' },
      }),
    );
    await vi.waitFor(() => expect(tipos(fluxo)).toContain('chat.mudou'), { timeout: 2000 });
    expect(fluxo.mensagens.find((m) => m.evento === 'chat.mudou')?.dados).toMatchObject({
      deMuitos: true,
    });
  });

  it('Aba configurada: todas as abas recebem, e a web não', async () => {
    const naNove = await eventosDaAba(await abrirAba(pcFin09));
    const naDez = await eventosDaAba(await abrirAba(pcFin10));
    const web = await abrirEventos(api, host, ana);
    abertos.push(web);
    await vi.waitFor(() => expect(web.mensagens).toHaveLength(1));
    await comando('aba', 'configurar', '--forma', 'entalhe');
    for (const fluxo of [naNove, naDez]) {
      await vi.waitFor(() => expect(tipos(fluxo)).toContain('configuracao-da-aba.mudou'), {
        timeout: 2000,
      });
      expect(
        fluxo.mensagens.find((m) => m.evento === 'configuracao-da-aba.mudou')?.dados,
      ).toMatchObject({ deMuitos: true });
    }
    expect(tipos(web)).not.toContain('configuracao-da-aba.mudou');
  });

  it('Computador bloqueado: a aba dele recebe o bloqueio e o fim, e a do outro não', async () => {
    const pc = await registrar('guid-fin-11', 'PC-FIN-11');
    const noOnze = await eventosDaAba(await abrirAba(pc));
    const noNove = await eventosDaAba(await abrirAba(pcFin09));
    await comando('aba', 'bloquear', 'PC-FIN-11');
    await vi.waitFor(() => expect(noOnze.terminou()).toBe(true), { timeout: 2000 });
    expect(tipos(noOnze)).toEqual(expect.arrayContaining(['bloqueio-da-aba.mudou', 'sessao']));
    expect(noOnze.mensagens.find((m) => m.evento === 'bloqueio-da-aba.mudou')?.dados).toMatchObject(
      { deMuitos: false },
    );
    expect(tipos(noNove)).not.toContain('bloqueio-da-aba.mudou');
    expect(noNove.terminou()).toBe(false);
  });

  it('a troca da entrada chega à aba do computador, que termina', async () => {
    const pc = await registrar('guid-fin-12', 'PC-FIN-12');
    const fluxo = await eventosDaAba(await abrirAba(pc));
    await comando('aba', 'entrada', 'PC-FIN-12', 'senha');
    await vi.waitFor(() => expect(fluxo.terminou()).toBe(true), { timeout: 2000 });
    expect(tipos(fluxo)).toEqual(expect.arrayContaining(['entrada-da-aba.mudou', 'sessao']));
  });

  it('o "Sair" termina a conexão da aba e a do chat na aba daquela sessão', async () => {
    const token = await abrirAba(pcFin10);
    const fluxo = await eventosDaAba(token);
    const [daAba] = await naOrg((tx) =>
      tx
        .select()
        .from(sessoesDaAba)
        .where(eq(sessoesDaAba.tokenHash, hashDoToken(token))),
    );
    const chat = await naOrg(async (tx) => {
      const criada = await criarSessao(tx, {
        contaId: daAba?.contaId ?? '',
        momento: api.relogio.agora(),
        ip: '127.0.0.1',
        agente: 'Grafite Aba',
        pendente: false,
      });
      await tx
        .update(sessoes)
        .set({ alcance: 'chat-da-aba', sessaoDaAbaId: daAba?.id ?? '' })
        .where(eq(sessoes.id, criada.id));
      return criada;
    });
    const doChat = await abrirEventos(api, host, {
      cookie: `${NOME_DO_COOKIE}=${chat.token}`,
      csrf: chat.tokenCsrf,
    });
    abertos.push(doChat);
    const outra = await eventosDaAba(await abrirAba(pcFin09));
    const saida = await api.app.inject({
      method: 'DELETE',
      url: '/api/aba/sessao',
      remoteAddress: novoIp(),
      headers: comToken(token),
    });
    expect(saida.statusCode).toBe(204);
    await vi.waitFor(() => expect(fluxo.terminou()).toBe(true), { timeout: 2000 });
    expect(tipos(fluxo)).toContain('sessao');
    await vi.waitFor(() => expect(doChat.terminou()).toBe(true), { timeout: 2000 });
    expect(tipos(doChat)).toContain('sessao.encerrada');
    expect(outra.terminou()).toBe(false);
  });

  it('Conta inativada: a mudança da conta termina a conexão da aba', async () => {
    const fluxo = await eventosDaAba(await abrirAba(pcFin09));
    await naOrg((tx) =>
      encerrarSessoesDaConta(tx, {
        contaId: contaDaFernanda,
        motivo: 'conta-inativada',
        momento: api.relogio.agora(),
        ator: { tipo: 'sistema', descricao: 'teste' },
      }),
    );
    await vi.waitFor(() => expect(fluxo.terminou()).toBe(true), { timeout: 2000 });
    expect(tipos(fluxo)).toContain('sessao');
  });

  it('a conferência termina a conexão da sessão que venceu sem ninguém gravar o fim', async () => {
    const token = await abrirAba(pcFin09);
    const comConferencia = await abrirApi({
      conectarDiretorio: ad.conectar,
      relogio: api.relogio,
      intervalosDosEventosDaAba: { sinalDeVida: 100, conferencia: 200 },
    });
    const fluxo = await abrirEventos(
      comConferencia,
      host,
      { cookie: '', csrf: '' },
      { caminho: '/api/aba/eventos', cabecalhos: { authorization: `Bearer ${token}` } },
    );
    abertos.push(fluxo);
    expect(fluxo.status).toBe(200);
    await naOrg((tx) =>
      tx
        .update(sessoesDaAba)
        .set({ expiraEm: api.relogio.agora() })
        .where(eq(sessoesDaAba.tokenHash, hashDoToken(token))),
    );
    await vi.waitFor(() => expect(fluxo.terminou()).toBe(true), { timeout: 2000 });
    expect(tipos(fluxo)).toContain('sessao');
    await comConferencia.fechar();
  });

  it('a quarta conexão da mesma sessão entra, e a mais antiga termina', async () => {
    const token = await abrirAba(pcFin10);
    const primeira = await eventosDaAba(token);
    const segunda = await eventosDaAba(token);
    const terceira = await eventosDaAba(token);
    const quarta = await eventosDaAba(token);
    expect(quarta.status).toBe(200);
    await vi.waitFor(() => expect(primeira.terminou()).toBe(true), { timeout: 2000 });
    expect(tipos(primeira)).not.toContain('sessao');
    expect(segunda.terminou()).toBe(false);
    expect(terceira.terminou()).toBe(false);
  });

  it('o módulo desligado chega à aba, que relê o estado sem as contagens dele', async () => {
    const token = await abrirAba(pcFin09);
    const fluxo = await eventosDaAba(token);
    const desligar = (desligados: string[]) =>
      naOrg(async (tx) => {
        await tx
          .update(organizacoes)
          .set({ modulosDesligados: desligados })
          .where(eq(organizacoes.id, org));
        await registrarEvento(tx, {
          tipo: 'modulos.mudaram',
          alvo: null,
          publico: { todas: true },
        });
      });
    await desligar(['chat', 'chamados']);
    await vi.waitFor(() => expect(tipos(fluxo)).toContain('modulos.mudaram'), { timeout: 2000 });
    expect(fluxo.mensagens.find((m) => m.evento === 'modulos.mudaram')?.dados).toMatchObject({
      deMuitos: true,
    });
    expect((await estado(token)).json()).toMatchObject({
      naoLidas: null,
      respostasNovas: null,
      porVer: null,
    });
    await desligar([]);
  });
});
