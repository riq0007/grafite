// As reações, a leitura e o silenciar (spec chat, "Reações", "Não lidas" e "Silenciar uma
// conversa"; change chat-com-chamados, design, decisões 4, 5 e 6; tarefa 3.3): a reação que vai e
// volta, com o teto de 10 textos pela trava da mensagem; a leitura, que só anda para a frente e marca
// as notificações da conversa até a mensagem lida; o silenciar; e os eventos de cada um. As frases e
// o que a reação aceita são do domínio; aqui fica um caso de cada ligação.
import {
  eventos,
  leiturasDasConversas,
  naOrganizacao,
  notificacoes,
  reacoesDasMensagens,
} from '@grafite/db';
import { asc, inArray } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { type ApiDeTeste, abrirApi, criarRelogio, esperarNaTrava } from '../../test/integracao.ts';
import { travar } from '../travas.ts';

interface ReacaoLida {
  texto: string;
  contas: { conta: string; nome: string }[];
  minha: boolean;
}

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;

const reagir = (usuario: UsuarioDoChat, mensagem: string, texto: string) =>
  c.cliente.enviar('POST', `/chat/mensagens/${mensagem}/reacoes`, c.como(usuario), { texto });

const ler = (usuario: UsuarioDoChat, conversa: string, ate: string) =>
  c.cliente.enviar('POST', `/chat/conversas/${conversa}/leitura`, c.como(usuario), { ate });

const silenciar = (usuario: UsuarioDoChat, conversa: string, silenciada: boolean) =>
  c.cliente.enviar('PUT', `/chat/conversas/${conversa}/silenciada`, c.como(usuario), {
    silenciada,
  });

const eventosDoChat = () =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .select()
      .from(eventos)
      .where(inArray(eventos.tipo, ['chat.mudou', 'notificacoes.mudaram']))
      .orderBy(asc(eventos.id)),
  ).then((linhas) =>
    linhas.map(({ tipo, alvoId, permissao, grupos, contas }) => ({
      tipo,
      alvoId,
      permissao,
      grupos,
      contas,
    })),
  );

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T12:00:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-leitura-${enderecos}.local`);
  await c.entrar();
});

describe('as reações', () => {
  it('a mesma reação de novo tira a da conta, e a conversa recebe o chat.mudou', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const doPaulo = await c.mensagem(equipe, 'paulo', 'A impressora está manchando.');
    await c.reagir('tatiana', doPaulo, '+1');

    const dada = await reagir('fernanda', doPaulo, '+1');
    expect(dada.statusCode, dada.body).toBe(200);
    expect((dada.json() as { reacoes: ReacaoLida[] }).reacoes).toEqual([
      {
        texto: '+1',
        contas: [
          { conta: c.conta('tatiana'), nome: 'Tatiana Ramos' },
          { conta: c.conta('fernanda'), nome: 'Fernanda Rocha' },
        ],
        minha: true,
      },
    ]);

    const tirada = await reagir('fernanda', doPaulo, ' +1 ');
    expect(tirada.statusCode, tirada.body).toBe(200);
    expect((tirada.json() as { reacoes: ReacaoLida[] }).reacoes).toEqual([
      { texto: '+1', contas: [{ conta: c.conta('tatiana'), nome: 'Tatiana Ramos' }], minha: false },
    ]);
    expect(await eventosDoChat()).toEqual(
      Array.from({ length: 2 }, () => ({
        tipo: 'chat.mudou',
        alvoId: equipe,
        permissao: 'chat.usar',
        grupos: [c.grupos.financeiro],
        contas: null,
      })),
    );
  });

  it('quem só lê o canal reage, e as recusas do texto, de quem não participa e da arquivada', async () => {
    const avisos = await c.criarCanal('Avisos da TI', { escreve: c.grupos.ti });
    const daAna = await c.mensagem(avisos, 'ana', 'O sistema volta às 14h.');
    expect((await reagir('fernanda', daAna, 'visto')).statusCode).toBe(200);

    const vazia = await reagir('fernanda', daAna, '   ');
    expect(vazia.statusCode).toBe(400);
    expect(vazia.json()).toMatchObject({ campos: { texto: 'Escreva a reação.' } });
    const longa = await reagir('fernanda', daAna, 'a'.repeat(21));
    expect(longa.statusCode).toBe(400);
    expect(longa.json()).toMatchObject({ campos: { texto: 'Use até 20 caracteres.' } });

    const equipeTi = await c.criarEquipe('Equipe TI', c.grupos.ti);
    const daTi = await c.mensagem(equipeTi, 'ana', 'Reunião às 15h.');
    const deOutros = await reagir('fernanda', daTi, '+1');
    expect(deOutros.statusCode).toBe(404);
    expect(deOutros.json()).toMatchObject({ detail: 'A mensagem não foi encontrada.' });

    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const doPaulo = await c.mensagem(equipe, 'paulo', 'Antes de arquivar.');
    await c.arquivar(equipe);
    const daArquivada = await reagir('fernanda', doPaulo, '+1');
    expect(daArquivada.statusCode).toBe(409);
    expect(daArquivada.json()).toMatchObject({
      detail: 'A equipe Equipe Financeiro está arquivada.',
    });

    const gravadas = await naOrganizacao(api.banco, c.org, (tx) =>
      tx.select({ texto: reacoesDasMensagens.texto }).from(reacoesDasMensagens),
    );
    expect(gravadas).toEqual([{ texto: 'visto' }]);
  });

  it('o décimo texto que espera a trava da mensagem é recusado, e o que já está nela soma', async () => {
    const canal = await c.criarCanal('Geral');
    const daAna = await c.mensagem(canal, 'ana', 'Quem vai à confraternização?');
    for (let i = 1; i <= 9; i += 1) await c.reagir('tatiana', daAna, `Texto ${i}`);

    let preso: () => void = () => {};
    const travado = new Promise<void>((resolve) => {
      preso = resolve;
    });
    let soltar: () => void = () => {};
    const doPaulo = naOrganizacao(api.banco, c.org, async (tx) => {
      await travar(tx, `mensagem:${daAna}`);
      await tx.insert(reacoesDasMensagens).values({
        orgId: c.org,
        mensagemId: daAna,
        contaId: c.conta('paulo'),
        texto: 'Eu vou',
      });
      preso();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await travado;
    const daFernanda = reagir('fernanda', daAna, 'Eu também');
    await esperarNaTrava(api, 1);
    soltar();
    await doPaulo;
    const recusada = await daFernanda;
    expect(recusada.statusCode).toBe(400);
    expect(recusada.json()).toMatchObject({
      campos: { texto: 'A mensagem já tem 10 reações diferentes.' },
    });

    const soma = await reagir('fernanda', daAna, 'Eu vou');
    expect(soma.statusCode, soma.body).toBe(200);
    expect((soma.json() as { reacoes: ReacaoLida[] }).reacoes.at(-1)).toMatchObject({
      texto: 'Eu vou',
      minha: true,
    });
  });
});

describe('a leitura', () => {
  it('só anda para a frente e marca as notificações da conversa até a mensagem lida', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const canal = await c.criarCanal('Geral');
    const ids = [
      await c.mensagem(equipe, 'paulo', 'Uma.'),
      await c.mensagem(equipe, 'paulo', 'Duas.'),
      await c.mensagem(equipe, 'paulo', 'Três.'),
    ];
    const doCanal = await c.mensagem(canal, 'ana', 'Bom dia.');
    const avisadas = [
      ...(await Promise.all(ids.map((id) => c.notificarMensagem('fernanda', equipe, id)))),
      await c.notificarMensagem('fernanda', canal, doCanal),
    ];

    const lida = await ler('fernanda', equipe, ids[1] ?? '');
    expect(lida.statusCode, lida.body).toBe(200);
    expect(lida.json()).toEqual({ lidaAte: ids[1] });
    const lidas = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select({ id: notificacoes.id, lidaEm: notificacoes.lidaEm })
        .from(notificacoes)
        .where(inArray(notificacoes.id, avisadas))
        .orderBy(asc(notificacoes.mensagemDoChatId)),
    );
    expect(lidas.map(({ lidaEm }) => lidaEm !== null)).toEqual([true, true, false, false]);

    const lista = await c.cliente.consultar('/chat/conversas', c.como('fernanda'));
    expect(
      (lista.json() as { equipesECanais: { id: string; naoLidas: number }[] }).equipesECanais.find(
        ({ id }) => id === equipe,
      )?.naoLidas,
    ).toBe(1);

    const voltando = await ler('fernanda', equipe, ids[0] ?? '');
    expect(voltando.json()).toEqual({ lidaAte: ids[1] });

    // A leitura vai às sessões da conta, e a das notificações ao sino dela; a que não anda, não.
    expect(await eventosDoChat()).toEqual([
      {
        tipo: 'chat.mudou',
        alvoId: equipe,
        permissao: null,
        grupos: null,
        contas: [c.conta('fernanda')],
      },
      {
        tipo: 'notificacoes.mudaram',
        alvoId: null,
        permissao: null,
        grupos: null,
        contas: [c.conta('fernanda')],
      },
    ]);
  });

  it('a mensagem de outra conversa é recusada, e a conversa de outros é inexistente', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const canal = await c.criarCanal('Geral');
    const doCanal = await c.mensagem(canal, 'ana', 'Bom dia.');
    const deOutra = await ler('fernanda', equipe, doCanal);
    expect(deOutra.statusCode).toBe(400);
    expect(deOutra.json()).toMatchObject({
      campos: { ate: 'A mensagem não está nesta conversa.' },
    });

    const equipeTi = await c.criarEquipe('Equipe TI', c.grupos.ti);
    const daTi = await c.mensagem(equipeTi, 'ana', 'Reunião às 15h.');
    for (const r of [
      await ler('fernanda', equipeTi, daTi),
      await silenciar('fernanda', equipeTi, true),
    ]) {
      expect(r.statusCode).toBe(404);
      expect(r.json()).toMatchObject({ detail: 'Conversa não encontrada.' });
    }
  });
});

describe('o silenciar', () => {
  it('a silenciada sai do total do chat e fica com o contador na lista', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    await c.mensagem(equipe, 'paulo', 'Uma.');
    const total = async () =>
      (
        (await c.cliente.consultar('/chat/resumo', c.como('fernanda'))).json() as {
          naoLidas: number;
        }
      ).naoLidas;
    expect(await total()).toBe(1);

    const silenciada = await silenciar('fernanda', equipe, true);
    expect(silenciada.statusCode, silenciada.body).toBe(200);
    expect(silenciada.json()).toEqual({ silenciada: true });
    expect(await total()).toBe(0);
    const lista = await c.cliente.consultar('/chat/conversas', c.como('fernanda'));
    expect(
      (lista.json() as { equipesECanais: { id: string; naoLidas: number; silenciada: boolean }[] })
        .equipesECanais,
    ).toMatchObject([{ id: equipe, naoLidas: 1, silenciada: true }]);

    expect((await silenciar('fernanda', equipe, false)).json()).toEqual({ silenciada: false });
    expect(await total()).toBe(1);
    expect(await eventosDoChat()).toEqual(
      Array.from({ length: 2 }, () => ({
        tipo: 'chat.mudou',
        alvoId: equipe,
        permissao: null,
        grupos: null,
        contas: [c.conta('fernanda')],
      })),
    );
  });

  it('voltar a ouvir a conversa que nunca foi silenciada não grava a leitura nem avisa', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const r = await silenciar('fernanda', equipe, false);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ silenciada: false });
    expect(
      await naOrganizacao(api.banco, c.org, (tx) => tx.select().from(leiturasDasConversas)),
    ).toEqual([]);
    expect(await eventosDoChat()).toEqual([]);
  });
});
