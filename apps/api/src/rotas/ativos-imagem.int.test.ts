// A imagem do ativo pela API (spec cadastro-de-ativos, "Imagem do ativo"; design do P1d, decisão 4):
// a troca e a remoção para quem tem `ativos.editar` no local do ativo, pelo caminho comum das
// imagens, com a auditoria e o evento; a entrega para quem tem `ativos.ver` nele; e a imagem na
// lista e na ficha, à parte da imagem do modelo.
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { imagemDeTeste } from '../../test/imagens.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.ativos-imagem.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};
const id = (chave: string) => ids[chave] ?? '';
const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['ativos.editar', 'catalogo.administrar', 'modelos.editar'],
  });
  const editar = await criarPerfil(api, org, { nome: 'Editar', permissoes: ['ativos.editar'] });
  const ver = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['ativos.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: editar, contaId: bruno.id, localId: id('jundiai') });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: ver, contaId: carla.id, localId: id('jundiai') });
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);
  const tipo = await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), {
    nome: 'Impressora',
    icone: 'impressora',
  });
  const modelo = await cliente.enviar('POST', '/modelos', como('ana'), {
    tipoId: tipo.json().id,
    fabricante: 'HP',
    nome: 'LaserJet M404',
  });
  ids.m404 = modelo.json().id;
  const ativo = async (localId: string) =>
    (
      await cliente.enviar('POST', '/ativos', como('ana'), {
        tipoId: tipo.json().id,
        modeloId: id('m404'),
        valores: { 'ativo.local': localId },
      })
    ).json().id as string;
  ids.emJundiai = await ativo(id('jundiai'));
  ids.vizinha = await ativo(id('jundiai'));
  ids.emCampinas = await ativo(id('campinas'));
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const png = () => imagemDeTeste(300, 200).png().toBuffer();
const enviarImagem = async (ativoId: string, usuario = 'bruno') =>
  cliente.enviarBytes('PUT', `/ativos/${ativoId}/imagem`, como(usuario), await png());
const removerImagem = (ativoId: string, usuario = 'bruno') =>
  cliente.enviar('DELETE', `/ativos/${ativoId}/imagem`, como(usuario));
const entregue = (ativoId: string, arquivo: string, tamanho: string, usuario = 'carla') =>
  cliente.consultar(`/ativos/${ativoId}/imagem/${arquivo}/${tamanho}`, como(usuario));

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select({ tipo: eventos.tipo, alvoId: eventos.alvoId, locais: eventos.locais }).from(eventos),
  );

describe('imagem do ativo', () => {
  it('troca a imagem, com a auditoria e o evento, e a antiga deixa de ser entregue', async () => {
    const primeira = await enviarImagem(id('emJundiai'));
    expect(primeira.statusCode).toBe(200);
    const imagem = primeira.json().imagem.id;
    expect(await auditoriaDaRequisicao(api, org, primeira)).toMatchObject([
      {
        acao: 'imagem-do-ativo.trocada',
        alvoTipo: 'ativo',
        alvoId: ids.emJundiai,
        dados: { arquivoId: imagem, arquivoAnteriorId: null },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'ativos.mudaram', alvoId: ids.emJundiai, locais: [id('jundiai')] },
    ]);
    const miniatura = await entregue(id('emJundiai'), imagem, '128');
    expect(miniatura.statusCode).toBe(200);
    expect(miniatura.headers['content-type']).toBe('image/webp');

    const segunda = await enviarImagem(id('emJundiai'));
    expect(segunda.json().imagem.id).not.toBe(imagem);
    expect(await auditoriaDaRequisicao(api, org, segunda)).toMatchObject([
      { dados: { arquivoId: segunda.json().imagem.id, arquivoAnteriorId: imagem } },
    ]);
    expect((await entregue(id('emJundiai'), imagem, '128')).statusCode).toBe(404);
  });

  it('a lista e a ficha trazem a imagem do ativo, à parte da do modelo', async () => {
    const imagem = (await enviarImagem(id('emJundiai'))).json().imagem.id;
    const ficha = (await cliente.consultar(`/ativos/${id('emJundiai')}`, como('carla'))).json();
    expect(ficha.imagem).toEqual({ id: imagem });
    expect(ficha.modelo.imagem).toBeNull();
    const itens = (await cliente.consultar('/ativos', como('carla'))).json().itens as {
      id: string;
      imagem: { id: string } | null;
    }[];
    expect(itens.find((item) => item.id === ids.emJundiai)?.imagem).toEqual({ id: imagem });
    expect(itens.find((item) => item.id === ids.vizinha)?.imagem).toBeNull();
  });

  it('remove a imagem, com a auditoria e o evento, e o endereço passa a responder 404', async () => {
    const atual = (await cliente.consultar(`/ativos/${id('emJundiai')}`, como('carla'))).json()
      .imagem.id;
    const r = await removerImagem(id('emJundiai'));
    expect(r.statusCode).toBe(200);
    expect(r.json().imagem).toBeNull();
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'imagem-do-ativo.removida', alvoId: ids.emJundiai, dados: { arquivoId: atual } },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'ativos.mudaram', alvoId: ids.emJundiai, locais: [id('jundiai')] },
    ]);
    expect((await entregue(id('emJundiai'), atual, '64')).statusCode).toBe(404);

    // Sem imagem, remover de novo não grava nada.
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    const repetida = await removerImagem(id('emJundiai'));
    expect(repetida.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, repetida)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('mudar pede ativos.editar no local do ativo, e a recusa vai para a auditoria', async () => {
    const fora = await enviarImagem(id('emCampinas'));
    expect(fora.statusCode).toBe(403);
    expect(await auditoriaDaRequisicao(api, org, fora)).toMatchObject([
      { acao: 'permissao.recusada' },
    ]);
    expect((await enviarImagem(id('emJundiai'), 'carla')).statusCode).toBe(403);
    expect((await removerImagem(id('emJundiai'), 'carla')).statusCode).toBe(403);
    const inexistente = await enviarImagem('0199a6e0-0000-7000-8000-000000000999', 'ana');
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.json().detail).toBe('Ativo não encontrado.');
  });

  it('a entrega pede ativos.ver no local do ativo', async () => {
    const imagem = (await enviarImagem(id('emCampinas'), 'ana')).json().imagem.id;
    expect((await entregue(id('emCampinas'), imagem, '128', 'ana')).statusCode).toBe(200);
    const fora = await entregue(id('emCampinas'), imagem, '128', 'carla');
    expect(fora.statusCode).toBe(403);
    expect(await auditoriaDaRequisicao(api, org, fora)).toMatchObject([
      { acao: 'permissao.recusada' },
    ]);
    expect(
      (await entregue('0199a6e0-0000-7000-8000-000000000999', imagem, '128', 'ana')).statusCode,
    ).toBe(404);
  });
});
