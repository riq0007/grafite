// A rota das etiquetas (spec etiquetas-de-ativos, "Tela das etiquetas"; design do P1f, decisão 4): os
// ativos pedidos, na ordem pedida e sem repetir, só os que a conta vê no local deles, com quantos
// ficaram de fora, e a recusa de mais de 200.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.etiquetas.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};
const id = (chave: string) => ids[chave] ?? '';
const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

const etiquetas = (lista: string[], usuario = 'ana') =>
  cliente.consultar(`/ativos/etiquetas?ids=${lista.join(',')}`, como(usuario));

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });

  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['catalogo.administrar', 'modelos.editar', 'ativos.editar'],
  });
  const ver = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['ativos.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: ver, contaId: bruno.id, localId: id('jundiai') });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);

  const criar = async (caminho: string, pedido: object) =>
    (await cliente.enviar('POST', caminho, como('ana'), pedido)).json().id as string;
  ids.impressora = await criar('/tipos-de-ativo', { nome: 'Impressora', icone: 'impressora' });
  ids.switch = await criar('/tipos-de-ativo', { nome: 'Switch', icone: 'switch' });
  ids.m404 = await criar('/modelos', {
    tipoId: id('impressora'),
    fabricante: 'HP',
    nome: 'LaserJet M404',
  });
  ids.pat412 = await criar('/ativos', {
    tipoId: id('impressora'),
    modeloId: id('m404'),
    valores: { 'ativo.patrimonio': 'PAT-00412', 'ativo.local': id('jundiai') },
  });
  ids.pat500 = await criar('/ativos', {
    tipoId: id('impressora'),
    modeloId: id('m404'),
    valores: { 'ativo.patrimonio': 'PAT-00500', 'ativo.local': id('campinas') },
  });
  ids.semPatrimonio = await criar('/ativos', {
    tipoId: id('switch'),
    valores: { 'ativo.nome': 'Switch do rack 2', 'ativo.local': id('jundiai') },
  });
});

afterAll(async () => {
  await api?.fechar();
});

describe('as etiquetas dos ativos', () => {
  it('devolve os ativos na ordem pedida, sem repetir, com o nome e o patrimônio', async () => {
    const r = await etiquetas([id('semPatrimonio'), id('pat412'), id('semPatrimonio')]);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      itens: [
        { id: id('semPatrimonio'), rotulo: 'Switch do rack 2', patrimonio: null },
        { id: id('pat412'), rotulo: 'HP LaserJet M404', patrimonio: 'PAT-00412' },
      ],
      fora: 0,
    });
  });

  it('deixa de fora o ativo que a conta não vê e o que não existe, e conta quantos', async () => {
    const r = await etiquetas(
      [id('pat412'), id('pat500'), '0199a3f0-0000-7000-8000-0000000000ff', 'nao-e-um-id'],
      'bruno',
    );
    expect(r.json()).toEqual({
      itens: [{ id: id('pat412'), rotulo: 'HP LaserJet M404', patrimonio: 'PAT-00412' }],
      fora: 3,
    });
  });

  it('recusa mais de 200 ativos e a conta que não vê ativos', async () => {
    const muitos = Array.from(
      { length: 201 },
      (_, i) => `0199a3f0-0000-7000-8000-${String(i).padStart(12, '0')}`,
    );
    const demais = await etiquetas(muitos);
    expect(demais.statusCode).toBe(400);
    expect(demais.json().campos).toEqual({ ids: 'Escolha até 200 ativos por vez.' });
    expect((await etiquetas([id('pat412')], 'carla')).statusCode).toBe(403);
  });
});
