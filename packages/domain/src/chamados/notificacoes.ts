// As notificações dos chamados (spec chamados, "Notificações dos chamados"; change chamados-da-ti,
// design, decisão 12): o chamado passado a uma conta e o que cai na triagem, na severidade
// Informação, com a origem "Chamados" e o endereço do chamado. Quem abre ou assume não é avisado do
// próprio ato.
import type { NovaNotificacao } from '../notificacoes/notificacoes.ts';
import type { SituacaoDoChamado } from './acoes.ts';
import { type AlcanceDeQuemAtende, atendeOChamado, type LocaisDoChamado } from './atendimento.ts';

/** O módulo que notifica os chamados, como a central o mostra. */
export const ORIGEM_DOS_CHAMADOS = 'Chamados';

/** O endereço do chamado na web, para o "Abrir" da notificação. */
export const destinoDoChamado = (numero: number) => `/chamados/${numero}`;

/** O chamado como as notificações o leem. */
export interface ChamadoQueNotifica {
  numero: number;
  titulo: string;
  situacao: SituacaoDoChamado;
  responsavelId: string | null;
  locais: LocaisDoChamado;
}

/** A conta e o alcance de `chamados.atender` dela, para a triagem. */
export interface ContaQueRecebeATriagem {
  id: string;
  alcance: AlcanceDeQuemAtende;
}

const notificacao = (numero: number, contaId: string, titulo: string): NovaNotificacao => ({
  contaId,
  severidade: 'info',
  titulo,
  descricao: null,
  origem: ORIGEM_DOS_CHAMADOS,
  destino: destinoDoChamado(numero),
  alertaId: null,
});

/** "Chamado #1043 com você: Impressora manchando", para quem recebe o chamado. */
export function notificacaoDoPassado(
  chamado: Pick<ChamadoQueNotifica, 'numero' | 'titulo'>,
  contaId: string,
): NovaNotificacao {
  return notificacao(
    chamado.numero,
    contaId,
    `Chamado #${chamado.numero} com você: ${chamado.titulo}`,
  );
}

/**
 * "Chamado #1043 na triagem: Impressora manchando", para cada conta que atende todos os locais do
 * chamado, fora a dada (quem abriu ou devolveu); o chamado sem local, só para quem atende a
 * organização inteira.
 */
export function notificacoesDaTriagem(
  chamado: Pick<ChamadoQueNotifica, 'numero' | 'titulo' | 'locais'>,
  contas: readonly ContaQueRecebeATriagem[],
  { fora }: { fora: string },
): NovaNotificacao[] {
  const titulo = `Chamado #${chamado.numero} na triagem: ${chamado.titulo}`;
  return contas
    .filter(({ id, alcance }) => id !== fora && atendeOChamado(alcance, chamado.locais))
    .map(({ id }) => notificacao(chamado.numero, id, titulo));
}

/**
 * As notificações da abertura: o chamado que nasce com outra conta, pelo atendimento do tipo, avisa
 * essa conta; o que nasce na triagem avisa quem atende os locais dele. Quem abriu não é avisado.
 */
export function notificacoesDaAbertura(
  chamado: ChamadoQueNotifica,
  { abertoPor, contas }: { abertoPor: string; contas: readonly ContaQueRecebeATriagem[] },
): NovaNotificacao[] {
  if (chamado.situacao === 'triagem') {
    return notificacoesDaTriagem(chamado, contas, { fora: abertoPor });
  }
  if (chamado.responsavelId === null || chamado.responsavelId === abertoPor) return [];
  return [notificacaoDoPassado(chamado, chamado.responsavelId)];
}

/**
 * A ação do atendimento, como as notificações a leem: o passar, com a conta escolhida; o devolver,
 * com as contas e o alcance de `chamados.atender` delas; o assumir, o desfazer e a conversa.
 */
export type AcaoQueNotifica =
  | { acao: 'passar'; para: string }
  | { acao: 'devolver'; contas: readonly ContaQueRecebeATriagem[] }
  | { acao: 'assumir' | 'desfazer' | 'mensagem' | 'esperar' | 'nota' };

/**
 * As notificações das ações do atendimento: o passar avisa a conta escolhida, fora quem passa a si
 * mesmo; o devolver avisa quem atende os locais, fora quem devolveu; o assumir, o desfazer, a
 * mensagem, a espera e a nota não avisam ninguém.
 */
export function notificacoesDaAcao(
  chamado: Pick<ChamadoQueNotifica, 'numero' | 'titulo' | 'locais'>,
  acao: AcaoQueNotifica,
  quemAge: string,
): NovaNotificacao[] {
  switch (acao.acao) {
    case 'passar':
      return acao.para === quemAge ? [] : [notificacaoDoPassado(chamado, acao.para)];
    case 'devolver':
      return notificacoesDaTriagem(chamado, acao.contas, { fora: quemAge });
    case 'assumir':
    case 'desfazer':
    case 'mensagem':
    case 'esperar':
    case 'nota':
      return [];
  }
}
