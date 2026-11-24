// A abertura com várias mensagens (spec chamados, "Abrir um chamado pelo chat"; change
// andamento-e-varias-mensagens, design, decisões 5 e 6; tarefa 3.4): pela rota da conversa, as
// linhas `origem` na ordem da conversa, cada uma com os anexos dela, a primeira na origem do
// chamado, o evento com o número de mensagens e a auditoria; as recusas, sem nada gravado; e duas
// aberturas com mensagens em comum ao mesmo tempo.
import {
  anexosDosChamados,
  auditoria,
  chamados,
  mensagensDoChat,
  mensagensDosChamados,
  naOrganizacao,
} from '@grafite/db';
import { and, asc, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { type ApiDeTeste, abrirApi, criarRelogio, esperarNaTrava } from '../../test/integracao.ts';
import { travar } from '../travas.ts';

const PDF = (texto: string) => Buffer.from(`%PDF-1.7\n% ${texto}\n%%EOF\n`);
const MINUTO = 60_000;

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;
let equipe = '';

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T13:19:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-varias-mensagens-${enderecos}.local`);
  await c.entrar();
  equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
});

const naOrg = <T>(fn: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, c.org, fn);

const PEDIDO = (usuario: UsuarioDoChat) => ({
  tipo: c.tipos.Outro,
  titulo: 'Impressora manchando',
  pessoa: c.pessoa(usuario),
  ativo: null,
});

const abrir = (usuario: UsuarioDoChat, conversa: string, mensagens: string[]) =>
  c.cliente.enviar('POST', `/chat/conversas/${conversa}/chamado`, c.como(usuario), {
    ...PEDIDO(usuario),
    mensagens,
  });

const aberto = async (usuario: UsuarioDoChat, conversa: string, mensagens: string[]) => {
  const r = await abrir(usuario, conversa, mensagens);
  expect(r.statusCode, r.body).toBe(201);
  return (r.json() as { numero: number }).numero;
};

/** A mensagem pela API, com o PDF anexo, se há, e o relógio um minuto à frente depois dela. */
async function escrever(usuario: UsuarioDoChat, texto: string, anexo?: string) {
  const anexos: string[] = [];
  if (anexo) {
    const enviado = await c.cliente.enviarBytes(
      'POST',
      `/chat/anexos?nome=${encodeURIComponent(anexo)}`,
      c.como(usuario),
      PDF(anexo),
    );
    expect(enviado.statusCode, enviado.body).toBe(201);
    anexos.push((enviado.json() as { id: string }).id);
  }
  const escrita = await c.cliente.enviar(
    'POST',
    `/chat/conversas/${equipe}/mensagens`,
    c.como(usuario),
    { texto, anexos },
  );
  expect(escrita.statusCode, escrita.body).toBe(201);
  const em = api.relogio.agora().toISOString();
  api.relogio.avancar(MINUTO);
  return { id: (escrita.json() as { id: string }).id, texto, em, anexos };
}

const contarChamados = () =>
  naOrg((tx) => tx.select({ id: chamados.id }).from(chamados)).then((linhas) => linhas.length);

describe('a abertura com várias mensagens', () => {
  it('as linhas da origem na ordem da conversa, com os anexos de cada uma, o evento e a auditoria', async () => {
    const das1019 = await escrever('paulo', 'A impressora do Financeiro manchou.');
    const das1020 = await escrever('paulo', 'Olha a folha.', 'folha manchada.pdf');
    const das1021 = await escrever('fernanda', 'Aqui também.', 'outra folha.pdf');

    // Marcadas fora da ordem, e a das 10:19 duas vezes, também em maiúsculas.
    const numero = await aberto('fernanda', equipe, [
      das1021.id,
      das1019.id,
      das1020.id,
      das1019.id.toUpperCase(),
    ]);

    const [chamado] = await naOrg((tx) =>
      tx.select().from(chamados).where(eq(chamados.numero, numero)),
    );
    expect(chamado).toMatchObject({
      origem: 'chat',
      origemConversaId: equipe,
      origemMensagemId: das1019.id,
      abertoPor: c.conta('fernanda'),
    });

    const origens = await naOrg((tx) =>
      tx
        .select()
        .from(mensagensDosChamados)
        .where(
          and(
            eq(mensagensDosChamados.chamadoId, chamado?.id ?? ''),
            eq(mensagensDosChamados.especie, 'origem'),
          ),
        )
        .orderBy(asc(mensagensDosChamados.id)),
    );
    expect(origens.map(({ texto, autorConta, dados }) => ({ texto, autorConta, dados }))).toEqual([
      {
        texto: 'A impressora do Financeiro manchou.',
        autorConta: c.conta('paulo'),
        dados: { conversa: equipe, mensagem: das1019.id, em: das1019.em },
      },
      {
        texto: 'Olha a folha.',
        autorConta: c.conta('paulo'),
        dados: { conversa: equipe, mensagem: das1020.id, em: das1020.em },
      },
      {
        texto: 'Aqui também.',
        autorConta: c.conta('fernanda'),
        dados: { conversa: equipe, mensagem: das1021.id, em: das1021.em },
      },
    ]);

    // Cada anexo fica na linha da mensagem dele.
    const copiados = await naOrg((tx) =>
      tx
        .select({
          arquivoId: anexosDosChamados.arquivoId,
          mensagemId: anexosDosChamados.mensagemId,
        })
        .from(anexosDosChamados)
        .where(eq(anexosDosChamados.chamadoId, chamado?.id ?? '')),
    );
    expect(copiados).toEqual(
      expect.arrayContaining([
        { arquivoId: das1020.anexos[0], mensagemId: origens[1]?.id },
        { arquivoId: das1021.anexos[0], mensagemId: origens[2]?.id },
      ]),
    );
    expect(copiados).toHaveLength(2);

    // O evento na conversa, com o número de mensagens, e a auditoria, com quantas.
    const [evento] = await naOrg((tx) =>
      tx
        .select({ dados: mensagensDoChat.dados, autorConta: mensagensDoChat.autorConta })
        .from(mensagensDoChat)
        .where(
          and(eq(mensagensDoChat.conversaId, equipe), eq(mensagensDoChat.evento, 'virou-chamado')),
        ),
    );
    expect(evento).toEqual({
      dados: { chamadoId: chamado?.id, numero, mensagens: 3 },
      autorConta: c.conta('fernanda'),
    });
    const [registro] = await naOrg((tx) =>
      tx
        .select({ depois: auditoria.depois })
        .from(auditoria)
        .where(and(eq(auditoria.acao, 'chamado.aberto'), eq(auditoria.alvoId, chamado?.id ?? ''))),
    );
    expect(registro?.depois).toMatchObject({ numero, origem: 'chat', mensagens: 3 });
  });

  it('a rota de uma mensagem grava a origem do mesmo jeito, e o evento conta uma', async () => {
    const mensagem = await escrever('paulo', 'A impressora do Financeiro manchou.');
    const r = await c.cliente.enviar(
      'POST',
      `/chat/mensagens/${mensagem.id}/chamado`,
      c.como('fernanda'),
      PEDIDO('fernanda'),
    );
    expect(r.statusCode, r.body).toBe(201);
    const { numero } = r.json() as { numero: number };
    const [evento] = await naOrg((tx) =>
      tx
        .select({ dados: mensagensDoChat.dados })
        .from(mensagensDoChat)
        .where(eq(mensagensDoChat.evento, 'virou-chamado')),
    );
    expect(evento?.dados).toMatchObject({ numero, mensagens: 1 });
  });
});

describe('as leituras (tarefa 3.5)', () => {
  interface Citada {
    autor: string;
    texto: string | null;
    em: string;
    anexos: { id: string }[];
  }
  const citada = ({ autor, texto, em, anexos }: Citada) => ({
    autor,
    texto,
    em,
    anexos: anexos.map(({ id }) => id),
  });

  it('o chamado no chat e a ficha citam todas, na ordem, e a origem de hoje é a primeira', async () => {
    const das1019 = await escrever('paulo', 'A impressora do Financeiro manchou.');
    const das1020 = await escrever('paulo', 'Olha a folha.', 'folha manchada.pdf');
    const das1021 = await escrever('fernanda', 'Aqui também.');
    const numero = await aberto('fernanda', equipe, [das1021.id, das1019.id, das1020.id]);
    const esperadas = [
      { autor: 'Paulo Nunes', texto: das1019.texto, em: das1019.em, anexos: [] },
      { autor: 'Paulo Nunes', texto: das1020.texto, em: das1020.em, anexos: das1020.anexos },
      { autor: 'Fernanda Rocha', texto: das1021.texto, em: das1021.em, anexos: [] },
    ];

    const noChat = await c.cliente.consultar(`/chat/chamados/${numero}`, c.como('fernanda'));
    expect(noChat.statusCode, noChat.body).toBe(200);
    const lido = noChat.json() as { origem: Citada | null; origens: Citada[] };
    expect(lido.origens.map(citada)).toEqual(esperadas);
    expect(lido.origem && citada(lido.origem)).toEqual(esperadas[0]);

    const naFicha = await c.cliente.consultar(`/chamados/${numero}`, c.como('ana'));
    expect(naFicha.statusCode, naFicha.body).toBe(200);
    const { origemNoChat } = naFicha.json() as {
      origemNoChat: Citada & {
        mensagens: Citada[];
        abrir: { conversa: string; mensagem: string } | null;
      };
    };
    expect(origemNoChat.mensagens.map(citada)).toEqual(esperadas);
    expect(citada(origemNoChat)).toEqual(esperadas[0]);
  });

  it('cada mensagem citada ganha a marca, e o evento diz quantas; o evento de antes conta uma', async () => {
    const das1019 = await escrever('paulo', 'A impressora do Financeiro manchou.');
    const das1020 = await escrever('paulo', 'Olha a folha.');
    const fora = await escrever('tatiana', 'Bom dia!');
    const das1021 = await escrever('fernanda', 'Aqui também.');
    const numero = await aberto('fernanda', equipe, [das1019.id, das1020.id, das1021.id]);

    const marcas = async () => {
      const r = await c.cliente.consultar(`/chat/conversas/${equipe}/mensagens`, c.como('paulo'));
      expect(r.statusCode, r.body).toBe(200);
      return (
        r.json() as {
          itens: {
            id: string;
            evento: string | null;
            chamado: { numero: number; mensagem: string | null; mensagens: number } | null;
          }[];
        }
      ).itens.map(({ id, evento, chamado }) => ({ id, evento, chamado }));
    };
    const marca = { numero, mensagem: das1019.id, mensagens: 3 };
    const lidas = await marcas();
    expect(lidas.slice(0, 4)).toEqual([
      { id: das1019.id, evento: null, chamado: expect.objectContaining(marca) },
      { id: das1020.id, evento: null, chamado: expect.objectContaining(marca) },
      { id: fora.id, evento: null, chamado: null },
      { id: das1021.id, evento: null, chamado: expect.objectContaining(marca) },
    ]);
    expect(lidas[4]).toEqual({
      id: expect.any(String),
      evento: 'virou-chamado',
      chamado: expect.objectContaining(marca),
    });

    // O evento gravado antes da contagem, sem as `mensagens`, conta uma; o chat não muda as
    // mensagens, e a mudança vai pelo dono das tabelas.
    const dono = await api.dono.connect();
    try {
      await dono.query('begin');
      await dono.query("select set_config('app.org_id', $1, true)", [c.org]);
      await dono.query(
        "update mensagens_do_chat set dados = dados - 'mensagens' where evento = 'virou-chamado'",
      );
      await dono.query('commit');
    } finally {
      dono.release();
    }
    expect((await marcas())[4]?.chamado?.mensagens).toBe(1);
  });
});

describe('as recusas', () => {
  it('sem mensagens, com mais de 20, de outra conversa e a que já virou chamado, nada é gravado', async () => {
    const das1019 = await escrever('paulo', 'A impressora do Financeiro manchou.');
    const das1020 = await escrever('paulo', 'Olha a folha.');
    const das1021 = await escrever('fernanda', 'Aqui também.');
    const direta = await c.criarDireta('fernanda', 'paulo');
    const daDireta = await c.mensagem(direta, 'paulo', 'Viu a impressora?');

    const semNenhuma = await abrir('fernanda', equipe, []);
    expect(semNenhuma.statusCode, semNenhuma.body).toBe(400);
    expect(semNenhuma.json()).toMatchObject({ campos: { mensagens: 'Escolha as mensagens.' } });

    const vinteEUma = Array.from({ length: 21 }, () => crypto.randomUUID());
    const demais = await abrir('fernanda', equipe, vinteEUma);
    expect(demais.statusCode, demais.body).toBe(400);
    expect(demais.json()).toMatchObject({ campos: { mensagens: 'Escolha até 20 mensagens.' } });

    // A mensagem da conversa direta, pela rota da equipe, e a da equipe, pela da direta.
    for (const [conversa, mensagens] of [
      [equipe, [das1019.id, daDireta]],
      [direta, [das1019.id]],
    ] as const) {
      const r = await abrir('fernanda', conversa, [...mensagens]);
      expect(r.statusCode, r.body).toBe(404);
      expect(r.json()).toMatchObject({ detail: 'A mensagem não foi encontrada.' });
    }
    // A conversa direta, de que Tatiana não participa.
    const deFora = await abrir('tatiana', direta, [daDireta]);
    expect(deFora.statusCode, deFora.body).toBe(404);
    expect(await contarChamados()).toBe(0);

    // A das 10:19 vira o chamado: com ela, a abertura é recusada, só ou com as outras.
    const numero = await aberto('fernanda', equipe, [das1019.id]);
    const so = await abrir('tatiana', equipe, [das1019.id]);
    expect(so.statusCode, so.body).toBe(409);
    expect(so.json()).toMatchObject({ detail: `Esta mensagem já virou o chamado #${numero}.` });
    const comOutras = await abrir('tatiana', equipe, [das1021.id, das1019.id, das1020.id]);
    expect(comOutras.statusCode, comOutras.body).toBe(409);
    expect(comOutras.json()).toMatchObject({
      detail: `Uma das mensagens já virou o chamado #${numero}.`,
    });
    expect(await contarChamados()).toBe(1);
  });

  it('duas aberturas com mensagens em comum ao mesmo tempo: a primeira vence', async () => {
    const das1019 = await escrever('paulo', 'A impressora do Financeiro manchou.');
    const das1020 = await escrever('paulo', 'Olha a folha.');
    const das1021 = await escrever('fernanda', 'Aqui também.');

    // A das 10:20 travada numa conexão à parte, até as duas aberturas esperarem por ela.
    let preso: () => void = () => {};
    const travado = new Promise<void>((resolve) => {
      preso = resolve;
    });
    let soltar: () => void = () => {};
    const segurando = naOrg(async (tx) => {
      await travar(tx, `mensagem:${das1020.id}`);
      preso();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await travado;
    const daFernanda = abrir('fernanda', equipe, [das1019.id, das1020.id]);
    const daTatiana = abrir('tatiana', equipe, [das1021.id, das1020.id]);
    await esperarNaTrava(api, 2);
    soltar();
    await segurando;

    const respostas = [await daFernanda, await daTatiana];
    expect(respostas.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
    const vencedora = respostas.find(({ statusCode }) => statusCode === 201);
    const numero = (vencedora?.json() as { numero: number } | undefined)?.numero;
    expect(respostas.find(({ statusCode }) => statusCode === 409)?.json()).toMatchObject({
      detail: `Uma das mensagens já virou o chamado #${numero}.`,
    });
    expect(await contarChamados()).toBe(1);
  });

  it('a violação do índice de cada mensagem num chamado só é a mesma recusa', async () => {
    const das1019 = await escrever('paulo', 'A impressora do Financeiro manchou.');
    const das1020 = await escrever('paulo', 'Olha a folha.');
    const das1021 = await escrever('fernanda', 'Aqui também.');
    const numero = await aberto('fernanda', equipe, [das1019.id]);
    const [chamado] = await naOrg((tx) =>
      tx.select({ id: chamados.id }).from(chamados).where(eq(chamados.numero, numero)),
    );

    // Uma gravação sem as travas põe a das 10:20 no chamado, sem confirmar até a abertura esperar
    // pelo índice: a conferência das linhas da origem não a vê.
    let preso: () => void = () => {};
    const gravado = new Promise<void>((resolve) => {
      preso = resolve;
    });
    let confirmar: () => void = () => {};
    const semAsTravas = naOrg(async (tx) => {
      await tx.insert(mensagensDosChamados).values({
        orgId: c.org,
        chamadoId: chamado?.id ?? '',
        especie: 'origem',
        autorConta: c.conta('paulo'),
        texto: 'Olha a folha.',
        dados: { conversa: equipe, mensagem: das1020.id, em: das1020.em },
        criadaEm: api.relogio.agora(),
      });
      preso();
      await new Promise<void>((resolve) => {
        confirmar = resolve;
      });
    });
    await gravado;
    const daTatiana = abrir('tatiana', equipe, [das1020.id, das1021.id]);
    await esperarNaTrava(api, 1);
    confirmar();
    await semAsTravas;

    const r = await daTatiana;
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json()).toMatchObject({ detail: `Uma das mensagens já virou o chamado #${numero}.` });
    expect(await contarChamados()).toBe(1);
  });
});
