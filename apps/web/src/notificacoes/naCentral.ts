// A notificação do servidor como a central de notificações do kit a mostra: na gaveta da casca e nos
// Avisos do app do chat (change chat-com-chamados, tarefa 4.7).
import type { NotificacaoDaCentral } from '@grafite/ui';
import { type Notificacao, ROTULO_DO_ADIAR, temAcoesDoAlerta } from './useNotificacoes.tsx';

/** Como está o alerta da notificação, em texto, depois de tratado ou resolvido. */
function situacaoDoAlerta(
  alerta: Notificacao['alerta'],
  formatarHora: (momento: Date) => string,
): string | undefined {
  if (!alerta) return undefined;
  if (alerta.situacao === 'resolvido') return 'Resolvido';
  if (alerta.reconhecido) return `Reconhecido por ${alerta.reconhecido.nome}`;
  if (alerta.adiado) return `Adiado até ${formatarHora(new Date(alerta.adiado.ate))}`;
  return undefined;
}

/** Uma notificação do servidor como a central a mostra, com as ações do alerta que pede ação. */
export const paraACentral = (
  notificacao: Notificacao,
  formatarHora: (momento: Date) => string,
): NotificacaoDaCentral => ({
  id: notificacao.id,
  severidade: notificacao.severidade,
  titulo: notificacao.titulo,
  descricao: notificacao.descricao,
  origem: notificacao.origem,
  momento: notificacao.momento,
  lida: notificacao.lida,
  temDestino: notificacao.destino !== undefined,
  podeReconhecer: temAcoesDoAlerta(notificacao),
  podeAdiar: temAcoesDoAlerta(notificacao),
  rotuloDoAdiar: ROTULO_DO_ADIAR,
  situacaoDoAlerta: situacaoDoAlerta(notificacao.alerta, formatarHora),
});
