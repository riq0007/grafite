// A resposta por ver (change aba-dos-colaboradores, spec chamados, "Resposta por ver"; design,
// decisão 5; tarefa 3.9): o `POST /api/chat/chamados/:numero/aberta` grava a abertura da conversa
// por conta e chamado e avisa só as telas e a aba da conta; a resposta por ver são as mensagens da
// resposta nova depois da última abertura, e a resposta nova segue até a pessoa responder ou marcar
// como vista. O estado da aba lê as duas, com a última por ver: quem, o chamado e a hora.
import { chamados, eventos, naOrganizacao } from '@grafite/db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ChatDeTeste, montarChat } from '../../test/chat.ts';
import { type ApiDeTeste, abrirApi, criarRelogio } from '../../test/integracao.ts';
import { carregarAcesso } from '../acesso/acesso.ts';
import { respostasDaConta } from './chat.ts';

const MINUTO = 60_000;

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-24T12:21:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-chamados-aberta-${enderecos}.local`);
  await c.entrar();
});

const daAna = (numero: number, texto: string) =>
  c.cliente.enviar('POST', `/chamados/${numero}/mensagem`, c.como('ana'), { texto });

const abrir = (numero: number, usuario: 'fernanda' | 'paulo' = 'fernanda') =>
  c.cliente.enviar('POST', `/chat/chamados/${numero}/aberta`, c.como(usuario));

const respostasDaFernanda = () =>
  naOrganizacao(api.banco, c.org, async (tx) =>
    respostasDaConta(tx, {
      contaId: c.conta('fernanda'),
      acesso: await carregarAcesso(tx, c.conta('fernanda')),
    }),
  );

const tituloDo = async (numero: number) =>
  (
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx.select({ titulo: chamados.titulo }).from(chamados).where(eq(chamados.numero, numero)),
    )
  )[0]?.titulo;

describe('a resposta por ver', () => {
  it('Vista sem responder: a abertura tira a resposta por ver, e a nova continua', async () => {
    const numero = await c.abrirChamado('fernanda');
    expect((await daAna(numero, 'Qual é a sala?')).statusCode).toBe(200);
    const antes = await respostasDaFernanda();
    expect(antes.novas).toBe(1);
    expect(antes.porVer).toEqual({
      quantas: 1,
      ultima: {
        quem: 'Ana Souza',
        numero,
        titulo: await tituloDo(numero),
        momento: api.relogio.agora(),
      },
    });
    api.relogio.avancar(51 * MINUTO);
    const r = await abrir(numero);
    expect(r.statusCode, r.body).toBe(204);
    expect(await respostasDaFernanda()).toEqual({
      novas: 1,
      porVer: { quantas: 0, ultima: null },
    });
  });

  it('Outra resposta depois de vista: volta a ter a resposta por ver, com a mensagem nova', async () => {
    const numero = await c.abrirChamado('fernanda');
    await daAna(numero, 'Qual é a sala?');
    api.relogio.avancar(51 * MINUTO);
    await abrir(numero);
    api.relogio.avancar(8 * MINUTO);
    await daAna(numero, 'Chego em 10 minutos.');
    const depois = await respostasDaFernanda();
    expect(depois.novas).toBe(1);
    expect(depois.porVer.quantas).toBe(1);
    expect(depois.porVer.ultima?.momento).toEqual(api.relogio.agora());
  });

  it('a última por ver é a mais recente entre os chamados, pela hora', async () => {
    const primeiro = await c.abrirChamado('fernanda', 'A impressora não liga.');
    const segundo = await c.abrirChamado('fernanda', 'O monitor pisca.');
    await daAna(segundo, 'Já vou ver.');
    api.relogio.avancar(5 * MINUTO);
    await daAna(primeiro, 'Trocou o cabo?');
    const lidas = await respostasDaFernanda();
    expect(lidas.porVer.quantas).toBe(2);
    expect(lidas.porVer.ultima).toMatchObject({ numero: primeiro, momento: api.relogio.agora() });
  });

  it('responder tira a resposta nova e a por ver', async () => {
    const numero = await c.abrirChamado('fernanda');
    await daAna(numero, 'Qual é a sala?');
    const r = await c.cliente.enviar(
      'POST',
      `/chat/chamados/${numero}/mensagens`,
      c.como('fernanda'),
      {
        texto: 'Sala 3.',
      },
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(await respostasDaFernanda()).toEqual({
      novas: 0,
      porVer: { quantas: 0, ultima: null },
    });
  });

  it('a abertura que não tira resposta por ver não avisa', async () => {
    const numero = await c.abrirChamado('fernanda');
    await daAna(numero, 'Qual é a sala?');
    const daAbertura = async () =>
      (
        await naOrganizacao(api.banco, c.org, (tx) =>
          tx
            .select({ id: eventos.id })
            .from(eventos)
            .where(and(eq(eventos.tipo, 'chamados.mudaram'), isNull(eventos.permissao))),
        )
      ).length;
    api.relogio.avancar(MINUTO);
    await abrir(numero);
    api.relogio.avancar(MINUTO);
    expect((await abrir(numero)).statusCode).toBe(204);
    expect(await daAbertura()).toBe(1);
    api.relogio.avancar(MINUTO);
    await daAna(numero, 'Chego em 10 minutos.');
    api.relogio.avancar(MINUTO);
    await abrir(numero);
    expect(await daAbertura()).toBe(2);
  });

  it('a abertura avisa só a conta, e quem não participa recebe 404', async () => {
    const numero = await c.abrirChamado('fernanda');
    await daAna(numero, 'Qual é a sala?');
    expect((await abrir(numero, 'paulo')).statusCode).toBe(404);
    api.relogio.avancar(MINUTO);
    expect((await abrir(numero)).statusCode).toBe(204);
    const gravados = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select({ contas: eventos.contas, permissao: eventos.permissao, todas: eventos.todas })
        .from(eventos)
        .where(and(eq(eventos.tipo, 'chamados.mudaram'), isNull(eventos.permissao)))
        .orderBy(desc(eventos.id))
        .limit(1),
    );
    // O último sem a permissão é o da abertura: o da mensagem da Ana vai a quem vê os chamados.
    expect(gravados).toEqual([
      {
        contas: [c.conta('fernanda')],
        permissao: null,
        todas: false,
      },
    ]);
  });
});
