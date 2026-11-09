// Os arquivos e as imagens dos campos do ativo pela API (spec cadastro-de-ativos, "Arquivos e imagens
// nos campos do ativo", e arquivos-e-imagens; design do P1d, decisão 5): o envio, a troca e a
// remoção na hora, como uma edição manual do campo, com a auditoria pelos nomes e o evento; a entrega
// do documento para baixar, com o nome original, e da imagem como as outras; os restritos; e o
// arquivo removido, que deixa de ser entregue e sai do armazenamento na manutenção diária.
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { arquivos, eventos, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { chaveDoArquivo } from '../arquivos/armazenamento.ts';
import { LIMITE_DO_DOCUMENTO } from '../arquivos/documentos.ts';
import { tarefasDaManutencao } from '../fila/manutencao.ts';

const host = 'grafite.ativos-arquivos.local';

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
    permissoes: ['ativos.editar', 'ativos.restritos', 'catalogo.administrar'],
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

  const campo = async (pedido: object) =>
    (await cliente.enviar('POST', '/campos', como('ana'), pedido)).json().id as string;
  ids.laudo = await campo({ rotulo: 'Laudo técnico', tipo: 'arquivo' });
  ids.etiqueta = await campo({ rotulo: 'Foto da etiqueta', tipo: 'imagem' });
  ids.contrato = await campo({ rotulo: 'Contrato assinado', tipo: 'arquivo', restrito: true });
  ids.observacao = await campo({ rotulo: 'Observação', tipo: 'texto' });
  ids.semUso = await campo({ rotulo: 'Manual do fabricante', tipo: 'arquivo' });
  const tipo = await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), {
    nome: 'Notebook',
    icone: 'notebook',
    campos: [ids.laudo, ids.etiqueta, ids.contrato, ids.observacao].map((campoId) => ({
      campoId,
      obrigatorio: false,
    })),
  });
  const ativo = async (localId: string) =>
    (
      await cliente.enviar('POST', '/ativos', como('ana'), {
        tipoId: tipo.json().id,
        valores: { 'ativo.local': localId },
      })
    ).json().id as string;
  ids.emJundiai = await ativo(id('jundiai'));
  ids.emCampinas = await ativo(id('campinas'));
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const PDF = (texto: string) => Buffer.from(`%PDF-1.7\n% ${texto}\n%%EOF\n`);

const caminho = (ativoId: string, campoId: string) =>
  `/ativos/${ativoId}/campos/${campoId}/arquivo`;
const enviar = (
  ativoId: string,
  campoId: string,
  conteudo: Buffer,
  nome: string,
  usuario = 'bruno',
) =>
  cliente.enviarBytes(
    'PUT',
    `${caminho(ativoId, campoId)}?nome=${encodeURIComponent(nome)}`,
    como(usuario),
    conteudo,
  );
const remover = (ativoId: string, campoId: string, usuario = 'bruno') =>
  cliente.enviar('DELETE', caminho(ativoId, campoId), como(usuario));
const baixar = (
  ativoId: string,
  campoId: string,
  arquivo: string,
  variante = 'completa',
  usuario = 'carla',
) => cliente.consultar(`${caminho(ativoId, campoId)}/${arquivo}/${variante}`, como(usuario));
const ficha = async (ativoId: string, usuario = 'ana') =>
  (await cliente.consultar(`/ativos/${ativoId}`, como(usuario))).json();

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select({ tipo: eventos.tipo, alvoId: eventos.alvoId, locais: eventos.locais }).from(eventos),
  );

/** Os arquivos no armazenamento da organização. */
async function gravados(): Promise<string[]> {
  const pasta = join(api.armazenamento.pasta, org);
  const lidos = await readdir(pasta, { recursive: true, withFileTypes: true }).catch(() => []);
  return lidos
    .filter((entrada) => entrada.isFile())
    .map((entrada) => relative(pasta, join(entrada.parentPath, entrada.name)))
    .sort();
}

const NAO_ACEITO =
  'Formato não aceito. Envie PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP.';

describe('arquivo de um campo', () => {
  it('envia o PDF como uma edição manual do campo, com a auditoria pelo nome e o evento', async () => {
    // A trava não impede: a gravação pela ficha é manual.
    await cliente.enviar('PATCH', `/ativos/${id('emJundiai')}`, como('ana'), {
      travas: { [id('laudo')]: true },
    });
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    const conteudo = PDF('nota 1234');
    const r = await enviar(id('emJundiai'), id('laudo'), conteudo, 'nota-fiscal-1234.pdf');
    expect(r.statusCode).toBe(200);
    const arquivo = r.json().valores[id('laudo')];
    ids.primeiro = arquivo;
    expect(r.json().referencias.arquivos[arquivo]).toEqual({
      nome: 'nota-fiscal-1234.pdf',
      bytes: conteudo.length,
      tipo: 'application/pdf',
    });
    expect(r.json().estado[id('laudo')]).toMatchObject({
      origem: 'manual',
      autor: { nome: 'Bruno Costa' },
      trava: true,
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'ativo.alterado',
        alvoId: ids.emJundiai,
        depois: { campos: { 'Laudo técnico': 'nota-fiscal-1234.pdf' } },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'ativos.mudaram', alvoId: ids.emJundiai, locais: [id('jundiai')] },
    ]);

    // A lista traz o arquivo da coluna pedida, com o nome.
    const lista = (await cliente.consultar(`/ativos?colunas=${id('laudo')}`, como('carla'))).json();
    expect(lista.referencias.arquivos[arquivo]).toMatchObject({ nome: 'nota-fiscal-1234.pdf' });
  });

  it('entrega o documento para baixar, com o nome original e o nosniff, só inteiro', async () => {
    const r = await baixar(id('emJundiai'), id('laudo'), id('primeiro'));
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-disposition']).toBe(
      `attachment; filename="nota-fiscal-1234.pdf"; filename*=UTF-8''nota-fiscal-1234.pdf`,
    );
    expect(r.rawPayload.toString()).toContain('nota 1234');
    const miniatura = await baixar(id('emJundiai'), id('laudo'), id('primeiro'), '128');
    expect(miniatura.statusCode).toBe(404);
    expect(miniatura.json().detail).toBe('Arquivo não encontrado.');
  });

  it('o nome com acentos vai inteiro no filename* e sem os acentos no filename', async () => {
    const r = await enviar(id('emJundiai'), id('laudo'), PDF('laudo'), 'Relatório técnico.pdf');
    const arquivo = r.json().valores[id('laudo')];
    ids.segundo = arquivo;
    const baixado = await baixar(id('emJundiai'), id('laudo'), arquivo);
    expect(baixado.headers['content-disposition']).toBe(
      `attachment; filename="Relatorio tecnico.pdf"; filename*=UTF-8''Relat%C3%B3rio%20t%C3%A9cnico.pdf`,
    );
  });

  it('a troca deixa o anterior sem entrega, com os dois nomes na auditoria', async () => {
    const r = await enviar(id('emJundiai'), id('laudo'), PDF('nova'), 'nota-fiscal-5678.pdf');
    expect(r.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'ativo.alterado',
        antes: { campos: { 'Laudo técnico': 'Relatório técnico.pdf' } },
        depois: { campos: { 'Laudo técnico': 'nota-fiscal-5678.pdf' } },
      },
    ]);
    const anterior = await baixar(id('emJundiai'), id('laudo'), id('segundo'));
    expect(anterior.statusCode).toBe(404);
    expect(anterior.json().detail).toBe('Arquivo não encontrado.');
    ids.terceiro = r.json().valores[id('laudo')];
  });

  it('a manutenção diária apaga do armazenamento o documento removido', async () => {
    const chave = chaveDoArquivo(org, id('segundo'), 'completa');
    expect(await api.armazenamento.abrir(chave)).not.toBeNull();
    const silencioso = { info: () => {}, warn: () => {}, error: () => {} };
    const manutencao = tarefasDaManutencao({
      banco: api.banco,
      armazenamento: api.armazenamento,
      agora: api.relogio.agora,
      log: silencioso,
      enviar: vi.fn(async () => null),
    }).find((tarefa) => tarefa.nome === 'manutencao');
    await manutencao?.trabalho(
      { orgId: org },
      { tarefaId: 't', tentativa: 0, sinal: new AbortController().signal },
    );
    expect(await api.armazenamento.abrir(chave)).toBeNull();
    const [registro] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select()
        .from(arquivos)
        .where(eq(arquivos.id, id('segundo'))),
    );
    expect(registro?.apagadoEm).not.toBeNull();
    expect(
      await api.armazenamento.abrir(chaveDoArquivo(org, id('terceiro'), 'completa')),
    ).not.toBeNull();
  });

  it('remove o arquivo como uma edição manual, e o endereço passa a responder 404', async () => {
    const r = await remover(id('emJundiai'), id('laudo'));
    expect(r.statusCode).toBe(200);
    expect(r.json().valores[id('laudo')]).toBeUndefined();
    expect(r.json().estado[id('laudo')]).toMatchObject({ origem: 'manual', trava: true });
    const [registro] = await auditoriaDaRequisicao(api, org, r);
    expect(registro).toMatchObject({
      acao: 'ativo.alterado',
      antes: { campos: { 'Laudo técnico': 'nota-fiscal-5678.pdf' } },
    });
    expect(registro?.depois).not.toHaveProperty(['campos', 'Laudo técnico']);
    expect((await baixar(id('emJundiai'), id('laudo'), id('terceiro'))).statusCode).toBe(404);

    // Sem arquivo, remover de novo não grava nada.
    const repetida = await remover(id('emJundiai'), id('laudo'));
    expect(repetida.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, repetida)).toEqual([]);
  });

  it('recusa o formato não aceito, o vazio e o que passa de 25 MB, sem gravar nada', async () => {
    const antes = await gravados();
    const programa = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62), Buffer.from('PE\0\0')]);
    const recusado = await enviar(id('emJundiai'), id('laudo'), programa, 'nota.pdf');
    expect(recusado.statusCode).toBe(415);
    expect(recusado.json().detail).toBe(NAO_ACEITO);
    const vazio = await enviar(id('emJundiai'), id('laudo'), Buffer.alloc(0), 'vazio.pdf');
    expect(vazio.statusCode).toBe(400);
    expect(vazio.json().detail).toBe('O arquivo está vazio.');
    const grande = await enviar(
      id('emJundiai'),
      id('laudo'),
      Buffer.alloc(LIMITE_DO_DOCUMENTO + 1, 0x61),
      'grande.txt',
    );
    expect(grande.statusCode).toBe(413);
    expect(grande.json().detail).toBe('O arquivo passa de 25 MB.');
    expect(await gravados()).toEqual(antes);
  });

  it('o texto com nome de script é guardado como texto', async () => {
    const r = await enviar(
      id('emJundiai'),
      id('laudo'),
      Buffer.from('Remove-Item .\\temp\n'),
      'limpeza.ps1',
    );
    expect(r.statusCode).toBe(200);
    expect(r.json().referencias.arquivos[r.json().valores[id('laudo')]]).toMatchObject({
      nome: 'limpeza.ps1.txt',
      tipo: 'text/plain',
    });
  });
});

describe('imagem de um campo', () => {
  it('é tratada como as imagens, com as miniaturas, e entregue na página', async () => {
    const png = await imagemDeTeste(300, 200).png().toBuffer();
    const r = await enviar(id('emJundiai'), id('etiqueta'), png, 'etiqueta.png');
    expect(r.statusCode).toBe(200);
    const imagem = r.json().valores[id('etiqueta')];
    expect(r.json().referencias.arquivos[imagem]).toMatchObject({
      nome: 'etiqueta.png',
      tipo: 'image/webp',
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { depois: { campos: { 'Foto da etiqueta': 'etiqueta.png' } } },
    ]);
    const miniatura = await baixar(id('emJundiai'), id('etiqueta'), imagem, '128');
    expect(miniatura.statusCode).toBe(200);
    expect(miniatura.headers['content-type']).toBe('image/webp');
    expect(miniatura.headers['content-disposition']).toBe('inline');

    const outra = await enviar(id('emJundiai'), id('etiqueta'), png, 'etiqueta-nova.png');
    const anterior = await baixar(id('emJundiai'), id('etiqueta'), imagem, '128');
    expect(anterior.statusCode).toBe(404);
    expect(anterior.json().detail).toBe('Imagem não encontrada.');
    expect(outra.json().valores[id('etiqueta')]).not.toBe(imagem);
  });

  it('recusa o que não é imagem, com a mensagem das imagens', async () => {
    const r = await enviar(id('emJundiai'), id('etiqueta'), PDF('x'), 'etiqueta.pdf');
    expect(r.statusCode).toBe(415);
    expect(r.json().detail).toBe(
      'Formato não aceito. Envie uma imagem PNG, JPG, WebP, AVIF ou SVG.',
    );
  });
});

describe('acesso aos arquivos dos campos', () => {
  it('o campo restrito pede ativos.restritos para enviar e para baixar', async () => {
    const semRestritos = await enviar(id('emJundiai'), id('contrato'), PDF('c'), 'contrato.pdf');
    expect(semRestritos.statusCode).toBe(403);
    const r = await enviar(id('emJundiai'), id('contrato'), PDF('c'), 'contrato.pdf', 'ana');
    expect(r.statusCode).toBe(200);
    const contrato = r.json().valores[id('contrato')];
    const negado = await baixar(id('emJundiai'), id('contrato'), contrato);
    expect(negado.statusCode).toBe(403);
    expect(
      (await baixar(id('emJundiai'), id('contrato'), contrato, 'completa', 'ana')).statusCode,
    ).toBe(200);
    const daCarla = await ficha(id('emJundiai'), 'carla');
    expect(daCarla.valores).not.toHaveProperty(id('contrato'));
    expect(daCarla.referencias.arquivos).not.toHaveProperty(contrato);
    expect((await remover(id('emJundiai'), id('contrato'))).statusCode).toBe(403);
  });

  it('mudar pede ativos.editar no local do ativo, e baixar pede ativos.ver nele', async () => {
    expect((await enviar(id('emCampinas'), id('laudo'), PDF('x'), 'a.pdf')).statusCode).toBe(403);
    expect(
      (await enviar(id('emJundiai'), id('laudo'), PDF('x'), 'a.pdf', 'carla')).statusCode,
    ).toBe(403);
    const deCampinas = (
      await enviar(id('emCampinas'), id('laudo'), PDF('x'), 'campinas.pdf', 'ana')
    ).json().valores[id('laudo')];
    const fora = await baixar(id('emCampinas'), id('laudo'), deCampinas);
    expect(fora.statusCode).toBe(403);
    expect(await auditoriaDaRequisicao(api, org, fora)).toMatchObject([
      { acao: 'permissao.recusada' },
    ]);
  });

  it('o campo que não é de arquivo, ou não é do tipo do ativo, não recebe arquivo', async () => {
    for (const campoId of [id('observacao'), id('semUso')]) {
      const r = await enviar(id('emJundiai'), campoId, PDF('x'), 'a.pdf', 'ana');
      expect(r.statusCode).toBe(404);
      expect(r.json().detail).toBe('Campo não encontrado.');
    }
    const inexistente = await enviar(
      '0199a6e0-0000-7000-8000-000000000999',
      id('laudo'),
      PDF('x'),
      'a.pdf',
      'ana',
    );
    expect(inexistente.json().detail).toBe('Ativo não encontrado.');
  });

  it('a gravação comum não aceita o valor do campo de arquivo', async () => {
    const r = await cliente.enviar('PATCH', `/ativos/${id('emJundiai')}`, como('ana'), {
      valores: { [id('laudo')]: id('primeiro') },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      [`valores.${id('laudo')}`]: 'Envie o arquivo pela ficha do ativo.',
    });
  });
});
