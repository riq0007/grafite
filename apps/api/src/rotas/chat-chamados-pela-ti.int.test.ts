// Quem participa pela TI não age nem é avisada como quem pediu (spec chamados, "Quem atende pelo
// chat" e "Notificações dos chamados"; change andamento-e-varias-mensagens, design, decisão 4;
// tarefa 3.3): as rotas de quem participa recusam a Ana, que abriu pelo chat o chamado de Paulo e o
// atende, a mensagem, a escolha, o "Reabrir" e a avaliação, e o "Marcar como vista" segue; e a
// mensagem da TI e o resolvido vão a Paulo, e não a ela, pelos acessos dela, e não pelos de quem age.
import { atribuicoes, chamados, naOrganizacao, notificacoes } from '@grafite/db';
import { and, asc, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { type ApiDeTeste, abrirApi, atribuir, criarRelogio } from '../../test/integracao.ts';

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T13:19:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-chamados-pela-ti-${enderecos}.local`);
  await c.entrar();
});

const naOrg = <T>(fn: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, c.org, fn);

const daTi = (usuario: UsuarioDoChat, acao: string, numero: number, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chamados/${numero}/${acao}`, c.como(usuario), corpo);

const comoQuemParticipa = (usuario: UsuarioDoChat, numero: number, acao: string, corpo = {}) =>
  c.cliente.enviar('POST', `/chat/chamados/${numero}/${acao}`, c.como(usuario), corpo);

const linhaDo = async (numero: number) => {
  const [linha] = await naOrg((tx) =>
    tx
      .select({ situacao: chamados.situacao, versao: chamados.versao })
      .from(chamados)
      .where(eq(chamados.numero, numero)),
  );
  return linha;
};

/** Os títulos das notificações do chamado no chat que a conta recebeu, na ordem. */
const avisosNoChat = async (usuario: UsuarioDoChat, numero: number) =>
  (
    await naOrg((tx) =>
      tx
        .select({ titulo: notificacoes.titulo })
        .from(notificacoes)
        .where(
          and(
            eq(notificacoes.contaId, c.conta(usuario)),
            eq(notificacoes.destino, `/chat/chamados/${numero}`),
          ),
        )
        .orderBy(asc(notificacoes.criadaEm), asc(notificacoes.id)),
    )
  ).map(({ titulo }) => titulo);

/** O chamado de Paulo que Ana abre pelo chat, da mensagem dele no canal, e atende. */
async function abertoPelaAna(canal: string) {
  const mensagem = await c.mensagem(canal, 'paulo', 'A impressora do Financeiro manchou.');
  const numero = await c.abrirChamado('paulo', 'A impressora do Financeiro manchou.');
  await c.virarChamadoDa(numero, canal, mensagem, 'ana');
  return numero;
}

describe('as rotas de quem participa', () => {
  it('recusam a Ana responder, escolher, reabrir e avaliar, e a marcação como vista segue', async () => {
    const canal = await c.criarCanal('Geral');
    const numero = await abertoPelaAna(canal);
    const pergunta = await c.mensagemDaTi(numero, 'Posso reiniciar agora?', {
      opcoes: ['Pode', 'Agora não'],
    });
    const respondaPelaTi = `Você atende o chamado #${numero}. Responda pela TI.`;

    const recusada = async (acao: string, corpo: object, detail: string) => {
      const r = await comoQuemParticipa('ana', numero, acao, corpo);
      expect(r.statusCode, `${acao}: ${r.body}`).toBe(409);
      expect(r.json()).toMatchObject({ detail });
    };

    const emAtendimento = await linhaDo(numero);
    await recusada('mensagens', { texto: 'Já vou ver.' }, respondaPelaTi);
    await recusada('escolha', { mensagem: pergunta, opcao: 'Pode' }, respondaPelaTi);
    expect(await linhaDo(numero)).toEqual(emAtendimento);

    expect((await daTi('ana', 'resolver', numero, { feito: 'Troquei o toner.' })).statusCode).toBe(
      200,
    );
    const resolvido = await linhaDo(numero);
    await recusada('reabertura', {}, respondaPelaTi);
    await recusada(
      'avaliacao',
      { nivel: 'otimo' },
      `Quem atende o chamado #${numero} não o avalia.`,
    );
    expect(await linhaDo(numero)).toEqual(resolvido);

    const vista = await comoQuemParticipa('ana', numero, 'vista');
    expect(vista.statusCode, vista.body).toBe(200);

    // Paulo, que pediu, reabre.
    expect((await comoQuemParticipa('paulo', numero, 'reabertura')).statusCode).toBe(200);
  });
});

describe('as notificações de quem participa', () => {
  it('a mensagem da TI e o resolvido vão a Paulo, e não a Ana, que atende pela TI', async () => {
    const canal = await c.criarCanal('Geral');
    const numero = await abertoPelaAna(canal);

    // Lívia, que administra a organização, escreve a Paulo e resolve.
    const mensagem = await daTi('livia', 'mensagem', numero, { texto: 'Já estou indo.' });
    expect(mensagem.statusCode, mensagem.body).toBe(200);
    const resolveu = await daTi('livia', 'resolver', numero, { feito: 'Troquei o toner.' });
    expect(resolveu.statusCode, resolveu.body).toBe(200);

    expect(await avisosNoChat('paulo', numero)).toEqual([
      `Lívia Prates respondeu o #${numero}`,
      expect.stringMatching(new RegExp(`^#${numero} resolvido: `)),
    ]);
    expect(await avisosNoChat('ana', numero)).toEqual([]);
  });

  it('quem abriu pelo chat e não atende mais recebe como quem pediu, pelos acessos dela', async () => {
    const canal = await c.criarCanal('Geral');
    const numero = await abertoPelaAna(canal);

    // Ana deixa de atender e segue usando o chat, como colaboradora.
    await naOrg((tx) =>
      tx
        .delete(atribuicoes)
        .where(and(eq(atribuicoes.contaId, c.conta('ana')), eq(atribuicoes.perfilId, c.perfis.ti))),
    );
    await atribuir(api, c.org, { perfilId: c.perfis.colaborador, contaId: c.conta('ana') });

    // Quem age, Lívia, atende tudo: o lado de Ana sai dos acessos dela.
    const mensagem = await daTi('livia', 'mensagem', numero, { texto: 'Já estou indo.' });
    expect(mensagem.statusCode, mensagem.body).toBe(200);
    expect(await avisosNoChat('paulo', numero)).toEqual([`Lívia Prates respondeu o #${numero}`]);
    expect(await avisosNoChat('ana', numero)).toEqual([`Lívia Prates respondeu o #${numero}`]);

    // E volta a responder como quem pediu, pela rota de quem participa.
    const resposta = await comoQuemParticipa('ana', numero, 'mensagens', { texto: 'Obrigada.' });
    expect(resposta.statusCode, resposta.body).toBe(200);
  });
});
