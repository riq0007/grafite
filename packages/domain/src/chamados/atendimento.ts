// O atendimento na abertura do chamado (spec chamados, "Abrir um chamado pela TI" e "Situação e
// quem atende"; change chamados-da-ti, design, decisão 7): com quem o chamado nasce, ou se nasce Na
// triagem. A abertura recusa antes quem abre com o "Fica comigo" sem atender os locais do chamado.
import { atendeASolicitacao } from '../solicitacoes/solicitacoes.ts';
import { type HorarioDaTi, noHorarioDaTi } from './prazo.ts';

/** O "Se não houver ninguém" do tipo: "Cai na triagem" ou "Fica com <pessoa> mesmo assim". */
export const SEM_NINGUEM = ['triagem', 'fica'] as const;
export type SemNinguem = (typeof SEM_NINGUEM)[number];

/** O alcance de `chamados.atender` de uma conta: a organização, os locais, ou nada. */
export type AlcanceDeQuemAtende = 'organizacao' | ReadonlySet<string> | null;

/** Os locais do chamado: os dos ativos ligados ou o da pessoa, e se algum deles não tem local. */
export interface LocaisDoChamado {
  locais: readonly string[];
  semLocal: boolean;
}

/**
 * Atende o chamado quem tem `chamados.atender` em todos os locais dele; o chamado sem local, só
 * quem atende a organização inteira. É a mesma regra das solicitações (decisão 5).
 */
export function atendeOChamado(alcance: AlcanceDeQuemAtende, chamado: LocaisDoChamado): boolean {
  return atendeASolicitacao(alcance, chamado);
}

/** Quem atende o tipo por padrão, como está agora: se a conta está ativa e o alcance dela. */
export interface ContaQueAtendePorPadrao {
  id: string;
  ativa: boolean;
  alcance: AlcanceDeQuemAtende;
}

export interface PedidoDeAtendimento {
  /** A conta de quem abre com o "Fica comigo" ligado, ou nulo, com ele desligado. */
  ficaComigo: string | null;
  /** Quem atende o tipo por padrão, ou nulo, no tipo sem ninguém. */
  padrao: ContaQueAtendePorPadrao | null;
  semNinguem: SemNinguem;
  locais: LocaisDoChamado;
  horario: HorarioDaTi;
  /** O momento da abertura. */
  agora: Date;
}

export type Atendimento =
  | { situacao: 'em-atendimento'; atende: string }
  | { situacao: 'triagem'; atende: null };

const NA_TRIAGEM: Atendimento = { situacao: 'triagem', atende: null };

/**
 * Com o "Fica comigo", o chamado nasce com quem abre. Sem ele, com quem atende o tipo por padrão,
 * se a conta está ativa e atende os locais do chamado; fora do horário da TI, só com o "Fica com
 * <pessoa> mesmo assim". Em todo outro caso, nasce Na triagem.
 */
export function decidirAtendimento(pedido: PedidoDeAtendimento): Atendimento {
  if (pedido.ficaComigo !== null) return { situacao: 'em-atendimento', atende: pedido.ficaComigo };
  const { padrao } = pedido;
  if (padrao === null || !padrao.ativa || !atendeOChamado(padrao.alcance, pedido.locais)) {
    return NA_TRIAGEM;
  }
  if (pedido.semNinguem === 'triagem' && !noHorarioDaTi(pedido.agora, pedido.horario)) {
    return NA_TRIAGEM;
  }
  return { situacao: 'em-atendimento', atende: padrao.id };
}
