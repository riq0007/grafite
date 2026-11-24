// Quem atende o chamado pelo chat e as ações do menu "Andamento" (spec chamados, "Quem atende pelo
// chat"; spec modulo-chat, "Andamento do chamado no chat"; change andamento-e-varias-mensagens,
// decisões 1 e 2). As ações vão pelas rotas da TI, com as mesmas regras e as mesmas recusas
// (`decidirAcao`): o menu só mostra as que o chamado aceita agora.
import { type ChamadoParaAcao, MATRIZ_DAS_ACOES } from '../chamados/acoes.ts';
import {
  type AlcanceDeQuemAtende,
  atendeOChamado,
  type LocaisDoChamado,
} from '../chamados/atendimento.ts';
import {
  type ChamadoParaParticipar,
  type ContaNoChat,
  participaDoChamado,
} from './participacao.ts';

/** A conta, com o alcance de `chamados.atender` dela. */
export interface ContaQueAtendePeloChat extends Pick<ContaNoChat, 'id' | 'pessoaId' | 'usaOChat'> {
  alcance: AlcanceDeQuemAtende;
}

/** O chamado, para saber quem participa dele e quem atende os locais dele. */
export type ChamadoParaAtenderPeloChat = ChamadoParaParticipar & LocaisDoChamado;

/**
 * Atende pelo chat quem participa do chamado (a pessoa dele ou quem o abriu pelo chat, quando usam o
 * chat) e atende todos os locais dele. Quem atende sem participar segue pelo módulo Chamados.
 */
export function atendePeloChat(
  conta: ContaQueAtendePeloChat,
  chamado: ChamadoParaAtenderPeloChat,
): boolean {
  return participaDoChamado(conta, chamado) && atendeOChamado(conta.alcance, chamado);
}

/**
 * Participa pela TI quem atende pelo chat sem ser a pessoa do chamado: quem o abriu pelo chat no
 * nome de outra pessoa. Ela fala e lê o chamado como a TI. A pessoa do chamado que atende, como quem
 * é da TI e pede um chamado para si, participa como quem pediu. O lado vale na hora: quem deixa de
 * atender os locais volta a participar como quem pediu.
 */
export function participaPelaTi(
  conta: ContaQueAtendePeloChat,
  chamado: ChamadoParaAtenderPeloChat,
): boolean {
  return conta.pessoaId !== chamado.pessoaId && atendePeloChat(conta, chamado);
}

/**
 * A espera do chamado é da conta: ela participa dele, e não pela TI. É o `esperaAConta` do
 * `situacaoNoChat`, no chip, no resumo do chat e em "Chamados da equipe".
 */
export function esperaAConta(
  conta: ContaQueAtendePeloChat,
  chamado: ChamadoParaAtenderPeloChat,
): boolean {
  return participaDoChamado(conta, chamado) && !participaPelaTi(conta, chamado);
}

/** As ações do menu "Andamento", na ordem do menu, que é a das ações na spec. */
export const ACOES_DO_ANDAMENTO = [
  'assumir',
  'passar',
  'devolver',
  'esperar',
  'retomar',
  'resolver',
  'reabrir',
] as const;
export type AcaoDoAndamento = (typeof ACOES_DO_ANDAMENTO)[number];

/**
 * As ações que o chamado aceita agora, no menu "Andamento" de quem atende pelo chat: as da célula
 * aceita na matriz, com três regras a mais:
 * - o assumir, fora do chamado que já está com a conta;
 * - o aguardar, só na triagem e em atendimento: no aguardando, a matriz aceita o "Enviar e esperar"
 *   como a mensagem, e no menu ele não muda nada;
 * - o aguardar e o reabrir, só a quem participa pela TI: a pessoa do chamado não espera por si
 *   mesma, e ela reabre como quem pediu, pelo "Reabrir até".
 *
 * O fechado não tem nenhuma: nada muda mais nele.
 */
export function acoesDoAndamento(
  chamado: Pick<ChamadoParaAcao, 'situacao' | 'responsavel' | 'fechado'>,
  conta: { id: string; pelaTi: boolean },
): AcaoDoAndamento[] {
  if (chamado.fechado) return [];
  return ACOES_DO_ANDAMENTO.filter((acao) => {
    if ('recusa' in MATRIZ_DAS_ACOES[acao][chamado.situacao]) return false;
    switch (acao) {
      case 'assumir':
        return chamado.responsavel !== conta.id;
      case 'esperar':
        return conta.pelaTi && chamado.situacao !== 'aguardando';
      case 'reabrir':
        return conta.pelaTi;
      default:
        return true;
    }
  });
}
