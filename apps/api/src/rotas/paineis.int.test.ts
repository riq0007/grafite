// Os painéis pela API (spec painel-de-dashboards; change painel-de-dashboards, design, decisões 1 e
// 2): o cadastro com o endereço conferido, a verificação na hora contra um servidor HTTP do teste, o
// evento só quando a situação muda e o que cada conta pode.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eventos, naOrganizacao } from '@grafite/db';
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
import { verificarEndereco, verificarPaineis } from '../paineis/paineis.ts';

const host = 'grafite.paineis.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
let ana: Entrada;
let davi: Entrada;
let servidor: Server;
let base = '';

beforeAll(async () => {
  servidor = createServer((pedido, resposta) => {
    resposta.statusCode = pedido.url === '/erro' ? 502 : 200;
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
