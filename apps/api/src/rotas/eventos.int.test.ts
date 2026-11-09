// A conexão de eventos (spec eventos-em-tempo-real; design do F2c, decisão 11): o GET /api/eventos,
// só com a sessão que vale, que entrega em até 2 s depois do commit o que a conta pode receber,
// manda o sinal de vida, não conta como uso da sessão e termina com ela.
import { contas, naOrganizacao, sessoes } from '@grafite/db';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { abrirEventos, type FluxoDeEventos } from '../../test/eventos.ts';
import {
  type ApiDeTeste,
  abrirApi,
  ativarDoisPassos,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.eventos.local';
const MINUTO = 60_000;

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
/** Administradora. */
let ana: Entrada;
/** Vê pessoas só em Jundiaí. */
let bruno: Entrada;
const ids: Record<string, string> = {};
const abertos: FluxoDeEventos[] = [];

beforeAll(async () => {
  api = await abrirApi({ intervalosDosEventos: { sinalDeVida: 100, conferencia: 200 } });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  const leitura = await criarPerfil(api, org, { nome: 'Leitura', permissoes: ['pessoas.ver'] });
  const daAna = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administrador, contaId: daAna.id });
  const doBruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: leitura, contaId: doBruno.id, localId: ids.jundiai });
  ana = await cliente.entrar('ana');
  bruno = await cliente.entrar('bruno');
});

afterAll(async () => {
  for (const fluxo of abertos) fluxo.fechar();
  await api?.fechar();
});

async function eventosDe(entrada: Entrada) {
  const fluxo = await abrirEventos(api, host, entrada);
  abertos.push(fluxo);
  return fluxo;
}

const tipos = (fluxo: FluxoDeEventos) =>
  fluxo.mensagens.filter((m) => m.evento).map((m) => m.evento);

/** O último uso gravado na sessão mais recente da conta. */
function ultimoUso(usuario: string) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .select({ ultimoUsoEm: sessoes.ultimoUsoEm })
      .from(sessoes)
      .innerJoin(contas, and(eq(contas.orgId, sessoes.orgId), eq(contas.id, sessoes.contaId)))
      .where(eq(contas.usuario, usuario))
      .orderBy(desc(sessoes.criadaEm))
      .limit(1);
    return linha?.ultimoUsoEm;
  });
}

describe('GET /eventos', () => {
  it('sem sessão, recusa com 401', async () => {
    const r = await cliente.consultar('/eventos', SEM_ENTRADA);
    expect(r.statusCode).toBe(401);
  });

  it('com a sessão pendente, recusa com 403, dizendo que a entrada não terminou', async () => {
    const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
    await ativarDoisPassos(api, org, carla.id);
    const r = await cliente.consultar('/eventos', await cliente.entrar('carla'));
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ pendencia: 'segundo-passo' });
  });

  it('abre o fluxo com os cabeçalhos e o intervalo de reconexão', async () => {
    const fluxo = await eventosDe(ana);
    expect(fluxo.status).toBe(200);
    expect(fluxo.cabecalhos).toMatchObject({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    });
    await vi.waitFor(() => expect(fluxo.mensagens[0]).toEqual({ retry: 3000 }));
  });

  it('entrega o evento em até 2 s depois do commit, sem dados além do tipo, do momento e do alvo', async () => {
    const fluxo = await eventosDe(ana);
    const r = await cliente.enviar('PATCH', '/organizacao/padroes', ana, {
      mudancas: { aparencia: { tema: 'nevoa' } },
    });
    expect(r.statusCode).toBe(200);
    const enviadoEm = Date.now();
    await vi.waitFor(() => expect(tipos(fluxo)).toContain('padroes.mudaram'), { timeout: 2000 });
    expect(Date.now() - enviadoEm).toBeLessThan(2000);
    const mensagem = fluxo.mensagens.find((m) => m.evento === 'padroes.mudaram');
    expect(mensagem).toEqual({
      id: expect.any(String),
      evento: 'padroes.mudaram',
      dados: {
        id: mensagem?.id,
        tipo: 'padroes.mudaram',
        momento: expect.any(String),
        alvo: { tipo: 'organizacao', id: org },
      },
    });
  });

  it('a conta com escopo de local recebe só os eventos das pessoas que ela vê', async () => {
    const joao = await criarPessoa(api, org, { nome: 'João da Silva', localId: ids.jundiai });
    const maria = await criarPessoa(api, org, { nome: 'Maria Rocha', localId: ids.campinas });
    const fluxo = await eventosDe(bruno);
    await vi.waitFor(() => expect(fluxo.mensagens).toHaveLength(1));
    await cliente.enviar('PATCH', `/pessoas/${maria}`, ana, { telefone: '2040' });
    await cliente.enviar('PATCH', `/pessoas/${joao}`, ana, { telefone: '2041' });
    await vi.waitFor(() => expect(tipos(fluxo)).toContain('pessoas.mudaram'), { timeout: 2000 });
    const alvos = fluxo.mensagens
      .filter((m) => m.evento === 'pessoas.mudaram')
      .map((m) => (m.dados as { alvo: { id: string } }).alvo.id);
    expect(alvos).toEqual([joao]);
  });

  it('manda o sinal de vida', async () => {
    const fluxo = await eventosDe(ana);
    await vi.waitFor(() => expect(fluxo.mensagens.some((m) => m.comentario === 'vivo')).toBe(true));
  });

  it('não conta como uso da sessão, nem ao abrir nem ao conferir a sessão', async () => {
    const davi = await criarConta(api, org, { usuario: 'davi', nome: 'Davi Rocha' });
    expect(davi.id).toBeTruthy();
    const entrada = await cliente.entrar('davi');
    const antes = await ultimoUso('davi');
    api.relogio.avancar(30 * MINUTO);
    const fluxo = await eventosDe(entrada);
    expect(fluxo.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await ultimoUso('davi')).toEqual(antes);
  });

  it('a sessão encerrada por uma ação recebe sessao.encerrada, e a conexão termina', async () => {
    const noComputador = await cliente.entrar('ana');
    const noCelular = await cliente.entrar('ana');
    const fluxo = await eventosDe(noCelular);
    await vi.waitFor(() => expect(fluxo.mensagens).toHaveLength(1));
    const doCelular = (await cliente.consultar('/conta/sessoes', noCelular))
      .json()
      .find((sessao: { atual: boolean }) => sessao.atual) as { id: string };
    const r = await cliente.enviar('DELETE', `/conta/sessoes/${doCelular.id}`, noComputador);
    expect(r.statusCode).toBe(204);
    await vi.waitFor(() => expect(fluxo.terminou()).toBe(true), { timeout: 2000 });
    expect(fluxo.mensagens.at(-1)).toMatchObject({
      evento: 'sessao.encerrada',
      dados: { alvo: { tipo: 'sessao', id: doCelular.id } },
    });
  });

  it('a sessão que expira manda sessao e fecha a conexão', async () => {
    await criarConta(api, org, { usuario: 'elisa', nome: 'Elisa Prado' });
    const fluxo = await eventosDe(await cliente.entrar('elisa'));
    await vi.waitFor(() => expect(fluxo.mensagens).toHaveLength(1));
    api.relogio.avancar(2 * 60 * MINUTO + MINUTO);
    await vi.waitFor(() => expect(fluxo.terminou()).toBe(true), { timeout: 2000 });
    expect(fluxo.mensagens.at(-1)).toMatchObject({ evento: 'sessao' });
  });

  it('aceita até 20 conexões por sessão e recusa a seguinte com 429', async () => {
    await criarConta(api, org, { usuario: 'fabio', nome: 'Fábio Mendes' });
    const entrada = await cliente.entrar('fabio');
    const fluxos = await Promise.all(Array.from({ length: 20 }, () => eventosDe(entrada)));
    expect(fluxos.map((fluxo) => fluxo.status)).toEqual(Array(20).fill(200));
    const demais = await eventosDe(entrada);
    expect(demais.status).toBe(429);
    await vi.waitFor(() => expect(demais.terminou()).toBe(true));
    expect(JSON.parse(demais.corpo())).toMatchObject({
      type: 'urn:grafite:problema:conexoes-demais',
    });
    // Fechada uma, outra pode abrir.
    fluxos[0]?.fechar();
    await vi.waitFor(async () => expect((await eventosDe(entrada)).status).toBe(200));
  });
});

describe('o fechamento da API', () => {
  it('fecha as conexões de eventos abertas, sem esperar por elas', async () => {
    const outra = await abrirApi();
    const hostDaOutra = 'grafite.eventos-fechamento.local';
    const orgDaOutra = await criarOrganizacao(outra, { nome: 'Outra', enderecos: [hostDaOutra] });
    await criarConta(outra, orgDaOutra, { usuario: 'gabi', nome: 'Gabi Lopes' });
    const entrada = await clienteDaApi(outra, hostDaOutra).entrar('gabi');
    const fluxo = await abrirEventos(outra, hostDaOutra, entrada);
    expect(fluxo.status).toBe(200);
    const inicio = Date.now();
    await outra.fechar();
    expect(Date.now() - inicio).toBeLessThan(2000);
    await vi.waitFor(() => expect(fluxo.terminou()).toBe(true));
  });
});
