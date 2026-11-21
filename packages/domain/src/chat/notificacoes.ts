// As notificações do chat (spec chat, "Notificações do chat"; change chat-com-chamados, design,
// decisão 6): a mensagem direta, à outra conta, e a da equipe ou do canal com "Avisar a cada
// mensagem", a cada conta que participa, como mensagem, na severidade Informação, com a origem
// "Chat" e o endereço da mensagem. A API as grava pela fila, 10 s depois da mensagem, com as contas
// que participam da conversa, o silenciar e a leitura de cada uma.
import type { NovaNotificacao } from '../notificacoes/notificacoes.ts';
import { comecoDoTexto } from './mensagens.ts';

/** O módulo que notifica as mensagens do chat, como a central o mostra. */
export const ORIGEM_DO_CHAT = 'Chat';

/** O assunto da conversa, que a leitura dela marca como lido, com o id como o banco o devolve. */
export const assuntoDaConversa = (conversaId: string) => `conversa:${conversaId.toLowerCase()}`;

/** O endereço da mensagem no app do chat, que abre a conversa nela. */
export const destinoDaMensagem = (conversaId: string, mensagemId: string) =>
  `/chat/c/${conversaId}?m=${mensagemId}`;

/** A conversa, como as notificações a leem: a direta, ou a equipe e o canal, com o aviso deles. */
export type ConversaQueNotifica =
  | { id: string; tipo: 'direta' }
  | {
      id: string;
      tipo: 'equipe' | 'canal';
      nome: string;
      /** "Avisar a cada mensagem". */
      avisar: boolean;
    };

/** A mensagem que chegou, com quem a escreveu. */
export interface MensagemQueNotifica {
  /** O `uuidv7()` da mensagem, que segue a ordem das gravações na conversa. */
  id: string;
  texto: string;
  autor: { contaId: string; nome: string };
}

/** A conta que participa da conversa, com o silenciar e a leitura dela. */
export interface ContaQueRecebeAMensagem {
  id: string;
  silenciada: boolean;
  /** A última mensagem que a conta leu na conversa, pelo id, ou nulo, sem nenhuma leitura. */
  lidaAte: string | null;
}

/**
 * As notificações da mensagem do chat: "Mensagem de Paulo Nunes", na direta, e "Ana Souza em Avisos
 * da TI", na equipe ou no canal com "Avisar a cada mensagem", com o começo do texto, a cada conta
 * que participa, fora quem escreveu, quem silenciou a conversa e quem já leu a mensagem, pelo id.
 * Sem o aviso, a equipe e o canal não notificam: a não lida fica no contador.
 */
export function notificacoesDaMensagemDoChat(
  conversa: ConversaQueNotifica,
  mensagem: MensagemQueNotifica,
  contas: readonly ContaQueRecebeAMensagem[],
): NovaNotificacao[] {
  if (conversa.tipo !== 'direta' && !conversa.avisar) return [];
  const titulo =
    conversa.tipo === 'direta'
      ? `Mensagem de ${mensagem.autor.nome}`
      : `${mensagem.autor.nome} em ${conversa.nome}`;
  const id = mensagem.id.toLowerCase();
  return contas
    .filter(
      (conta) =>
        conta.id !== mensagem.autor.contaId &&
        !conta.silenciada &&
        (conta.lidaAte === null || conta.lidaAte.toLowerCase() < id),
    )
    .map((conta) => ({
      contaId: conta.id,
      severidade: 'info',
      titulo,
      descricao: comecoDoTexto(mensagem.texto),
      origem: ORIGEM_DO_CHAT,
      destino: destinoDaMensagem(conversa.id, mensagem.id),
      alertaId: null,
      mensagem: true,
      assunto: assuntoDaConversa(conversa.id),
      mensagemDoChatId: mensagem.id,
    }));
}
