// A situação da disponibilidade de um ativo (spec disponibilidade-de-rede, "Situação da
// disponibilidade"): a da última leitura, com o desde e o "desatualizado" depois de 3 intervalos, ou
// "Não verificado", com o motivo. Sem o IP, o ativo não é verificado, mesmo com uma leitura de antes.
import {
  INTERVALOS_ATE_DESATUALIZAR,
  INTERVALOS_DAS_METRICAS,
  type MetricaDaColeta,
  type SituacaoDaLeitura,
} from './metricas.ts';

export const SITUACOES_DA_DISPONIBILIDADE = [
  'online',
  'offline',
  'sem-dado',
  'nao-verificado',
] as const;

export type SituacaoDaDisponibilidade = (typeof SITUACOES_DA_DISPONIBILIDADE)[number];

export const ROTULOS_DAS_SITUACOES_DA_DISPONIBILIDADE = {
  online: 'Online',
  offline: 'Offline',
  'sem-dado': 'Sem dado',
  'nao-verificado': 'Não verificado',
} as const satisfies Record<SituacaoDaDisponibilidade, string>;

/** A ordem da coluna, crescente: o que pede atenção primeiro. */
export const ORDEM_DAS_SITUACOES_DA_DISPONIBILIDADE: readonly SituacaoDaDisponibilidade[] = [
  'offline',
  'sem-dado',
  'online',
  'nao-verificado',
];

/** O estado atual da métrica da disponibilidade de um ativo. */
export interface EstadoDaDisponibilidade {
  momento: Date;
  valorTexto: string | null;
  situacao: SituacaoDaLeitura;
  desde: Date;
}

export type DisponibilidadeDoAtivo =
  | {
      situacao: Exclude<SituacaoDaDisponibilidade, 'nao-verificado'>;
      momento: Date;
      desde: Date;
      desatualizado: boolean;
    }
  | { situacao: 'nao-verificado'; motivo: string };

/** O tempo depois do qual a leitura da disponibilidade aparece como desatualizada, em ms. */
export const IDADE_DESATUALIZADA =
  INTERVALOS_DAS_METRICAS['rede.disponibilidade'] * INTERVALOS_ATE_DESATUALIZAR;

/**
 * Se a leitura é mais antiga que 3 intervalos da métrica, do ping quando nenhuma é dita, e aparece
 * como desatualizada: 6 minutos no ping e 30 no SNMP.
 */
export function desatualizada(
  momento: Date,
  agora: Date,
  metrica: MetricaDaColeta = 'rede.disponibilidade',
): boolean {
  const idade = INTERVALOS_DAS_METRICAS[metrica] * INTERVALOS_ATE_DESATUALIZAR;
  return agora.getTime() - momento.getTime() > idade;
}

/**
 * A situação da disponibilidade. Sem o relógio, como na API, ela vem sem a idade: quem mostra a
 * leitura diz se ela está desatualizada, pelo relógio da tela.
 */
export function situacaoDaDisponibilidade({
  ip,
  estado,
  alcancado,
  agora,
}: {
  /** O IP do campo que o tipo escolheu, ou `null` vazio. */
  ip: string | null;
  estado: EstadoDaDisponibilidade | null;
  /** Se algum coletor ativo alcança o IP. */
  alcancado: boolean;
  agora?: Date;
}): DisponibilidadeDoAtivo {
  if (!ip) return { situacao: 'nao-verificado', motivo: 'Sem IP' };
  if (estado) {
    const situacao =
      estado.situacao === 'sem-dado' || estado.valorTexto === null
        ? 'sem-dado'
        : estado.valorTexto === 'offline'
          ? 'offline'
          : 'online';
    return {
      situacao,
      momento: estado.momento,
      desde: estado.desde,
      desatualizado: agora ? desatualizada(estado.momento, agora) : false,
    };
  }
  return {
    situacao: 'nao-verificado',
    motivo: alcancado ? 'Aguardando a primeira leitura.' : `Nenhum coletor alcança o IP ${ip}.`,
  };
}
