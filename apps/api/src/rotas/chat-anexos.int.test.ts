// Os anexos do chat (spec arquivos-e-imagens, "Anexos do chat" e "Entrega dos arquivos"; change
// chat-com-chamados, design, decisão 1; tarefa 3.4): o envio sem dono, com `chat.usar`; a mensagem
// que os toma; a entrega pela conversa dona, a quem participa agora; e a remoção dos sem dono em
// 24 h. A permissão vem antes: quem saiu da equipe e o anexo de outra conta.
import { anexosDoChat, arquivos, conversas, mensagensDoChat, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { type ApiDeTeste, abrirApi, criarRelogio } from '../../test/integracao.ts';
import { removerAnexosDoChatEsquecidos } from '../chat/anexos.ts';

const HORA = 60 * 60_000;
const NAO_ENCONTRADO = 'O anexo não foi encontrado. Envie o arquivo de novo.';

const PDF = (texto: string) => Buffer.from(`%PDF-1.7\n% ${texto}\n%%EOF\n`);

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;

const enviar = (usuario: UsuarioDoChat, texto: string) =>
  c.cliente.enviarBytes(
    'POST',
    `/chat/anexos?nome=${encodeURIComponent(`${texto}.pdf`)}`,
    c.como(usuario),
    PDF(texto),
  );

/** Envia um PDF e devolve o id do arquivo, que a mensagem toma. */
async function anexo(usuario: UsuarioDoChat, texto = 'folha manchada') {
  const r = await enviar(usuario, texto);
  expect(r.statusCode, r.body).toBe(201);
  return (r.json() as { id: string }).id;
}

const escrever = (usuario: UsuarioDoChat, conversa: string, corpo: object) =>
  c.cliente.enviar('POST', `/chat/conversas/${conversa}/mensagens`, c.como(usuario), corpo);

const baixar = (usuario: UsuarioDoChat, conversa: string, arquivo: string) =>
  c.cliente.consultar(`/chat/conversas/${conversa}/anexos/${arquivo}`, c.como(usuario));

const semDono = (usuario: UsuarioDoChat, arquivo: string) =>
  c.cliente.consultar(`/chat/anexos/${arquivo}`, c.como(usuario));

const mensagensNoBanco = () =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx.select({ id: mensagensDoChat.id }).from(mensagensDoChat),
  );

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T12:00:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-anexos-${enderecos}.local`);
  await c.entrar();
});

describe('a entrega', () => {
  it('quem participa da conversa agora baixa, e quem saiu da equipe e quem não é dela não', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const canal = await c.criarCanal('Geral');
    const foto = await anexo('paulo');
    const r = await escrever('paulo', equipe, { texto: 'Olhem a folha.', anexos: [foto] });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      anexos: [{ id: foto, nome: 'folha manchada.pdf', tipo: 'application/pdf' }],
    });
    expect(
      (await c.cliente.consultar(`/chat/conversas/${equipe}/mensagens`, c.como('fernanda'))).json(),
    ).toMatchObject({
      itens: [{ anexos: [{ id: foto }] }],
    });

    const daFernanda = await baixar('fernanda', equipe, foto);
    expect(daFernanda.statusCode).toBe(200);
    expect(daFernanda.rawPayload.equals(PDF('folha manchada'))).toBe(true);
    expect(daFernanda.headers['content-disposition']).toContain('attachment;');

    // Pelo canal, de que a Fernanda também participa, o anexo da equipe não existe.
    for (const recusada of [
      await baixar('fernanda', canal, foto),
      await baixar('ana', equipe, foto),
    ]) {
      expect(recusada.statusCode).toBe(404);
    }
    await c.sairDoGrupo('tatiana', c.grupos.financeiro);
    expect((await baixar('tatiana', equipe, foto)).statusCode).toBe(404);
    // Usado, o anexo não é mais sem dono, nem para quem o enviou.
    expect((await semDono('paulo', foto)).statusCode).toBe(404);
  });

  it('o anexo de outra conta e o já usado são recusados, e nada é gravado', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const doPaulo = await anexo('paulo');
    expect((await semDono('paulo', doPaulo)).statusCode).toBe(200);
    expect((await semDono('fernanda', doPaulo)).statusCode).toBe(404);

    const deOutra = await escrever('fernanda', equipe, { texto: 'Peguei.', anexos: [doPaulo] });
    expect(deOutra.statusCode).toBe(400);
    expect(deOutra.json()).toMatchObject({ campos: { anexos: NAO_ENCONTRADO } });
    expect(await mensagensNoBanco()).toEqual([]);

    expect(
      (await escrever('paulo', equipe, { texto: 'Olhem.', anexos: [doPaulo] })).statusCode,
    ).toBe(201);
    const deNovo = await c.cliente.enviar(
      'POST',
      `/chat/diretas/${c.conta('fernanda')}/mensagens`,
      c.como('paulo'),
      { texto: 'Viu a folha?', anexos: [doPaulo] },
    );
    expect(deNovo.statusCode).toBe(400);
    expect(deNovo.json()).toMatchObject({ campos: { anexos: NAO_ENCONTRADO } });
    const diretas = await naOrganizacao(api.banco, c.org, (tx) =>
      tx.select().from(conversas).where(eq(conversas.tipo, 'direta')),
    );
    expect(diretas).toEqual([]);
  });

  it('a mensagem só com os anexos vai sem o texto, e a respondida começa pelo nome do primeiro (tarefa 4.18)', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const folha = await anexo('paulo');
    const nota = await anexo('paulo', 'nota fiscal');
    const vazia = await escrever('paulo', equipe, {});
    expect(vazia.statusCode).toBe(400);
    expect(vazia.json()).toMatchObject({ campos: { texto: 'Escreva a mensagem.' } });

    const soComOsAnexos = await escrever('paulo', equipe, { anexos: [folha, nota] });
    expect(soComOsAnexos.statusCode, soComOsAnexos.body).toBe(201);
    const enviada = soComOsAnexos.json() as { id: string; texto: string | null };
    expect(enviada).toMatchObject({
      texto: null,
      anexos: [{ nome: 'folha manchada.pdf' }, { nome: 'nota fiscal.pdf' }],
    });
    const resposta = await escrever('fernanda', equipe, { texto: 'Vi.', respondeA: enviada.id });
    expect(resposta.statusCode, resposta.body).toBe(201);
    expect(resposta.json()).toMatchObject({
      respondida: { id: enviada.id, comeco: 'folha manchada.pdf e mais 1 arquivo' },
    });
  });

  it('até 5 anexos, e o envio pede o chat.usar', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const seis = [];
    for (let i = 1; i <= 6; i += 1) seis.push(await anexo('paulo', `folha ${i}`));
    const r = await escrever('paulo', equipe, { texto: 'As folhas.', anexos: seis });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ campos: { anexos: 'Anexe até 5 arquivos.' } });
    expect((await enviar('rita', 'sem chat')).statusCode).toBe(403);
  });
});

describe('a remoção', () => {
  it('o anexo sem dono há mais de 24 h sai, e o da mensagem fica', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const esquecido = await anexo('paulo', 'esquecido');
    const usado = await anexo('paulo', 'usado');
    await escrever('paulo', equipe, { texto: 'Olhem.', anexos: [usado] });
    api.relogio.avancar(23 * HORA);
    const antes = await naOrganizacao(api.banco, c.org, (tx) =>
      removerAnexosDoChatEsquecidos(tx, api.relogio.agora()),
    );
    expect(antes).toBe(0);
    api.relogio.avancar(2 * HORA);
    const removidos = await naOrganizacao(api.banco, c.org, (tx) =>
      removerAnexosDoChatEsquecidos(tx, api.relogio.agora()),
    );
    expect(removidos).toBe(1);
    const lidos = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select({ id: arquivos.id, removidoEm: arquivos.removidoEm })
        .from(anexosDoChat)
        .innerJoin(arquivos, eq(arquivos.id, anexosDoChat.arquivoId)),
    );
    expect(
      Object.fromEntries(lidos.map(({ id, removidoEm }) => [id, removidoEm !== null])),
    ).toEqual({ [esquecido]: true, [usado]: false });
    // A sessão de 25 h atrás venceu: o Paulo entra de novo.
    await c.entrar('paulo');
    const tarde = await escrever('paulo', equipe, { texto: 'Esqueci.', anexos: [esquecido] });
    expect(tarde.json()).toMatchObject({ campos: { anexos: NAO_ENCONTRADO } });
    expect((await semDono('paulo', esquecido)).statusCode).toBe(404);
  });
});
