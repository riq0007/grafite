// As notificações do chat (spec chat, "Notificações do chat"; change chat-com-chamados, design,
// decisão 6).
import { describe, expect, it } from 'vitest';
import {
  assuntoDaConversa,
  type ContaQueRecebeAMensagem,
  destinoDaMensagem,
  notificacoesDaMensagemDoChat,
  ORIGEM_DO_CHAT,
} from './notificacoes.ts';

const CONVERSA = '01936f00-0000-7000-8000-00000000c0de';
const ANTES = '01937000-0000-7000-8000-000000000009';
const MENSAGEM = '01937000-0000-7000-8000-000000000010';
const DEPOIS = '01937000-0000-7000-8000-000000000011';

const DIRETA = { id: CONVERSA, tipo: 'direta' } as const;
const AVISOS_DA_TI = { id: CONVERSA, tipo: 'canal', nome: 'Avisos da TI', avisar: true } as const;
const FINANCEIRO = {
  id: CONVERSA,
  tipo: 'equipe',
  nome: 'Equipe Financeiro',
  avisar: true,
} as const;

const DE_PAULO = {
  id: MENSAGEM,
  texto: 'Você já falou com a TI sobre a impressora?',
  autor: { contaId: 'conta-paulo', nome: 'Paulo Nunes' },
};

const DE_ANA = {
  id: MENSAGEM,
  texto: 'A rede do 2º andar para às 19 h para a troca do switch.',
  autor: { contaId: 'conta-ana', nome: 'Ana Souza' },
};

const conta = (
  id: string,
  parte: Partial<ContaQueRecebeAMensagem> = {},
): ContaQueRecebeAMensagem => ({ id, silenciada: false, lidaAte: null, ...parte });

const quemRecebe = (novas: { contaId: string }[]) => novas.map(({ contaId }) => contaId);

describe('o endereço, o assunto e a origem', () => {
  it('a mensagem abre a conversa nela, no app do chat, na origem "Chat"', () => {
    expect(destinoDaMensagem(CONVERSA, MENSAGEM)).toBe(`/chat/c/${CONVERSA}?m=${MENSAGEM}`);
    expect(ORIGEM_DO_CHAT).toBe('Chat');
  });

  it('o assunto é o da conversa, com o id em minúsculas, como o banco o devolve', () => {
    expect(assuntoDaConversa(CONVERSA.toUpperCase())).toBe(`conversa:${CONVERSA}`);
  });
});

describe('notificacoesDaMensagemDoChat', () => {
  it('Mensagem direta: a outra conta recebe "Mensagem de Paulo Nunes", com o texto, como mensagem', () => {
    expect(
      notificacoesDaMensagemDoChat(DIRETA, DE_PAULO, [
        conta('conta-paulo'),
        conta('conta-fernanda'),
      ]),
    ).toEqual([
      {
        contaId: 'conta-fernanda',
        severidade: 'info',
        titulo: 'Mensagem de Paulo Nunes',
        descricao: 'Você já falou com a TI sobre a impressora?',
        origem: 'Chat',
        destino: `/chat/c/${CONVERSA}?m=${MENSAGEM}`,
        alertaId: null,
        mensagem: true,
        assunto: `conversa:${CONVERSA}`,
        mensagemDoChatId: MENSAGEM,
      },
    ]);
  });

  it('a mensagem só com os anexos começa pelo nome do primeiro (tarefa 4.18)', () => {
    const soComAnexos = { ...DE_PAULO, texto: null, anexos: ['folha-manchada.jpg', 'nota.pdf'] };
    const [nova] = notificacoesDaMensagemDoChat(DIRETA, soComAnexos, [conta('conta-fernanda')]);
    expect(nova?.descricao).toBe('folha-manchada.jpg e mais 1 arquivo');
  });

  it('o canal e a equipe com "Avisar a cada mensagem" notificam quem participa: "Ana Souza em Avisos da TI"', () => {
    const contas = [conta('conta-ana'), conta('conta-bruno'), conta('conta-fernanda')];
    const doCanal = notificacoesDaMensagemDoChat(AVISOS_DA_TI, DE_ANA, contas);
    expect(quemRecebe(doCanal)).toEqual(['conta-bruno', 'conta-fernanda']);
    expect(doCanal.map(({ titulo }) => titulo)).toEqual([
      'Ana Souza em Avisos da TI',
      'Ana Souza em Avisos da TI',
    ]);
    expect(
      notificacoesDaMensagemDoChat(FINANCEIRO, DE_ANA, contas).map(({ titulo }) => titulo),
    ).toEqual(['Ana Souza em Equipe Financeiro', 'Ana Souza em Equipe Financeiro']);
  });

  it('Equipe sem aviso: ninguém recebe notificação', () => {
    const contas = [conta('conta-bruno'), conta('conta-fernanda')];
    expect(notificacoesDaMensagemDoChat({ ...FINANCEIRO, avisar: false }, DE_ANA, contas)).toEqual(
      [],
    );
    expect(
      notificacoesDaMensagemDoChat({ ...AVISOS_DA_TI, avisar: false }, DE_ANA, contas),
    ).toEqual([]);
  });

  it('quem escreveu não é notificado da própria mensagem', () => {
    expect(notificacoesDaMensagemDoChat(DIRETA, DE_PAULO, [conta('conta-paulo')])).toEqual([]);
    expect(
      quemRecebe(notificacoesDaMensagemDoChat(AVISOS_DA_TI, DE_ANA, [conta('conta-ana')])),
    ).toEqual([]);
  });

  it('quem silenciou a conversa não é notificado', () => {
    expect(
      notificacoesDaMensagemDoChat(DIRETA, DE_PAULO, [
        conta('conta-fernanda', { silenciada: true }),
      ]),
    ).toEqual([]);
    expect(
      quemRecebe(
        notificacoesDaMensagemDoChat(AVISOS_DA_TI, DE_ANA, [
          conta('conta-bruno', { silenciada: true }),
          conta('conta-fernanda'),
        ]),
      ),
    ).toEqual(['conta-fernanda']);
  });

  it('a conta que já leu a mensagem não é notificada; a que leu só até antes dela, ou nunca leu, é', () => {
    const novas = notificacoesDaMensagemDoChat(AVISOS_DA_TI, DE_ANA, [
      conta('conta-bruno', { lidaAte: MENSAGEM }),
      conta('conta-carla', { lidaAte: DEPOIS }),
      conta('conta-diego', { lidaAte: ANTES }),
      conta('conta-fabio'),
    ]);
    expect(quemRecebe(novas)).toEqual(['conta-diego', 'conta-fabio']);
  });

  it('a leitura compara os ids sem as maiúsculas', () => {
    expect(
      notificacoesDaMensagemDoChat(DIRETA, DE_PAULO, [
        conta('conta-fernanda', { lidaAte: MENSAGEM.toUpperCase() }),
      ]),
    ).toEqual([]);
    expect(
      notificacoesDaMensagemDoChat(DIRETA, { ...DE_PAULO, id: MENSAGEM.toUpperCase() }, [
        conta('conta-fernanda', { lidaAte: MENSAGEM }),
      ]),
    ).toEqual([]);
  });

  it('o começo do texto tem até 120 caracteres, numa linha, cortado no fim de uma palavra', () => {
    const texto = `Bom dia!\n\n${'palavra '.repeat(30)}`;
    const [nova] = notificacoesDaMensagemDoChat(DIRETA, { ...DE_PAULO, texto }, [
      conta('conta-fernanda'),
    ]);
    expect(nova?.descricao).toBe(`Bom dia! ${'palavra '.repeat(13).trimEnd()}…`);
    expect([...(nova?.descricao ?? '')].length).toBeLessThanOrEqual(120);
  });
});
