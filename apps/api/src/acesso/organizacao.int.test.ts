// A organização pelo endereço de acesso (spec isolamento-organizacoes): as rotas de acesso rodam
// no contexto da organização do endereço pedido, e um endereço desconhecido é recusado.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarOrganizacao } from '../../test/integracao.ts';
import { criarResolvedorDeOrganizacao, exigirOrganizacao } from './organizacao.ts';

let api: ApiDeTeste;
let orgA = '';
let orgB = '';

beforeAll(async () => {
  api = await abrirApi();
  orgA = await criarOrganizacao(api, {
    nome: 'Organização A',
    enderecos: ['grafite.a.local', '::1'],
  });
  orgB = await criarOrganizacao(api, { nome: 'Organização B', enderecos: ['grafite.b.local'] });
  const resolver = criarResolvedorDeOrganizacao({ banco: api.banco, agora: api.relogio.agora });
  // Uma rota de acesso de teste, que diz em que organização a requisição rodou.
  await api.app.register(async (escopo) => {
    exigirOrganizacao(escopo, resolver);
    escopo.get('/teste/organizacao', async (requisicao) => ({ id: requisicao.organizacao?.id }));
  });
});

afterAll(async () => {
  await api?.fechar();
});

const pedir = (host: string, url = '/teste/organizacao') =>
  api.app.inject({ method: 'GET', url, headers: { host } });

describe('organização pelo endereço', () => {
  it('cada endereço leva à própria organização', async () => {
    expect((await pedir('grafite.a.local')).json()).toEqual({ id: orgA });
    expect((await pedir('grafite.b.local')).json()).toEqual({ id: orgB });
  });

  it('o endereço vale sem diferenciar maiúsculas, com a porta e com os colchetes do IPv6', async () => {
    expect((await pedir('GRAFITE.A.Local:3000')).json()).toEqual({ id: orgA });
    expect((await pedir('grafite.a.local.')).json()).toEqual({ id: orgA });
    expect((await pedir('[::1]:3000')).json()).toEqual({ id: orgA });
  });

  it('o endereço desconhecido é recusado no formato único', async () => {
    const r = await pedir('grafite.desconhecido.local');
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:endereco-desconhecido',
      detail: 'Este endereço não está ligado a nenhuma organização.',
    });
  });

  it('a saúde responde em qualquer endereço', async () => {
    expect((await pedir('grafite.desconhecido.local', '/health')).statusCode).toBe(200);
  });

  it('um endereço registrado depois passa a valer em até 10 s', async () => {
    expect((await pedir('grafite.c.local')).statusCode).toBe(404);
    await criarOrganizacao(api, { nome: 'Organização C', enderecos: ['grafite.c.local'] });
    expect((await pedir('grafite.c.local')).statusCode).toBe(404);
    api.relogio.avancar(10_000);
    expect((await pedir('grafite.c.local')).statusCode).toBe(200);
  });
});
