// O fechamento do chamado (spec chamados, "Fechamento do chamado" e "Situação e quem atende"; change
// chat-com-chamados, design, decisão 7): o resolvido fecha sozinho no fim do sétimo dia depois do
// dia da resolução, no fuso do horário da TI de agora, e nada muda mais nele. O momento sai do
// `resolvido_em`, sem coluna própria, e os resolvidos de antes desta versão fecham pela data deles.
import { comecoDoDiaDoCalendario, relogioDoFuso } from '../fuso.ts';
import type { SituacaoDoChamado } from './acoes.ts';

/** Os dias depois do dia da resolução em que o chamado ainda se reabre. */
export const DIAS_PARA_REABRIR = 7;

/** Um dia do calendário, que a tela escreve como "18/11". */
export interface DiaDoCalendario {
  ano: number;
  mes: number;
  dia: number;
}

/**
 * O último dia em que o chamado se reabre: o sétimo depois do dia da resolução, no relógio do fuso,
 * como o "Reabrir até 18/11" e o "O chamado fechou em 18/11".
 */
export function ultimoDiaParaReabrir(resolvidoEm: Date, fuso: string): DiaDoCalendario {
  const { ano, mes, dia } = relogioDoFuso(resolvidoEm, fuso);
  const ultimo = new Date(Date.UTC(ano, mes - 1, dia + DIAS_PARA_REABRIR));
  return { ano: ultimo.getUTCFullYear(), mes: ultimo.getUTCMonth() + 1, dia: ultimo.getUTCDate() };
}

/**
 * O momento do fechamento: a meia-noite que começa o oitavo dia depois do dia da resolução, no
 * fuso, ou a hora que o verão deixa no lugar dela.
 */
export function momentoDoFechamento(resolvidoEm: Date, fuso: string): Date {
  const { ano, mes, dia } = relogioDoFuso(resolvidoEm, fuso);
  return comecoDoDiaDoCalendario(ano, mes, dia + DIAS_PARA_REABRIR + 1, fuso);
}

/**
 * O limite da tarefa do fechamento: vencido é o resolvido antes do começo do dia de 7 dias atrás,
 * no fuso, o mesmo que o `momentoDoFechamento` já passado.
 */
export function limiteDoFechamento(agora: Date, fuso: string): Date {
  const { ano, mes, dia } = relogioDoFuso(agora, fuso);
  return comecoDoDiaDoCalendario(ano, mes, dia - DIAS_PARA_REABRIR, fuso);
}

/** O chamado, no que o fechamento lê. */
export interface ChamadoParaOFechamento {
  situacao: SituacaoDoChamado;
  resolvidoEm: Date | null;
  fechadoEm: Date | null;
}

/**
 * O chamado fechado: o que a tarefa fechou (`fechado_em`) e o resolvido vencido que ela ainda não
 * fechou. As ações o usam, e nenhuma reabre um chamado depois da meia-noite.
 */
export function estaFechado(chamado: ChamadoParaOFechamento, agora: Date, fuso: string): boolean {
  if (chamado.fechadoEm !== null) return true;
  if (chamado.situacao !== 'resolvido' || chamado.resolvidoEm === null) return false;
  return agora.getTime() >= momentoDoFechamento(chamado.resolvidoEm, fuso).getTime();
}

/** A situação do chamado com o Fechado, que não é uma situação no banco. */
export type SituacaoComOFechado = SituacaoDoChamado | 'fechado';

/** A situação do chamado, com o Fechado lido pelo `fechado_em`. */
export function situacaoDoChamado(
  chamado: Pick<ChamadoParaOFechamento, 'situacao' | 'fechadoEm'>,
): SituacaoComOFechado {
  return chamado.situacao === 'resolvido' && chamado.fechadoEm !== null
    ? 'fechado'
    : chamado.situacao;
}
