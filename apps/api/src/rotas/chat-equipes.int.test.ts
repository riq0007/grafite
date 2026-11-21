// As equipes e os canais (spec chat, "Equipes e canais", "Chamados da conversa" e "Permissões,
// auditoria e eventos do chat"; spec modulo-chat, "Equipes e Avisos na tela", "Conversa na tela" e
// "Equipes e canais na tela"; change chat-com-chamados, tarefa 3.5): o cadastro com o
// `chat.configurar`, as recusas, o arquivar e o reativar com o nome e o teto, a auditoria, os
// eventos, a vista Equipes com quem participa e as abas Arquivos e "Chamados da equipe". As frases e
// a conferência são do domínio; aqui fica a ligação, começando pela permissão.
import { auditoria, conversas, eventos, grupos, naOrganizacao } from '@grafite/db';
import { LIMITE_DE_EQUIPES_E_CANAIS } from '@grafite/domain';
import { asc, eq, inArray } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  criarGrupo,
  criarPerfil,
  criarRelogio,
} from '../../test/integracao.ts';

const NOME_REPETIDO = 'Já existe uma equipe ou um canal com esse nome.';

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;

interface Pedido {
  nome: string;
  tipo: 'equipe' | 'canal';
  grupoId: string | null;
  quemEscreve: 'todos' | 'grupo';
  escreveGrupoId: string | null;
  avisar: boolean;
}

const pedido = (mudancas: Partial<Pedido> = {}): Pedido => ({
  nome: 'Equipe Financeiro',
  tipo: 'equipe',
  grupoId: c.grupos.financeiro,
  quemEscreve: 'todos',
  escreveGrupoId: null,
  avisar: false,
  ...mudancas,
});

const cadastrar = (usuario: UsuarioDoChat, corpo: Pedido) =>
  c.cliente.enviar('POST', '/chat/equipes-e-canais', c.como(usuario), corpo);

const alterar = (usuario: UsuarioDoChat, id: string, corpo: Pedido) =>
  c.cliente.enviar('PUT', `/chat/equipes-e-canais/${id}`, c.como(usuario), corpo);

const arquivar = (usuario: UsuarioDoChat, id: string) =>
  c.cliente.enviar('POST', `/chat/equipes-e-canais/${id}/arquivamento`, c.como(usuario));

const reativar = (usuario: UsuarioDoChat, id: string) =>
  c.cliente.enviar('POST', `/chat/equipes-e-canais/${id}/reativacao`, c.como(usuario));

/** Cadastra pela Lívia, que administra, e devolve o id. */
async function criar(corpo: Pedido) {
  const r = await cadastrar('livia', corpo);
  expect(r.statusCode, r.body).toBe(201);
  return (r.json() as { id: string }).id;
}

const equipesECanaisDa = async (usuario: UsuarioDoChat) =>
  (
    (await c.cliente.consultar('/chat/conversas', c.como(usuario))).json() as {
      equipesECanais: { nome: string }[];
    }
  ).equipesECanais.map(({ nome }) => nome);

const eventosDoChat = () =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .select({
        alvoId: eventos.alvoId,
        permissao: eventos.permissao,
        grupos: eventos.grupos,
        contas: eventos.contas,
      })
      .from(eventos)
      .where(inArray(eventos.tipo, ['chat.mudou']))
      .orderBy(asc(eventos.id)),
  );

const inativarGrupo = (grupoId: string) =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx.update(grupos).set({ situacao: 'inativo' }).where(eq(grupos.id, grupoId)),
  );

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T12:00:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-equipes-${enderecos}.local`);
  await c.entrar();
});

describe('o cadastro', () => {
  it('sem o chat.configurar, nada se lê nem se grava', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    for (const usuario of ['ana', 'rita'] as const) {
      const recusadas = [
        await c.cliente.consultar('/chat/equipes-e-canais', c.como(usuario)),
        await c.cliente.consultar('/chat/grupos', c.como(usuario)),
        await c.cliente.consultar(`/chat/equipes-e-canais/${equipe}`, c.como(usuario)),
        await cadastrar(usuario, pedido({ nome: 'Outra' })),
        await alterar(usuario, equipe, pedido({ nome: 'Outra' })),
        await arquivar(usuario, equipe),
        await reativar(usuario, equipe),
      ];
      expect(recusadas.map(({ statusCode }) => statusCode)).toEqual(Array(7).fill(403));
    }
    const [gravada] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx.select().from(conversas).where(eq(conversas.id, equipe)),
    );
    expect(gravada).toMatchObject({ nome: 'Equipe Financeiro', arquivadaEm: null });
  });

  it('a escolha da gaveta lê os grupos ativos com o chat.configurar, sem o acessos.ver', async () => {
    const configura = await criarPerfil(api, c.org, {
      nome: 'Configura o chat',
      permissoes: ['chat.configurar'],
    });
    await atribuir(api, c.org, { perfilId: configura, contaId: c.conta('rita') });
    const antigo = await criarGrupo(api, c.org, { nome: 'Antigo' });
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx.update(grupos).set({ situacao: 'inativo' }).where(eq(grupos.id, antigo)),
    );

    const r = await c.cliente.consultar('/chat/grupos', c.como('rita'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      itens: [
        { id: c.grupos.financeiro, nome: 'Financeiro' },
        { id: c.grupos.ti, nome: 'TI' },
        { id: c.grupos.todos, nome: 'Todos' },
      ],
    });
    expect((await c.cliente.consultar('/grupos', c.como('rita'))).statusCode).toBe(403);
  });

  it('a equipe criada chega a quem é do grupo, e as recusas ficam por campo', async () => {
    const r = await cadastrar('livia', pedido());
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      tipo: 'equipe',
      nome: 'Equipe Financeiro',
      grupo: { id: c.grupos.financeiro, nome: 'Financeiro', ativo: true },
      escreve: null,
      avisar: false,
      arquivada: false,
    });
    expect(await equipesECanaisDa('fernanda')).toEqual(['Equipe Financeiro']);
    expect(await equipesECanaisDa('ana')).toEqual([]);

    const vazia = await cadastrar(
      'livia',
      pedido({ nome: '  ', grupoId: null, quemEscreve: 'grupo', escreveGrupoId: null }),
    );
    expect(vazia.statusCode).toBe(400);
    expect(vazia.json()).toMatchObject({
      campos: {
        nome: 'Escreva o nome.',
        grupoId: 'Escolha o grupo da equipe.',
        escreveGrupoId: 'Escolha o grupo que escreve.',
      },
    });
    const repetida = await cadastrar('livia', pedido({ nome: 'equipe  FINANCEIRO' }));
    expect(repetida.statusCode).toBe(409);
    expect(repetida.json()).toMatchObject({ campos: { nome: NOME_REPETIDO } });

    await inativarGrupo(c.grupos.ti);
    const inativo = await cadastrar('livia', pedido({ nome: 'Equipe TI', grupoId: c.grupos.ti }));
    expect(inativo.json()).toMatchObject({ campos: { grupoId: 'Escolha o grupo da equipe.' } });
  });

  it('a alteração mantém o grupo gravado inativo e o tipo, e recusa trocar para um inativo', async () => {
    const equipe = await criar(pedido());
    await inativarGrupo(c.grupos.financeiro);
    const r = await alterar('livia', equipe, pedido({ nome: 'Financeiro', tipo: 'canal' }));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      tipo: 'equipe',
      nome: 'Financeiro',
      grupo: { id: c.grupos.financeiro, nome: 'Financeiro', ativo: false },
    });
    const lida = await c.cliente.consultar(`/chat/equipes-e-canais/${equipe}`, c.como('livia'));
    expect(lida.json()).toEqual(r.json());

    await inativarGrupo(c.grupos.ti);
    const trocada = await alterar(
      'livia',
      equipe,
      pedido({ nome: 'Financeiro', quemEscreve: 'grupo', escreveGrupoId: c.grupos.ti }),
    );
    expect(trocada.statusCode).toBe(400);
    expect(trocada.json()).toMatchObject({
      campos: { escreveGrupoId: 'Escolha o grupo que escreve.' },
    });
    expect((await alterar('livia', crypto.randomUUID(), pedido())).json()).toMatchObject({
      status: 404,
    });
  });

  it('o arquivado sai da lista e não recebe mensagens, e o reativar confere o nome', async () => {
    const avisos = await criar(pedido({ nome: 'Avisos', tipo: 'canal', grupoId: null }));
    const r = await arquivar('livia', avisos);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ arquivada: true });
    expect(await equipesECanaisDa('fernanda')).toEqual([]);
    const mensagem = await c.cliente.enviar(
      'POST',
      `/chat/conversas/${avisos}/mensagens`,
      c.como('fernanda'),
      { texto: 'Alguém?' },
    );
    expect(mensagem.statusCode).toBe(409);
    expect(mensagem.json()).toMatchObject({ detail: 'O canal Avisos está arquivado.' });

    // O arquivado libera o nome, e o reativar o confere.
    await criar(pedido({ nome: 'Avisos', tipo: 'canal', grupoId: null }));
    const emUso = await reativar('livia', avisos);
    expect(emUso.statusCode).toBe(409);
    expect(emUso.json()).toMatchObject({ campos: { nome: NOME_REPETIDO } });
    const [gravado] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select({ arquivadaEm: conversas.arquivadaEm })
        .from(conversas)
        .where(eq(conversas.id, avisos)),
    );
    expect(gravado?.arquivadaEm).not.toBeNull();
  });

  it('o teto conta só os ativos, no cadastro e no reativar', async () => {
    const velho = await criar(pedido({ nome: 'Velho', tipo: 'canal', grupoId: null }));
    await arquivar('livia', velho);
    for (let i = 1; i < LIMITE_DE_EQUIPES_E_CANAIS; i += 1) await c.criarCanal(`Canal ${i}`);
    const ultimo = await criar(pedido({ nome: 'Último', tipo: 'canal', grupoId: null }));

    const teto = `A organização já tem ${LIMITE_DE_EQUIPES_E_CANAIS} equipes e canais.`;
    const novo = await cadastrar(
      'livia',
      pedido({ nome: 'Mais um', tipo: 'canal', grupoId: null }),
    );
    expect(novo.statusCode).toBe(409);
    expect(novo.json()).toMatchObject({ detail: teto });
    const reativado = await reativar('livia', velho);
    expect(reativado.statusCode).toBe(409);
    expect(reativado.json()).toMatchObject({ detail: teto });

    await arquivar('livia', ultimo);
    const agora = await reativar('livia', velho);
    expect(agora.statusCode, agora.body).toBe(200);
    expect(agora.json()).toMatchObject({ nome: 'Velho', arquivada: false });
  });

  it('a auditoria guarda o antes e o depois com o nome de agora, e os eventos vão aos dois grupos', async () => {
    const canal = await criar(pedido({ nome: 'Avisos da TI', tipo: 'canal', grupoId: null }));
    const r = await alterar(
      'livia',
      canal,
      pedido({
        nome: 'Avisos da TI',
        tipo: 'canal',
        grupoId: null,
        quemEscreve: 'grupo',
        escreveGrupoId: c.grupos.ti,
      }),
    );
    expect(r.json()).toMatchObject({ escreve: { id: c.grupos.ti, nome: 'TI', ativo: true } });
    // A gravação que não muda nada não grava.
    await alterar(
      'livia',
      canal,
      pedido({
        nome: 'Avisos da TI',
        tipo: 'canal',
        grupoId: null,
        quemEscreve: 'grupo',
        escreveGrupoId: c.grupos.ti,
      }),
    );
    const registros = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select({
          acao: auditoria.acao,
          alvoTipo: auditoria.alvoTipo,
          alvoId: auditoria.alvoId,
          antes: auditoria.antes,
          depois: auditoria.depois,
        })
        .from(auditoria)
        .where(eq(auditoria.alvoId, canal))
        .orderBy(asc(auditoria.momento), asc(auditoria.id)),
    );
    expect(registros.map(({ acao }) => acao)).toEqual(['canal.criado', 'canal.alterado']);
    expect(registros[1]).toMatchObject({
      alvoTipo: 'conversa',
      antes: { escreve: 'Todos que participam' },
      depois: { escreve: 'TI' },
    });
    const lista = await c.cliente.consultar(`/auditoria?alvo=conversa:${canal}`, c.como('livia'));
    expect(lista.json()).toMatchObject({
      itens: [{ alvo: { nome: 'Avisos da TI' } }, { alvo: { nome: 'Avisos da TI' } }],
    });

    // A equipe que troca de grupo avisa os dois, e quem configura.
    const equipe = await criar(pedido());
    const jaGravados = (await eventosDoChat()).length;
    await alterar('livia', equipe, pedido({ grupoId: c.grupos.ti }));
    const daTroca = (await eventosDoChat()).slice(jaGravados);
    expect(daTroca).toEqual(
      expect.arrayContaining([
        { alvoId: equipe, permissao: 'chat.usar', grupos: [c.grupos.financeiro], contas: null },
        { alvoId: equipe, permissao: 'chat.usar', grupos: [c.grupos.ti], contas: null },
        { alvoId: equipe, permissao: 'chat.configurar', grupos: null, contas: null },
      ]),
    );
    expect(daTroca).toHaveLength(3);
  });
});

describe('a vista Equipes e as abas', () => {
  it('as equipes e os canais da conta, com quantas pessoas, e quem participa', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    await c.criarCanal('Geral');
    await c.criarCanal('Antigo', { arquivada: true });
    const daFernanda = await c.cliente.consultar('/chat/equipes', c.como('fernanda'));
    expect(daFernanda.statusCode, daFernanda.body).toBe(200);
    // Usam o chat: a Fernanda, o Paulo, a Tatiana, a Ana e a Lívia; a Rita, não.
    expect(daFernanda.json()).toEqual({
      itens: [
        { id: equipe, tipo: 'equipe', nome: 'Equipe Financeiro', pessoas: 3 },
        { id: expect.any(String), tipo: 'canal', nome: 'Geral', pessoas: 5 },
      ],
    });
    expect(
      ((await c.cliente.consultar('/chat/equipes', c.como('ana'))).json() as { itens: unknown[] })
        .itens,
    ).toHaveLength(1);

    const pessoas = await c.cliente.consultar(`/chat/conversas/${equipe}/pessoas`, c.como('paulo'));
    expect(
      (pessoas.json() as { pessoas: { nome: string }[] }).pessoas.map(({ nome }) => nome),
    ).toEqual(['Fernanda Rocha', 'Paulo Nunes', 'Tatiana Ramos']);
    expect(
      (await c.cliente.consultar(`/chat/conversas/${equipe}/pessoas`, c.como('ana'))).statusCode,
    ).toBe(404);
  });

  it('a aba Arquivos traz os anexos da conversa, o mais novo primeiro, a quem participa', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const enviar = async (usuario: UsuarioDoChat, nome: string) => {
      const r = await c.cliente.enviarBytes(
        'POST',
        `/chat/anexos?nome=${encodeURIComponent(nome)}`,
        c.como(usuario),
        Buffer.from(`%PDF-1.7\n% ${nome}\n%%EOF\n`),
      );
      const { id } = r.json() as { id: string };
      const m = await c.cliente.enviar(
        'POST',
        `/chat/conversas/${equipe}/mensagens`,
        c.como(usuario),
        { texto: 'Segue.', anexos: [id] },
      );
      expect(m.statusCode, m.body).toBe(201);
      return id;
    };
    const primeiro = await enviar('paulo', 'folha.pdf');
    api.relogio.avancar(60_000);
    const segundo = await enviar('tatiana', 'nota.pdf');

    const r = await c.cliente.consultar(`/chat/conversas/${equipe}/arquivos`, c.como('fernanda'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      itens: [
        { id: segundo, nome: 'nota.pdf', autor: { nome: 'Tatiana Ramos' } },
        { id: primeiro, nome: 'folha.pdf', autor: { nome: 'Paulo Nunes' } },
      ],
      seguintes: false,
    });
    expect(
      (await c.cliente.consultar(`/chat/conversas/${equipe}/arquivos`, c.como('ana'))).statusCode,
    ).toBe(404);
  });

  it('"Chamados da equipe" traz os chamados abertos das mensagens dela, a quem participa', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const mensagem = await c.mensagem(equipe, 'paulo', 'A impressora manchou.');
    const abertoEm = api.relogio.agora().toISOString();
    const numero = await c.abrirChamado('fernanda', 'A impressora do Financeiro manchou.');
    await c.virarChamadoDa(numero, equipe, mensagem, 'fernanda');
    await c.abrirChamado('tatiana', 'Outro, sem a equipe.');

    const r = await c.cliente.consultar(`/chat/conversas/${equipe}/chamados`, c.como('tatiana'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      itens: [
        {
          numero,
          situacao: 'Em andamento',
          atende: 'Ana Souza',
          abriu: 'Fernanda Rocha',
          abertoEm,
        },
      ],
      seguintes: false,
    });
    expect((r.json() as { itens: unknown[] }).itens).toHaveLength(1);

    // A espera é "Aguardando você" só a quem participa do chamado (decisão 15).
    await c.deixarAguardando(numero);
    const situacaoPara = async (usuario: UsuarioDoChat) =>
      (
        (
          await c.cliente.consultar(`/chat/conversas/${equipe}/chamados`, c.como(usuario))
        ).json() as {
          itens: { situacao: string }[];
        }
      ).itens[0]?.situacao;
    expect(await situacaoPara('fernanda')).toBe('Aguardando você');
    expect(await situacaoPara('tatiana')).toBe('Aguardando o colaborador');
    expect(
      (await c.cliente.consultar(`/chat/conversas/${equipe}/chamados`, c.como('ana'))).statusCode,
    ).toBe(404);
  });
});
