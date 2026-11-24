// A sessão da aba pelo Windows (spec aba-dos-colaboradores, "Pessoa pelo usuário do Windows" e
// "Sessão da aba"; design, decisões 3 e 4), com o AD em memória: a sessão de 1 hora pelo SID, a conta
// criada pelo diretório, a renovação que estende a mesma sessão e confere a pessoa, a que encerra
// quem saiu do grupo, o teto do aparelho, as recusas com a auditoria uma vez, e o token da sessão só
// nas rotas da aba, sem o cookie nelas.
import {
  aparelhosDaAba,
  atribuicoes,
  auditoria,
  contas,
  grupos,
  naOrganizacao,
  sessoesDaAba,
} from '@grafite/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ligarDiretorioSimulado } from '../../test/diretorio.ts';
import {
  type ApiDeTeste,
  abrirApi,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  novoIp,
} from '../../test/integracao.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { executarComando } from '../comando/executar.ts';
import { criarDiretorioSimulado } from '../diretorio/simulado.ts';

const host = 'grafite.aba-sessao.local';
const ad = criarDiretorioSimulado();
let api: ApiDeTeste;
let org = '';
let chave = '';
const MINUTO = 60_000;
const dns: Record<string, string> = {};

const SID = {
  fernanda: 'S-1-5-21-1004336348-1177238915-682003330-1105',
  sergio: 'S-1-5-21-1004336348-1177238915-682003330-1106',
  paulo: 'S-1-5-21-1004336348-1177238915-682003330-1110',
  rita: 'S-1-5-21-1004336348-1177238915-682003330-1111',
  local: 'S-1-5-21-3623811015-3361044348-30300820-1013',
};

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

const abrir = (tokenDoAparelho: string, sid: string, ip = novoIp()) =>
  api.app.inject({
    method: 'POST',
    url: '/api/aba/sessao',
    remoteAddress: ip,
    headers: comToken(tokenDoAparelho),
    payload: { entrada: 'windows', sid, usuarioDoWindows: 'EMPRESA\\fernanda.lima' },
  });

const renovar = (tokenDaSessao: string, sid: string) =>
  api.app.inject({
    method: 'POST',
    url: '/api/aba/sessao/renovar',
    remoteAddress: novoIp(),
    headers: comToken(tokenDaSessao),
    payload: { sid },
  });

const sessaoDo = async (token: string) =>
  (
    await naOrg((tx) =>
      tx
        .select()
        .from(sessoesDaAba)
        .where(eq(sessoesDaAba.tokenHash, hashDoToken(token))),
    )
  )[0];

const acoes = (acao: string) =>
  naOrg((tx) =>
    tx.select().from(auditoria).where(eq(auditoria.acao, acao)).orderBy(auditoria.momento),
  );

let fin: { token: string; identificadorCurto: string };

beforeAll(async () => {
  api = await abrirApi({ conectarDiretorio: ad.conectar });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  const { saida } = await comando('aba', 'chave', 'criar', '--endereco', host);
  chave = /Chave da aba: (\S+)/.exec(saida)?.[1] ?? '';
  const perfil = await criarPerfil(api, org, {
    nome: 'Colaborador',
    permissoes: ['chat.usar', 'chamados.pedir'],
  });
  dns.fernanda = ad.usuario({
    usuario: 'fernanda.lima',
    nome: 'Fernanda Lima',
    email: 'fernanda@empresa.com',
    senha: 'x',
    sid: SID.fernanda,
  });
  dns.sergio = ad.usuario({
    usuario: 'sergio.prado',
    nome: 'Sérgio Prado',
    senha: 'x',
    sid: SID.sergio,
  });
  dns.paulo = ad.usuario({ usuario: 'paulo.reis', nome: 'Paulo Reis', senha: 'x', sid: SID.paulo });
  dns.rita = ad.usuario({ usuario: 'rita.moura', nome: 'Rita Moura', senha: 'x', sid: SID.rita });
  dns.grupo = ad.grupo('Colaboradores-Financeiro', [dns.fernanda, dns.sergio, dns.paulo, dns.rita]);
  const [grupo] = await naOrg((tx) =>
    tx
      .insert(grupos)
      .values({ orgId: org, nome: 'Colaboradores', nomeNormalizado: 'colaboradores' })
      .returning({ id: grupos.id }),
  );
  await naOrg((tx) =>
    tx.insert(atribuicoes).values({ orgId: org, perfilId: perfil, grupoId: grupo?.id ?? '' }),
  );
  await ligarDiretorioSimulado(api, org, [[dns.grupo, grupo?.id ?? '']]);
  fin = await registrar('guid-fin-09', 'PC-FIN-09');
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(() => {
  ad.estado.foraDoAr = false;
});

describe('a sessão pelo Windows', () => {
  it('Fernanda na aba pela primeira vez: a conta do diretório e a sessão de 1 hora', async () => {
    const r = await abrir(fin.token, SID.fernanda);
    expect(r.statusCode, r.body).toBe(200);
    const corpo = r.json();
    expect(corpo).toMatchObject({
      pessoa: { nome: 'Fernanda Lima' },
      expiraEm: new Date(api.relogio.agora().getTime() + 60 * MINUTO).toISOString(),
    });
    expect(corpo.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [conta] = await naOrg((tx) =>
      tx.select().from(contas).where(eq(contas.usuario, 'fernanda.lima')),
    );
    expect(conta?.origem).toBe('diretorio');
    expect(await sessaoDo(corpo.token)).toMatchObject({
      contaId: conta?.id,
      entrada: 'windows',
      ativadaEm: api.relogio.agora(),
      encerradaEm: null,
    });
    const abertas = await acoes('sessao-da-aba.aberta');
    expect(abertas.at(-1)).toMatchObject({
      atorTipo: 'conta',
      dados: {
        computador: 'PC-FIN-09',
        identificador: fin.identificadorCurto,
        entrada: 'windows',
        sid: SID.fernanda,
        usuarioDoWindows: 'EMPRESA\\fernanda.lima',
      },
    });
  });

  it('a nova entrada encerra a aberta da mesma conta no aparelho, e o token dela para de valer', async () => {
    const primeira = (await abrir(fin.token, SID.fernanda)).json().token;
    const segunda = (await abrir(fin.token, SID.fernanda)).json().token;
    expect(await sessaoDo(primeira)).toMatchObject({ motivoDoFim: 'outra-sessao-no-aparelho' });
    const recusada = await renovar(primeira, SID.fernanda);
    expect(recusada.statusCode).toBe(401);
    // O motivo do fim vai junto: a aba que perdeu o evento não pede outra sozinha.
    expect(recusada.json()).toMatchObject({ motivoDoFim: 'outra-sessao-no-aparelho' });
    expect((await renovar(segunda, SID.fernanda)).statusCode).toBe(200);
  });

  it('a vencida é encerrada como sem uso na entrada seguinte', async () => {
    const token = (await abrir(fin.token, SID.fernanda)).json().token;
    api.relogio.avancar(61 * MINUTO);
    const vencida = await renovar(token, SID.fernanda);
    expect(vencida.statusCode).toBe(401);
    expect(vencida.json()).toMatchObject({ detail: 'A sessão da aba terminou.' });
    expect((await abrir(fin.token, SID.fernanda)).statusCode).toBe(200);
    expect(await sessaoDo(token)).toMatchObject({ motivoDoFim: 'sem-uso' });
  });
});

describe('a renovação', () => {
  it('estende a mesma sessão, conferindo a pessoa, sem ir à auditoria', async () => {
    const token = (await abrir(fin.token, SID.fernanda)).json().token;
    const antes = await sessaoDo(token);
    const abertas = (await acoes('sessao-da-aba.aberta')).length;
    api.relogio.avancar(50 * MINUTO);
    const r = await renovar(token, SID.fernanda);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().expiraEm).toBe(
      new Date(api.relogio.agora().getTime() + 60 * MINUTO).toISOString(),
    );
    const depois = await sessaoDo(token);
    expect(depois?.id).toBe(antes?.id);
    expect(depois?.expiraEm).toEqual(new Date(api.relogio.agora().getTime() + 60 * MINUTO));
    expect(await acoes('sessao-da-aba.aberta')).toHaveLength(abertas);
  });

  it('com o AD fora do ar, a sessão segue valendo e a aba tenta de novo', async () => {
    const token = (await abrir(fin.token, SID.fernanda)).json().token;
    ad.estado.foraDoAr = true;
    const r = await renovar(token, SID.fernanda);
    expect(r.statusCode).toBe(503);
    expect(r.json()).toMatchObject({ motivo: 'ti-fora-do-alcance' });
    expect(await sessaoDo(token)).toMatchObject({ encerradaEm: null });
    // Nos 30 segundos seguintes, a API responde sem tentar o AD; depois, tenta de novo.
    ad.estado.foraDoAr = false;
    const tentativas = ad.estado.acessos.length;
    expect((await renovar(token, SID.fernanda)).statusCode).toBe(503);
    expect(ad.estado.acessos.length).toBe(tentativas);
    api.relogio.avancar(31_000);
    expect((await renovar(token, SID.fernanda)).statusCode).toBe(200);
  });

  it('a recusa leva à auditoria o detalhe que a frase da tela junta', async () => {
    const carla = ad.usuario({
      usuario: 'carla.dias',
      nome: 'Carla Dias',
      senha: 'x',
      ativa: false,
      sid: 'S-1-5-21-1004336348-1177238915-682003330-1112',
    });
    ad.incluir(carla, dns.grupo ?? '');
    const pc = await registrar('guid-carla', 'PC-CARLA');
    const r = await abrir(pc.token, 'S-1-5-21-1004336348-1177238915-682003330-1112');
    expect(r.json()).toMatchObject({ motivo: 'sem-grupo' });
    expect((await acoes('sessao-da-aba.recusada')).at(-1)).toMatchObject({
      dados: {
        computador: 'PC-CARLA',
        motivo: 'sem-grupo',
        detalhe: 'desativada-no-ad',
        usuario: 'carla.dias',
        nome: 'Carla Dias',
      },
    });
  });

  it('quem saiu do grupo mapeado tem a sessão encerrada, com a auditoria', async () => {
    const sergio = await registrar('guid-sergio', 'PC-SERGIO');
    const token = (await abrir(sergio.token, SID.sergio)).json().token;
    ad.tirar(dns.sergio ?? '', dns.grupo ?? '');
    const r = await renovar(token, SID.sergio);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ motivo: 'sem-grupo' });
    expect(await sessaoDo(token)).toMatchObject({ motivoDoFim: 'pessoa-recusada' });
    expect((await acoes('sessao-da-aba.encerrada')).at(-1)).toMatchObject({
      dados: { computador: 'PC-SERGIO', motivo: 'pessoa-recusada', recusa: 'sem-grupo' },
    });
    expect((await renovar(token, SID.sergio)).statusCode).toBe(401);
    ad.incluir(dns.sergio ?? '', dns.grupo ?? '');
  });

  it('outro SID na renovação encerra a sessão da pessoa', async () => {
    const token = (await abrir(fin.token, SID.fernanda)).json().token;
    const r = await renovar(token, SID.paulo);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ motivo: 'usuario-de-fora' });
    expect(await sessaoDo(token)).toMatchObject({ motivoDoFim: 'pessoa-recusada' });
  });
});

describe('as recusas', () => {
  it('Usuário local do Windows: a frase, sem conta, e a auditoria uma vez pelo mesmo motivo', async () => {
    const local = await registrar('guid-local', 'PC-LOCAL');
    for (const _ of [1, 2]) {
      const r = await abrir(local.token, SID.local);
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({
        motivo: 'usuario-de-fora',
        detail: 'Entre no Windows com o seu usuário da empresa para usar a aba.',
      });
    }
    const recusas = (await acoes('sessao-da-aba.recusada')).filter(
      (linha) => (linha.dados as { computador?: string }).computador === 'PC-LOCAL',
    );
    expect(recusas).toMatchObject([{ dados: { motivo: 'usuario-de-fora', pessoa: SID.local } }]);
  });

  it('duas pessoas recusadas alternando no mesmo aparelho ficam uma vez cada na auditoria', async () => {
    const rdp = await registrar('guid-rdp', 'SRV-RDP-01');
    const outro = 'S-1-5-21-3623811015-3361044348-30300820-1014';
    for (const sid of [SID.local, outro, SID.local, outro]) {
      expect((await abrir(rdp.token, sid)).statusCode).toBe(403);
    }
    const doRdp = (await acoes('sessao-da-aba.recusada')).filter(
      (linha) => (linha.dados as { computador?: string }).computador === 'SRV-RDP-01',
    );
    expect(doRdp.map((linha) => (linha.dados as { pessoa?: string }).pessoa)).toEqual([
      SID.local,
      outro,
    ]);
  });

  it('o AD fora do ar não vai à auditoria como pessoa recusada', async () => {
    const pc = await registrar('guid-queda', 'PC-QUEDA');
    ad.estado.foraDoAr = true;
    expect((await abrir(pc.token, SID.fernanda)).statusCode).toBe(503);
    ad.estado.foraDoAr = false;
    api.relogio.avancar(31_000);
    const daQueda = (await acoes('sessao-da-aba.recusada')).filter(
      (linha) => (linha.dados as { computador?: string }).computador === 'PC-QUEDA',
    );
    expect(daQueda).toEqual([]);
  });

  it('o aparelho com a entrada pela senha recusa o pedido pelo SID', async () => {
    const generico = await registrar('guid-linha', 'PC-LINHA-01', 'senha');
    const r = await abrir(generico.token, SID.fernanda);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:entrada-do-aparelho-diferente' });
  });

  it('o teto do aparelho recusa a conta a mais em 24 horas, e a de antes segue', async () => {
    const sala = await registrar('guid-sala', 'PC-SALA');
    await naOrg((tx) =>
      tx
        .update(aparelhosDaAba)
        .set({ tetoDeContas: 2 })
        .where(eq(aparelhosDaAba.identificadorDaMaquina, 'guid-sala')),
    );
    expect((await abrir(sala.token, SID.fernanda)).statusCode).toBe(200);
    expect((await abrir(sala.token, SID.paulo)).statusCode).toBe(200);
    const terceira = await abrir(sala.token, SID.rita);
    expect(terceira.statusCode).toBe(403);
    expect(terceira.json()).toMatchObject({
      motivo: 'teto-do-aparelho',
      detail: 'Este computador abriu a aba para muitas pessoas hoje. Fale com a TI.',
    });
    expect(
      await naOrg((tx) => tx.select().from(contas).where(eq(contas.usuario, 'rita.moura'))),
    ).toEqual([]);
    expect((await abrir(sala.token, SID.fernanda)).statusCode).toBe(200);
    api.relogio.avancar(24 * 60 * MINUTO + MINUTO);
    expect((await abrir(sala.token, SID.rita)).statusCode).toBe(200);
  });

  it('o aparelho bloqueado recusa a renovação', async () => {
    const bloq = await registrar('guid-bloq', 'PC-BLOQ');
    const token = (await abrir(bloq.token, SID.fernanda)).json().token;
    const bloqueio = await comando('aba', 'bloquear', bloq.identificadorCurto, '--endereco', host);
    expect(bloqueio, bloqueio.saida).toMatchObject({ codigo: 0 });
    const r = await renovar(token, SID.fernanda);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      detail: 'Este computador foi bloqueado na aba. Fale com a TI.',
    });
  });
});

describe('o token da sessão e o cookie', () => {
  it('Token da aba fora da aba: a lista dos ativos recusa como sem sessão', async () => {
    const token = (await abrir(fin.token, SID.fernanda)).json().token;
    const r = await api.app.inject({
      method: 'GET',
      url: '/api/ativos',
      remoteAddress: novoIp(),
      headers: comToken(token),
    });
    expect(r.statusCode).toBe(401);
  });

  it('o cookie da web não vale nas rotas da aba, e o token do aparelho não é o da sessão', async () => {
    const entrada = await clienteDaApi(api, host).entrar('ana');
    const comCookie = await api.app.inject({
      method: 'POST',
      url: '/api/aba/sessao/renovar',
      remoteAddress: novoIp(),
      headers: { host, cookie: entrada.cookie, 'x-grafite-csrf': entrada.csrf },
      payload: { sid: SID.fernanda },
    });
    expect(comCookie.statusCode).toBe(401);
    expect((await renovar(fin.token, SID.fernanda)).statusCode).toBe(401);
    // E o token da sessão não é o do aparelho.
    const token = (await abrir(fin.token, SID.fernanda)).json().token;
    const comoAparelho = await abrir(token, SID.fernanda);
    expect(comoAparelho.statusCode).toBe(401);
    expect(
      await naOrg((tx) =>
        tx
          .select()
          .from(sessoesDaAba)
          .where(and(eq(sessoesDaAba.tokenHash, hashDoToken(token)))),
      ),
    ).toHaveLength(1);
  });
});
