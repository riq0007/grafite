// Quem usa o chat e quem participa de cada conversa (spec chat, "Quem usa o chat", "Conversas",
// "Conversa direta", "Equipes e canais" e "Mensagem"; spec chamados, "Leitura do chamado pela
// pessoa"; change chat-com-chamados, design, decisão 3). Quem participa não é gravado: a API lê a
// conversa e a conta e pergunta aqui, e as listas fazem a mesma conta na consulta.
import { type Acesso, pode } from '../acesso/acesso.ts';
import type { OrigemDoChamado } from '../chamados/acoes.ts';

/** Os tipos de conversa do chat, com os textos do banco. */
export const TIPOS_DE_CONVERSA = ['direta', 'equipe', 'canal'] as const;
export type TipoDeConversa = (typeof TIPOS_DE_CONVERSA)[number];

/** A conta na organização, para saber se ela usa o chat. */
export interface ContaQueUsaOChat {
  situacao: 'ativa' | 'inativa' | 'anonimizada';
  acesso: Acesso;
  /** O módulo Chat ligado na organização. */
  chatLigado: boolean;
}

/**
 * Usa o chat a conta ativa com `chat.usar`, com o módulo Chat ligado. Só ela participa das
 * conversas, aparece na escolha da direta e recebe as mensagens.
 */
export function usaOChat({ situacao, acesso, chatLigado }: ContaQueUsaOChat): boolean {
  return chatLigado && situacao === 'ativa' && pode(acesso, 'chat.usar');
}

/** A conta que lê e escreve no chat: a pessoa dela, se usa o chat e os grupos de que é agora. */
export interface ContaNoChat {
  id: string;
  pessoaId: string;
  usaOChat: boolean;
  /** Os grupos de que a conta é agora, sem as participações encerradas. */
  grupos: readonly string[];
}

/** Uma das duas contas da direta, com o nome, para a frase e o nome da conversa. */
export interface ContaDaDireta {
  id: string;
  nome: string;
  usaOChat: boolean;
  /** Tem `chamados.atender` em algum local: leva o "(TI)" depois do nome. */
  daTi: boolean;
}

/** O grupo da equipe ou o de quem escreve, com o nome, para a frase. */
export interface GrupoDaConversa {
  id: string;
  nome: string;
  ativo: boolean;
}

/** A conversa como quem participa e quem escreve a leem. */
export type ConversaParaParticipar =
  | { tipo: 'direta'; contas: readonly [ContaDaDireta, ContaDaDireta] }
  | {
      tipo: 'equipe';
      nome: string;
      /** O grupo cujas contas participam. */
      grupo: GrupoDaConversa;
      /** O grupo cujas contas escrevem; `null`, todos que participam. */
      escreve: GrupoDaConversa | null;
      arquivada: boolean;
    }
  | { tipo: 'canal'; nome: string; escreve: GrupoDaConversa | null; arquivada: boolean };

/** Por que quem participa só lê; `mensagemDaRecusaDaEscrita` escreve a frase. */
export type RecusaDaEscrita =
  /** A outra conta da direta não usa mais o chat. */
  | { motivo: 'nao-usa-mais'; nome: string }
  | { motivo: 'arquivada'; tipo: 'equipe' | 'canal'; nome: string }
  /** Só as contas do grupo que escreve, e que participam, escrevem. */
  | { motivo: 'so-o-grupo'; tipo: 'equipe' | 'canal'; grupo: string };

/**
 * O que a conta pode na conversa. Quem não participa não a vê, e a API responde como inexistente;
 * quem participa lê e, sem a recusa, escreve.
 */
export type Participacao =
  | { participa: false }
  | { participa: true; escreve: true }
  | { participa: true; escreve: false; recusa: RecusaDaEscrita };

const NAO_PARTICIPA: Participacao = { participa: false };
const ESCREVE: Participacao = { participa: true, escreve: true };

const soLe = (recusa: RecusaDaEscrita): Participacao => ({
  participa: true,
  escreve: false,
  recusa,
});

/** A conta é, agora, de um grupo ativo. */
const doGrupo = (conta: Pick<ContaNoChat, 'grupos'>, grupo: GrupoDaConversa) =>
  grupo.ativo && conta.grupos.includes(grupo.id);

/**
 * Quem participa e quem escreve:
 * - na direta, as duas contas; quando a outra não usa mais o chat, a conversa fica só para ler;
 * - na equipe, quem é do grupo dela agora, com o grupo ativo;
 * - no canal, todas as contas que usam o chat;
 * - a equipe e o canal arquivados ficam só para ler, a quem participaria, antes de quem escreve;
 * - com o grupo que escreve, só as contas dele, com o grupo ativo.
 */
export function participacao(
  conta: Pick<ContaNoChat, 'id' | 'usaOChat' | 'grupos'>,
  conversa: ConversaParaParticipar,
): Participacao {
  if (!conta.usaOChat) return NAO_PARTICIPA;
  if (conversa.tipo === 'direta') {
    if (!conversa.contas.some(({ id }) => id === conta.id)) return NAO_PARTICIPA;
    const outra = conversa.contas.find(({ id }) => id !== conta.id);
    return outra && !outra.usaOChat ? soLe({ motivo: 'nao-usa-mais', nome: outra.nome }) : ESCREVE;
  }
  if (conversa.tipo === 'equipe' && !doGrupo(conta, conversa.grupo)) return NAO_PARTICIPA;
  if (conversa.arquivada) {
    return soLe({ motivo: 'arquivada', tipo: conversa.tipo, nome: conversa.nome });
  }
  if (conversa.escreve && !doGrupo(conta, conversa.escreve)) {
    return soLe({ motivo: 'so-o-grupo', tipo: conversa.tipo, grupo: conversa.escreve.nome });
  }
  return ESCREVE;
}

/** A frase da recusa, no lugar do campo de escrever e na mensagem recusada. */
export function mensagemDaRecusaDaEscrita(recusa: RecusaDaEscrita): string {
  switch (recusa.motivo) {
    case 'nao-usa-mais':
      return `${recusa.nome} não usa mais o chat.`;
    case 'arquivada':
      return recusa.tipo === 'equipe'
        ? `A equipe ${recusa.nome} está arquivada.`
        : `O canal ${recusa.nome} está arquivado.`;
    case 'so-o-grupo':
      return `Só ${recusa.grupo} escreve ${recusa.tipo === 'equipe' ? 'nesta equipe' : 'neste canal'}.`;
  }
}

/**
 * A frase no lugar da caixa de escrever (spec modulo-chat, "Caixa de escrever do chat"): na equipe
 * e no canal arquivados, "Esta equipe foi arquivada." e "Este canal foi arquivado."; nas outras
 * recusas, a mesma da mensagem recusada.
 */
export function fraseNoLugarDaCaixa(recusa: RecusaDaEscrita): string {
  if (recusa.motivo === 'arquivada') {
    return recusa.tipo === 'equipe' ? 'Esta equipe foi arquivada.' : 'Este canal foi arquivado.';
  }
  return mensagemDaRecusaDaEscrita(recusa);
}

/** É da TI, no chat, quem tem `chamados.atender` em algum local ou na organização. */
export function daTi(acesso: Acesso): boolean {
  return pode(acesso, 'chamados.atender');
}

/** O nome da conta no chat, com o "(TI)" depois do nome de quem é da TI. */
export function nomeNoChat(nome: string, daTiAgora: boolean): string {
  return daTiAgora ? `${nome} (TI)` : nome;
}

/** O nome da conversa para a conta: a direta, pelo nome da outra; a equipe e o canal, o deles. */
export function nomeDaConversa(contaId: string, conversa: ConversaParaParticipar): string {
  if (conversa.tipo !== 'direta') return conversa.nome;
  const outra = conversa.contas.find(({ id }) => id !== contaId) ?? conversa.contas[0];
  return nomeNoChat(outra.nome, outra.daTi);
}

/** O chamado, para saber quem participa dele: a pessoa, a origem e quem abriu. */
export interface ChamadoParaParticipar {
  pessoaId: string;
  origem: OrigemDoChamado;
  abertoPor: string | null;
}

/**
 * Participam do chamado, além da TI, a conta da pessoa dele e, na origem `chat`, a de quem o abriu,
 * quando usam o chat. Elas leem e respondem o próprio chamado sem nenhuma permissão dos chamados;
 * quem abriu pela TI o vê pelas permissões.
 */
export function participaDoChamado(
  conta: Pick<ContaNoChat, 'id' | 'pessoaId' | 'usaOChat'>,
  chamado: ChamadoParaParticipar,
): boolean {
  if (!conta.usaOChat) return false;
  return (
    conta.pessoaId === chamado.pessoaId ||
    (chamado.origem === 'chat' && chamado.abertoPor === conta.id)
  );
}
