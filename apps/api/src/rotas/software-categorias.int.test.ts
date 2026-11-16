// As categorias da base de software pela API (spec distribuicao-de-software, "Categorias da base";
// change software-por-pacote, design, decisão 3): criar, renomear, ordenar e remover, para quem
// administra o software, com o nome único sem diferenciar acento e a auditoria; a categoria com
// pacotes, que não sai; a lista para quem distribui; e a categoria de outra organização, que não
// existe aqui.
import { auditoria, categoriasDeSoftware, naOrganizacao } from '@grafite/db';
import { asc, like } from 'drizzle-orm';
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
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.categorias.local';
let api: ApiDeTeste;
let org = '';
let daOutra = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const categorias: Record<string, string> = {};

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

const acoes = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ acao: auditoria.acao, antes: auditoria.antes, depois: auditoria.depois })
      .from(auditoria)
      .where(like(auditoria.acao, 'categoria%'))
      .orderBy(asc(auditoria.momento), asc(auditoria.id)),
  );

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const outra = await criarOrganizacao(api, {
    nome: 'Outra',
    enderecos: ['grafite.categorias-outra.local'],
  });
  daOutra = await naOrganizacao(api.banco, outra, async (tx) => {
    const [linha] = await tx
      .insert(categoriasDeSoftware)
      .values({ orgId: outra, nome: 'Navegadores', nomeNormalizado: 'navegadores', ordem: 1 })
      .returning();
    return linha?.id ?? '';
  });
  cliente = clienteDaApi(api, host);
  const administra = await criarPerfil(api, org, {
    nome: 'Software',
    permissoes: ['software.administrar'],
  });
  const distribui = await criarPerfil(api, org, {
    nome: 'Distribui',
    permissoes: ['software.distribuir'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administra, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: distribui, contaId: bruno.id });
  for (const usuario of ['ana', 'bruno']) entradas[usuario] = await cliente.entrar(usuario);
});

afterAll(async () => {
  await api?.fechar();
});

describe('as categorias da base', () => {
  it('cria no fim da ordem, com o nome único sem diferenciar acento', async () => {
    for (const [nome, ordem] of [
      ['Navegadores', 1],
      ['Compactadores', 2],
      ['Mídia', 3],
    ] as const) {
      const r = await cliente.enviar('POST', '/software/categorias', como('ana'), { nome });
      expect(r.statusCode, r.body).toBe(201);
      expect(r.json()).toMatchObject({ nome, ordem, pacotes: 0 });
      categorias[nome] = r.json().id;
    }
    const repetida = await cliente.enviar('POST', '/software/categorias', como('ana'), {
      nome: ' midia ',
    });
    expect(repetida.statusCode).toBe(409);
    expect(repetida.json().campos).toEqual({ nome: 'Já existe uma categoria com este nome.' });
    const vazia = await cliente.enviar('POST', '/software/categorias', como('ana'), { nome: ' ' });
    expect(vazia.statusCode).toBe(400);
    expect(vazia.json().campos).toEqual({ nome: 'Informe o nome da categoria.' });
    const longa = await cliente.enviar('POST', '/software/categorias', como('ana'), {
      nome: 'x'.repeat(41),
    });
    expect(longa.json().campos).toEqual({ nome: 'Use até 40 caracteres.' });
  });

  it('renomeia e reordena, com a auditoria; a ordem precisa de todas, uma vez cada', async () => {
    const renomeada = await cliente.enviar(
      'PATCH',
      `/software/categorias/${categorias.Navegadores}`,
      como('ana'),
      { nome: 'Navegadores web' },
    );
    expect(renomeada.statusCode, renomeada.body).toBe(200);
    expect(renomeada.json()).toMatchObject({ nome: 'Navegadores web', ordem: 1 });
    const comARepetida = await cliente.enviar(
      'PATCH',
      `/software/categorias/${categorias.Navegadores}`,
      como('ana'),
      { nome: 'Compactadores' },
    );
    expect(comARepetida.statusCode).toBe(409);

    const ids = [categorias.Mídia, categorias.Navegadores, categorias.Compactadores];
    const ordenadas = await cliente.enviar('PUT', '/software/categorias/ordem', como('ana'), {
      ids,
    });
    expect(ordenadas.statusCode, ordenadas.body).toBe(200);
    expect(
      ordenadas
        .json()
        .categorias.map(({ nome, ordem }: { nome: string; ordem: number }) => [nome, ordem]),
    ).toEqual([
      ['Mídia', 1],
      ['Navegadores web', 2],
      ['Compactadores', 3],
    ]);
    for (const errada of [ids.slice(1), [...ids, categorias.Mídia], [...ids.slice(1), daOutra]]) {
      const r = await cliente.enviar('PUT', '/software/categorias/ordem', como('ana'), {
        ids: errada,
      });
      expect(r.statusCode).toBe(400);
      expect(r.json().campos).toEqual({
        ids: 'A ordem precisa ter todas as categorias, uma vez cada.',
      });
    }

    const lista = await cliente.consultar('/software/categorias', como('bruno'));
    expect(lista.statusCode, lista.body).toBe(200);
    expect(lista.json().categorias.map(({ nome }: { nome: string }) => nome)).toEqual([
      'Mídia',
      'Navegadores web',
      'Compactadores',
    ]);
    expect((await acoes()).map(({ acao }) => acao)).toEqual([
      'categoria-de-software.criada',
      'categoria-de-software.criada',
      'categoria-de-software.criada',
      'categoria-de-software.renomeada',
      'categorias-de-software.ordenadas',
    ]);
    expect((await acoes()).at(-1)).toMatchObject({
      antes: { ordem: ['Navegadores web', 'Compactadores', 'Mídia'] },
      depois: { ordem: ['Mídia', 'Navegadores web', 'Compactadores'] },
    });
  });

  it('Categoria com pacotes: a remoção é recusada; a sem pacotes sai', async () => {
    const pacote = await cliente.enviar('POST', '/software/pacotes', como('ana'), {
      nome: 'Google Chrome',
      comando: 'msiexec /i chrome.msi /qn',
      categoriaId: categorias.Navegadores,
    });
    expect(pacote.statusCode, pacote.body).toBe(201);
    const recusada = await cliente.enviar(
      'DELETE',
      `/software/categorias/${categorias.Navegadores}`,
      como('ana'),
    );
    expect(recusada.statusCode).toBe(409);
    expect(recusada.json().detail).toBe('Tire os pacotes desta categoria antes de removê-la.');
    const lista = await cliente.consultar('/software/categorias', como('ana'));
    expect(lista.json().categorias).toContainEqual(
      expect.objectContaining({ nome: 'Navegadores web', pacotes: 1 }),
    );

    const removida = await cliente.enviar(
      'DELETE',
      `/software/categorias/${categorias.Compactadores}`,
      como('ana'),
    );
    expect(removida.statusCode, removida.body).toBe(204);
    const depois = await cliente.consultar('/software/categorias', como('ana'));
    expect(depois.json().categorias.map(({ nome }: { nome: string }) => nome)).toEqual([
      'Mídia',
      'Navegadores web',
    ]);
    expect((await acoes()).at(-1)).toMatchObject({
      acao: 'categoria-de-software.removida',
      antes: { nome: 'Compactadores' },
    });
    const nova = await cliente.enviar('POST', '/software/categorias', como('ana'), {
      nome: 'Drivers',
    });
    expect(nova.json().ordem).toBe(3);
  });

  it('quem só distribui vê as categorias, mas não mexe nelas', async () => {
    const id = categorias.Mídia;
    for (const [metodo, url, corpo] of [
      ['POST', '/software/categorias', { nome: 'Outra' }],
      ['PATCH', `/software/categorias/${id}`, { nome: 'Outra' }],
      ['PUT', '/software/categorias/ordem', { ids: [id] }],
      ['DELETE', `/software/categorias/${id}`, undefined],
    ] as const) {
      const r = await cliente.enviar(metodo, url, como('bruno'), corpo);
      expect(r.statusCode, `${metodo} ${url}`).toBe(403);
    }
  });

  it('a categoria de outra organização não existe aqui', async () => {
    const renomeada = await cliente.enviar(
      'PATCH',
      `/software/categorias/${daOutra}`,
      como('ana'),
      { nome: 'Minha' },
    );
    expect(renomeada.statusCode).toBe(404);
    const removida = await cliente.enviar('DELETE', `/software/categorias/${daOutra}`, como('ana'));
    expect(removida.statusCode).toBe(404);
    const pacote = await cliente.enviar('POST', '/software/pacotes', como('ana'), {
      nome: 'Firefox',
      comando: 'setup.exe /S',
      categoriaId: daOutra,
    });
    expect(pacote.statusCode).toBe(400);
    expect(pacote.json().campos).toEqual({ categoriaId: 'Escolha uma das categorias da base.' });
  });
});
