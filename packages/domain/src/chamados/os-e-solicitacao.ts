// A OS e a solicitação pelo chamado (spec chamados, "OS e solicitação pelo chamado";
// ordens-de-servico, "OS pelo chamado"; change chamados-da-ti, design, "Virar OS (tarefa 4.16)"): as
// recusas do chamado, que vêm antes das da abertura da OS, que a rota chama depois delas.
import type { QuemAge } from './acoes.ts';
import { mensagemDaRecusaDaAcao } from './acoes.ts';
import { type ChamadoParaEdicao, type RecusaDaEdicao, recusaDaEdicao } from './edicao.ts';

/** O chamado como o "Virar OS" o lê: a OS que ele já tem, o tipo como está agora e o ativo ligado. */
export interface ChamadoParaVirarOs extends ChamadoParaEdicao {
  /** O número da OS que o chamado já tem, ou nulo. */
  os: number | null;
  tipo: { nome: string; podeVirarOs: boolean };
  /** O id do ativo ligado, ou nulo. */
  ativo: string | null;
}

/** Por que o chamado não vira OS; `mensagemDaRecusaDoVirarOs` escreve a frase. */
export type RecusaDoVirarOs =
  | RecusaDaEdicao
  | { motivo: 'ja-tem-os'; os: number }
  | { motivo: 'tipo-nao-vira-os'; tipo: string }
  | { motivo: 'sem-ativo' };

/**
 * As recusas do chamado, nesta ordem: quem age precisa atender os locais dele; o resolvido; a OS
 * que ele já tem; o tipo que não vira OS; e o chamado sem o ativo ligado. O estado do chamado vem
 * primeiro, depois o ajuste do tipo, e por fim o ativo, que quem atende ainda pode ligar.
 */
export function recusaDoVirarOs(
  chamado: ChamadoParaVirarOs,
  quemAge: QuemAge,
): RecusaDoVirarOs | null {
  const daEdicao = recusaDaEdicao(chamado, quemAge);
  if (daEdicao) return daEdicao;
  if (chamado.os !== null) return { motivo: 'ja-tem-os', os: chamado.os };
  if (!chamado.tipo.podeVirarOs) return { motivo: 'tipo-nao-vira-os', tipo: chamado.tipo.nome };
  if (chamado.ativo === null) return { motivo: 'sem-ativo' };
  return null;
}

/** A frase da recusa, com a das ações para quem não atende e o resolvido. */
export function mensagemDaRecusaDoVirarOs(numero: number, recusa: RecusaDoVirarOs): string {
  switch (recusa.motivo) {
    case 'ja-tem-os':
      return `O chamado #${numero} já tem a OS ${recusa.os}.`;
    case 'tipo-nao-vira-os':
      return `O tipo ${recusa.tipo} não vira OS.`;
    case 'sem-ativo':
      return `O chamado #${numero} não tem um ativo ligado.`;
    default:
      return mensagemDaRecusaDaAcao(numero, recusa);
  }
}
