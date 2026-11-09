// A foto da pessoa (specs administracao-de-pessoas e arquivos-e-imagens; design do F2c, decisões 6
// a 8): a troca e a remoção por quem edita pessoas, no escopo da pessoa, e a entrega de cada tamanho
// a quem vê a pessoa. A foto trocada ou removida deixa de ser entregue na hora, e a transação que
// falha apaga o que já foi para o armazenamento.
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { arquivos, eventos, naOrganizacao, pessoas } from '@grafite/db';
import { asc, eq } from 'drizzle-orm';
import sharp from 'sharp';
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
  criarPessoa,
  type Entrada,
} from '../../test/integracao.ts';

const host = 'grafite.fotos.local';
const hostDaOutra = 'grafite.fotos-outra.local';

let api: ApiDeTeste;
let org = '';
let outra = '';
let cliente: ReturnType<typeof clienteDaApi>;
let clienteDaOutra: ReturnType<typeof clienteDaApi>;
/** Edita pessoas na organização inteira. */
let ana: Entrada;
let anaId = '';
/** Edita e vê pessoas só em Jundiaí. */
let bruno: Entrada;
/** Só vê pessoas. */
let carla: Entrada;
/** Vê pessoas na outra organização. */
let zeca: Entrada;
const ids: Record<string, string> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  outra = await criarOrganizacao(api, { nome: 'Outra', enderecos: [hostDaOutra] });
  cliente = clienteDaApi(api, host);
  clienteDaOutra = clienteDaApi(api, hostDaOutra);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const editar = await criarPerfil(api, org, {
    nome: 'Pessoas',
    permissoes: ['pessoas.ver', 'pessoas.editar'],
  });
  const ver = await criarPerfil(api, org, { nome: 'Leitura', permissoes: ['pessoas.ver'] });
  anaId = (await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' })).id;
  await atribuir(api, org, { perfilId: editar, contaId: anaId });
  const brunoId = (await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' })).id;
  await atribuir(api, org, { perfilId: editar, contaId: brunoId, localId: ids.jundiai });
  const carlaId = (await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' })).id;
  await atribuir(api, org, { perfilId: ver, contaId: carlaId });
  const verNaOutra = await criarPerfil(api, outra, {
    nome: 'Leitura',
    permissoes: ['pessoas.ver'],
  });
  const zecaId = (await criarConta(api, outra, { usuario: 'zeca', nome: 'Zeca Lima' })).id;
  await atribuir(api, outra, { perfilId: verNaOutra, contaId: zecaId });
  ana = await cliente.entrar('ana');
  bruno = await cliente.entrar('bruno');
  carla = await cliente.entrar('carla');
  zeca = await clienteDaOutra.entrar('zeca');
});

afterAll(async () => {
  await api?.fechar();
});

let joao = '';
let maria = '';

beforeEach(async () => {
  joao = await criarPessoa(api, org, { nome: 'João da Silva', localId: ids.jundiai });
  maria = await criarPessoa(api, org, { nome: 'Maria Rocha', localId: ids.campinas });
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const png = () => imagemDeTeste(300, 200).png().toBuffer();

const enviarFoto = (entrada: Entrada, pessoa: string, conteudo: Buffer, tipo?: string) =>
  cliente.enviarBytes('PUT', `/pessoas/${pessoa}/foto`, entrada, conteudo, tipo);

const enderecoDaFoto = (pessoa: string, arquivo: string, tamanho: string) =>
  `/pessoas/${pessoa}/foto/${arquivo}/${tamanho}`;

/** Os arquivos no armazenamento de uma organização, pelo caminho a partir da pasta dela. */
async function gravados(orgId: string): Promise<string[]> {
  const pasta = join(api.armazenamento.pasta, orgId);
  const entradas = await readdir(pasta, { recursive: true, withFileTypes: true }).catch(() => []);
  return entradas
    .filter((entrada) => entrada.isFile())
    .map((entrada) => relative(pasta, join(entrada.parentPath, entrada.name)))
    .sort();
}

const registro = (id: string) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx.select().from(arquivos).where(eq(arquivos.id, id));
    return linha;
  });

const fotoDe = (pessoa: string) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .select({ fotoId: pessoas.fotoId })
      .from(pessoas)
      .where(eq(pessoas.id, pessoa));
    return linha?.fotoId ?? null;
  });

const IMAGEM_NAO_ENCONTRADA = {
  status: 404,
  detail: 'Imagem não encontrada.',
};

describe('PUT /pessoas/:id/foto', () => {
  it('troca a foto: a ficha e a lista passam a trazê-la, e o arquivo fica registrado e gravado', async () => {
    // Um PNG enviado como JPG: vale o conteúdo, e não o tipo informado.
    const r = await enviarFoto(ana, joao, await png(), 'image/jpeg');
    expect(r.statusCode).toBe(200);
    const foto = r.json().foto;
    expect(foto).toEqual({ id: expect.any(String) });
    expect(await registro(foto.id)).toMatchObject({
      orgId: org,
      tipo: 'image/webp',
      largura: 300,
      altura: 200,
      variantes: ['completa', '512', '256', '128', '64'],
      enviadoPor: anaId,
      enviadoEm: api.relogio.agora(),
      removidoEm: null,
      apagadoEm: null,
    });
    expect(await gravados(org)).toEqual(
      ['128', '256', '512', '64', 'completa'].map((variante) => join(foto.id, variante)),
    );
    const lista = await cliente.consultar('/pessoas?busca=joao', ana);
    expect(lista.json().itens).toMatchObject([{ id: joao, foto: { id: foto.id } }]);
    expect((await cliente.consultar(`/pessoas/${joao}`, ana)).json().foto).toEqual(foto);
  });

  it('a troca marca a foto anterior como removida, e o endereço dela passa a responder 404', async () => {
    const primeira = (await enviarFoto(ana, joao, await png())).json().foto.id;
    const segunda = (await enviarFoto(ana, joao, await png())).json().foto.id;
    expect(segunda).not.toBe(primeira);
    expect(await registro(primeira)).toMatchObject({ removidoEm: api.relogio.agora() });
    expect(await registro(segunda)).toMatchObject({ removidoEm: null });
    const antiga = await cliente.consultar(enderecoDaFoto(joao, primeira, '64'), ana);
    expect(antiga.statusCode).toBe(404);
    expect(antiga.json()).toMatchObject(IMAGEM_NAO_ENCONTRADA);
    expect((await cliente.consultar(enderecoDaFoto(joao, segunda, '64'), ana)).statusCode).toBe(
      200,
    );
  });

  it('sem pessoas.editar, recusa com 403 e não grava nada', async () => {
    const antes = await gravados(org);
    const r = await enviarFoto(carla, joao, await png());
    expect(r.statusCode).toBe(403);
    expect(await fotoDe(joao)).toBeNull();
    expect(await gravados(org)).toEqual(antes);
  });

  it('fora do escopo, recusa com 403, e a foto não muda', async () => {
    const antes = await gravados(org);
    const r = await enviarFoto(bruno, maria, await png());
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ permissao: 'pessoas.editar' });
    expect(await fotoDe(maria)).toBeNull();
    expect(await gravados(org)).toEqual(antes);
    expect((await enviarFoto(bruno, joao, await png())).statusCode).toBe(200);
  });

  it('a pessoa anonimizada não troca de foto', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(pessoas)
        .set({
          situacao: 'anonimizada',
          nome: 'Pessoa anonimizada 7F3K',
          localId: null,
          anonimizadaEm: api.relogio.agora(),
        })
        .where(eq(pessoas.id, maria)),
    );
    const antes = await gravados(org);
    const r = await enviarFoto(ana, maria, await png());
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ detail: 'Esta pessoa foi anonimizada e não muda mais.' });
    expect(await gravados(org)).toEqual(antes);
  });

  it('registra foto.trocada sem a imagem, e o evento da pessoa leva o local dela', async () => {
    const r = await enviarFoto(ana, joao, await png());
    const foto = r.json().foto.id;
    const [auditado] = await auditoriaDaRequisicao(api, org, r);
    expect(auditado).toMatchObject({
      acao: 'foto.trocada',
      atorContaId: anaId,
      alvoTipo: 'pessoa',
      alvoId: joao,
      dados: { arquivoId: foto, arquivoAnteriorId: null },
    });
    const gravadosNoEvento = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(eventos).orderBy(asc(eventos.id)),
    );
    expect(gravadosNoEvento).toMatchObject([
      {
        tipo: 'pessoas.mudaram',
        alvoTipo: 'pessoa',
        alvoId: joao,
        permissao: 'pessoas.ver',
        locais: [ids.jundiai],
      },
    ]);
  });

  it('a transação que falha apaga do armazenamento o que já foi gravado', async () => {
    const anterior = (await enviarFoto(ana, joao, await png())).json().foto.id;
    const antes = await gravados(org);
    await api.dono.query(
      "create function public.falhar_no_teste() returns trigger language plpgsql as $$ begin raise exception 'falha do teste'; end $$",
    );
    await api.dono.query(
      'create trigger falhar_no_teste before insert on public.arquivos for each row execute function public.falhar_no_teste()',
    );
    try {
      const r = await enviarFoto(ana, joao, await png());
      expect(r.statusCode).toBe(500);
    } finally {
      await api.dono.query('drop trigger falhar_no_teste on public.arquivos');
      await api.dono.query('drop function public.falhar_no_teste()');
    }
    expect(await gravados(org)).toEqual(antes);
    expect(await fotoDe(joao)).toBe(anterior);
  });

  it('recusa o GIF com 415 e o envio de mais de 10 MB com 413, sem gravar nada', async () => {
    const antes = await gravados(org);
    const gif = await enviarFoto(ana, joao, await imagemDeTeste(20, 20).gif().toBuffer());
    expect(gif.statusCode).toBe(415);
    expect(gif.json()).toMatchObject({
      detail: 'Formato não aceito. Envie uma imagem PNG, JPG, WebP, AVIF ou SVG.',
    });
    const grande = await enviarFoto(ana, joao, Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png');
    expect(grande.statusCode).toBe(413);
    expect(grande.json()).toMatchObject({ detail: 'A imagem passa de 10 MB.' });
    const html = await enviarFoto(ana, joao, Buffer.from('<p>oi</p>'), 'text/html');
    expect(html.statusCode).toBe(415);
    expect(await gravados(org)).toEqual(antes);
    expect(await fotoDe(joao)).toBeNull();
  });
});

describe('DELETE /pessoas/:id/foto', () => {
  it('remove a foto: a ficha volta sem ela, o endereço responde 404, e a auditoria registra', async () => {
    const foto = (await enviarFoto(ana, joao, await png())).json().foto.id;
    const r = await cliente.enviar('DELETE', `/pessoas/${joao}/foto`, ana);
    expect(r.statusCode).toBe(200);
    expect(r.json().foto).toBeNull();
    expect(await registro(foto)).toMatchObject({ removidoEm: api.relogio.agora() });
    expect((await cliente.consultar(enderecoDaFoto(joao, foto, '64'), ana)).statusCode).toBe(404);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'foto.removida', alvoId: joao, dados: { arquivoId: foto } },
    ]);
  });

  it('sem foto, não muda nada nem audita', async () => {
    const r = await cliente.enviar('DELETE', `/pessoas/${joao}/foto`, ana);
    expect(r.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
  });

  it('fora do escopo, recusa com 403', async () => {
    const foto = (await enviarFoto(ana, maria, await png())).json().foto.id;
    const r = await cliente.enviar('DELETE', `/pessoas/${maria}/foto`, bruno);
    expect(r.statusCode).toBe(403);
    expect(await fotoDe(maria)).toBe(foto);
  });
});

describe('GET /pessoas/:id/foto/:arquivo/:tamanho', () => {
  it('entrega cada tamanho, com o tipo, a exibição na página e o cache longo', async () => {
    const foto = (
      await enviarFoto(ana, joao, await imagemDeTeste(1000, 500).png().toBuffer())
    ).json().foto.id;
    for (const [tamanho, largura] of [
      ['completa', 1000],
      ['512', 512],
      ['256', 256],
      ['128', 128],
      ['64', 64],
    ] as const) {
      const r = await cliente.consultar(enderecoDaFoto(joao, foto, tamanho), carla);
      expect(r.statusCode).toBe(200);
      expect(r.headers).toMatchObject({
        'content-type': 'image/webp',
        'x-content-type-options': 'nosniff',
        'content-disposition': 'inline',
        'cache-control': 'private, max-age=31536000, immutable',
      });
      expect(r.headers['content-security-policy']).toBeUndefined();
      expect((await sharp(r.rawPayload).metadata()).width).toBe(largura);
    }
  });

  // O primeiro SVG do arquivo carrega o jsdom e o DOMPurify, e a miniatura sai do SVG: com o
  // executor do CI carregado, passou dos 30 s (change integracao-sob-carga).
  it('entrega o SVG sanitizado com a política que bloqueia scripts e conteúdo externo', {
    timeout: 120_000,
  }, async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script><rect width="100" height="100" fill="#f00"/></svg>',
    );
    const foto = (await enviarFoto(ana, joao, svg, 'image/svg+xml')).json().foto.id;
    const r = await cliente.consultar(enderecoDaFoto(joao, foto, 'completa'), carla);
    expect(r.headers).toMatchObject({
      'content-type': 'image/svg+xml',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    expect(r.body).toContain('<rect width="100" height="100" fill="#f00"/>');
    expect(r.body).not.toContain('script');
    const miniatura = await cliente.consultar(enderecoDaFoto(joao, foto, '64'), carla);
    expect(miniatura.headers['content-type']).toBe('image/webp');
  });

  it('fora do escopo de quem vê pessoas, responde 403 e não entrega a foto', async () => {
    const foto = (await enviarFoto(ana, maria, await png())).json().foto.id;
    const r = await cliente.consultar(enderecoDaFoto(maria, foto, '64'), bruno);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ permissao: 'pessoas.ver' });
  });

  it('pelo endereço de outra organização, responde 404', async () => {
    const foto = (await enviarFoto(ana, joao, await png())).json().foto.id;
    const r = await clienteDaOutra.consultar(enderecoDaFoto(joao, foto, '64'), zeca);
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject(IMAGEM_NAO_ENCONTRADA);
  });

  it('a foto de outra pessoa pelo endereço desta responde 404', async () => {
    const daMaria = (await enviarFoto(ana, maria, await png())).json().foto.id;
    await enviarFoto(ana, joao, await png());
    const r = await cliente.consultar(enderecoDaFoto(joao, daMaria, '64'), ana);
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject(IMAGEM_NAO_ENCONTRADA);
  });
});
