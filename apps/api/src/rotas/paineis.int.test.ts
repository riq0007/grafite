// Os painéis pela API (spec painel-de-dashboards; change painel-de-dashboards, design, decisões 1 e
// 2): o cadastro com o endereço conferido, a verificação na hora contra um servidor HTTP do teste, o
// evento só quando a situação muda e o que cada conta pode.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eventos, naOrganizacao, paineis } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
} from '../../test/integracao.ts';
import { type VerificarEndereco, verificarEndereco, verificarPaineis } from '../paineis/paineis.ts';

const host = 'grafite.paineis.local';

/** A ferramenta em HTTPS dos testes: o painel é cadastrado nela, e o pedido vai ao servidor local. */
const FERRAMENTA = 'https://grafana.empresa.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
let ana: Entrada;
let davi: Entrada;
let servidor: Server;
let base = '';
/** A TI liberou o endereço do Grafite na ferramenta de `/liberavel`. */
let liberado = false;
/** A ferramenta de `/instavel` caiu. */
let caiu = false;

beforeAll(async () => {
  servidor = createServer((pedido, resposta) => {
    const caminho = pedido.url ?? '/';
    const salto = /^\/salto\/([1-4])$/.exec(caminho);
    if (caminho === '/erro' || (caminho === '/instavel' && caiu)) resposta.statusCode = 502;
    else if (caminho === '/privado') resposta.statusCode = 401;
    else if (caminho === '/fabrica' || caminho === '/instavel') {
      resposta.setHeader('X-Frame-Options', 'deny');
    } else if (caminho === '/liberavel') {
      if (liberado) {
        resposta.setHeader('Content-Security-Policy', `frame-ancestors https://${host}`);
      } else resposta.setHeader('X-Frame-Options', 'SAMEORIGIN');
    } else if (caminho === '/entrada') {
      resposta.statusCode = 302;
      resposta.setHeader('Location', '/login');
    } else if (salto) {
      // Quatro saltos em fila, e o último leva ao painel.
      const numero = Number(salto[1]);
      resposta.statusCode = 302;
      resposta.setHeader('Location', numero < 4 ? `/salto/${numero + 1}` : '/ok');
    }
    resposta.end('painel');
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const administra = await criarPerfil(api, org, {
    nome: 'Painéis',
    permissoes: ['paineis.administrar'],
  });
  const ve = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['paineis.ver'] });
  const daAna = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  const doDavi = await criarConta(api, org, { usuario: 'davi', nome: 'Davi Rocha' });
  await atribuir(api, org, { perfilId: administra, contaId: daAna.id });
  await atribuir(api, org, { perfilId: ve, contaId: doDavi.id });
  ana = await cliente.entrar('ana');
  davi = await cliente.entrar('davi');
});

afterAll(async () => {
  await api?.fechar();
  await new Promise((fim) => servidor?.close(fim));
});

const cadastrar = (corpo: object, quem: Entrada = ana) =>
  cliente.enviar('POST', '/paineis', quem, corpo);

describe('painéis pela API', () => {
  it('Painel novo: nasce sem verificação, e "Verificar agora" diz que está no ar', async () => {
    const r = await cadastrar({ nome: 'Produção da linha 2', endereco: `${base}/ok`, ordem: 1 });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ ordem: 1, verificacao: { situacao: 'sem-verificacao' } });
    const verificado = await cliente.enviar('POST', `/paineis/${r.json().id}/verificacao`, ana);
    expect(verificado.json().verificacao).toMatchObject({
      situacao: 'no-ar',
      motivo: null,
      momento: expect.any(String),
    });
  });

  it('Painel com erro do servidor: fora do ar, com o motivo, e o evento só quando muda', async () => {
    const r = await cadastrar({ nome: 'Qualidade', endereco: `${base}/erro` });
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    const primeira = await verificarPaineis(api.banco, org, {
      agora: api.relogio.agora(),
      verificar: verificarEndereco,
      ids: [r.json().id],
    });
    expect(primeira).toEqual({ verificados: 1, mudaram: 1 });
    const segunda = await verificarPaineis(api.banco, org, {
      agora: api.relogio.agora(),
      verificar: verificarEndereco,
      ids: [r.json().id],
    });
    expect(segunda).toEqual({ verificados: 1, mudaram: 0 });
    const gravados = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(eventos).where(eq(eventos.tipo, 'paineis.mudaram')),
    );
    expect(gravados).toHaveLength(1);
    const lista = await cliente.consultar('/paineis', ana);
    expect(
      lista.json().paineis.find((um: { nome: string }) => um.nome === 'Qualidade').verificacao,
    ).toMatchObject({ situacao: 'fora-do-ar', motivo: 'Respondeu 502' });
  });

  it('Painel que caiu: a conexão recusada fica fora do ar', async () => {
    const r = await cadastrar({ nome: 'Desligado', endereco: 'http://127.0.0.1:9/' });
    const verificado = await cliente.enviar('POST', `/paineis/${r.json().id}/verificacao`, ana);
    expect(verificado.json().verificacao.situacao).toBe('fora-do-ar');
  });

  it('Endereço sem o protocolo e nome repetido: recusados no campo', async () => {
    const semProtocolo = await cadastrar({ nome: 'Outro', endereco: '10.0.5.21:3000' });
    expect(semProtocolo.statusCode).toBe(400);
    expect(semProtocolo.json().campos).toEqual({
      endereco: 'Informe o endereço, como http://10.0.0.20:3000.',
    });
    const repetido = await cadastrar({ nome: 'QUALIDADE', endereco: `${base}/ok` });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().campos).toEqual({ nome: 'Já existe um painel com esse nome.' });
  });

  it('quem só vê os painéis lê a lista, na ordem, sem cadastrar', async () => {
    const lista = await cliente.consultar('/paineis', davi);
    expect(lista.json().permite).toEqual({ administrar: false });
    expect(lista.json().paineis[0].nome).toBe('Produção da linha 2');
    expect((await cadastrar({ nome: 'X', endereco: `${base}/ok` }, davi)).statusCode).toBe(403);
  });
});

// Spec painel-de-dashboards, "Exibição do painel" (change diagnostico-dos-paineis, design, decisão 3).
describe('a exibição pela verificação', () => {
  /** Pede à ferramenta em HTTPS pelo servidor local, e devolve o endereço final como o dela. */
  const pelaFerramenta: VerificarEndereco = async (endereco) => {
    const feito = await verificarEndereco(endereco.replace(FERRAMENTA, base));
    if (!('status' in feito.resposta)) return feito;
    const enderecoFinal = feito.resposta.enderecoFinal.replace(base, FERRAMENTA);
    return { ...feito, resposta: { ...feito.resposta, enderecoFinal } };
  };

  const verificar = (id: string, quem: VerificarEndereco = pelaFerramenta) =>
    verificarPaineis(api.banco, org, { agora: api.relogio.agora(), verificar: quem, ids: [id] });

  const gravado = async (id: string) => {
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({
          verificacao: paineis.verificacao,
          exibicao: paineis.exibicao,
          motivo: paineis.motivoDaExibicao,
        })
        .from(paineis)
        .where(eq(paineis.id, id)),
    );
    return linha;
  };

  const eventosDosPaineis = () =>
    naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(eventos).where(eq(eventos.tipo, 'paineis.mudaram')),
    );

  const cadastrado = async (nome: string, endereco: string): Promise<string> =>
    (await cadastrar({ nome, endereco })).json().id;

  it('Grafana de fábrica: no ar, mas recusa ser embutido, com o cabeçalho no motivo', async () => {
    const id = await cadastrado('Linha 2', `${FERRAMENTA}/fabrica`);
    expect(await gravado(id)).toEqual({
      verificacao: 'sem-verificacao',
      exibicao: null,
      motivo: null,
    });
    await verificar(id);
    expect(await gravado(id)).toEqual({
      verificacao: 'no-ar',
      exibicao: 'recusa',
      motivo: 'A ferramenta manda X-Frame-Options: DENY.',
    });
  });

  it('Ferramenta liberada depois: a exibição muda, e o evento sai só nessa hora', async () => {
    const id = await cadastrado('Chamados', `${FERRAMENTA}/liberavel`);
    await verificar(id);
    expect(await gravado(id)).toMatchObject({
      exibicao: 'recusa',
      motivo: 'A ferramenta manda X-Frame-Options: SAMEORIGIN.',
    });
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    // A verificação que não muda nada não grava evento.
    expect(await verificar(id)).toEqual({ verificados: 1, mudaram: 0 });
    expect(await eventosDosPaineis()).toHaveLength(0);

    liberado = true;
    expect(await verificar(id)).toEqual({ verificados: 1, mudaram: 1 });
    expect(await gravado(id)).toEqual({ verificacao: 'no-ar', exibicao: 'aparece', motivo: null });
    expect(await eventosDosPaineis()).toHaveLength(1);
  });

  it('Painel fora do ar: a exibição sai com a queda', async () => {
    const id = await cadastrado('Estoque', `${FERRAMENTA}/instavel`);
    await verificar(id);
    expect(await gravado(id)).toMatchObject({ verificacao: 'no-ar', exibicao: 'recusa' });
    caiu = true;
    await verificar(id);
    expect(await gravado(id)).toEqual({
      verificacao: 'fora-do-ar',
      exibicao: null,
      motivo: null,
    });
  });

  it('Página de entrada: o redirecionamento para a entrada e o 401 pedem a entrada', async () => {
    const wiki = await cadastrado('Wiki', `${base}/entrada`);
    await verificar(wiki, verificarEndereco);
    expect(await gravado(wiki)).toEqual({
      verificacao: 'no-ar',
      exibicao: 'pede-entrada',
      motivo: 'Levou à página de entrada.',
    });
    const privado = await cadastrado('Financeiro', `${base}/privado`);
    await verificar(privado, verificarEndereco);
    expect(await gravado(privado)).toMatchObject({
      exibicao: 'pede-entrada',
      motivo: 'Respondeu 401.',
    });
  });

  it('Painel em HTTP com o cabeçalho: aparece, porque vai pela ponte', async () => {
    const id = await cadastrado('Linha 3', `${base}/fabrica`);
    await verificar(id, verificarEndereco);
    expect(await gravado(id)).toEqual({ verificacao: 'no-ar', exibicao: 'aparece', motivo: null });
  });

  it('segue até 3 redirecionamentos, e a resposta seguinte vale como a do painel', async () => {
    expect((await verificarEndereco(`${base}/salto/2`)).resposta).toMatchObject({
      status: 200,
      enderecoFinal: `${base}/ok`,
    });
    expect((await verificarEndereco(`${base}/salto/1`)).resposta).toMatchObject({
      status: 302,
      enderecoFinal: `${base}/salto/4`,
    });
  });
});
