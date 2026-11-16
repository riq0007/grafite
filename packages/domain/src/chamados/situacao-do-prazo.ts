// A situação do prazo de um chamado (spec chamados, "Prazo do chamado"; spec modulo-chamados,
// "Prazos"; change chamados-da-ti, design, decisão 3): o contado, o que resta, o vencimento, o texto
// curto, o grupo e a primeira resposta pendente. A API ordena a lista dos prazos por ela, e a web a
// recalcula a cada minuto, do relógio guardado, sem pedir de novo ao servidor.
import { relogioDoFuso } from '../fuso.ts';
import {
  type HorarioDaTi,
  momentoEmQueAlcanca,
  type PrazoDoChamado,
  segundosNoHorario,
} from './prazo.ts';

/** Os grupos da lista dos prazos, na ordem da tela. */
export const GRUPOS_DO_PRAZO = [
  'estourado',
  'ate-2-horas',
  'hoje',
  'depois-de-hoje',
  'parado',
] as const;
export type GrupoDoPrazo = (typeof GRUPOS_DO_PRAZO)[number];

/** O relógio guardado do chamado, como a API o manda. */
export interface RelogioDoChamado {
  /** O prazo copiado do tipo na abertura. */
  prazo: PrazoDoChamado;
  /** Os segundos contados até a última parada. */
  contadoS: number;
  /** O instante em que o relógio voltou a contar, ou nulo, com o relógio parado. */
  relogioDesde: Date | null;
  primeiraRespostaEm: Date | null;
}

/** A primeira resposta que falta: o momento em que o contado alcança o prazo dela. */
export interface PrimeiraRespostaPendente {
  ate: Date;
  atrasada: boolean;
}

export interface SituacaoDoPrazo {
  /** Os segundos contados até agora. */
  contadoS: number;
  /** O prazo da resolução, em segundos do relógio. */
  prazoS: number;
  /** O que resta do prazo da resolução, em segundos do relógio; negativo, passou dele. */
  restaS: number;
  /** O momento em que o contado alcança o prazo da resolução, ou nulo, com o relógio parado. */
  vencimento: Date | null;
  grupo: GrupoDoPrazo;
  /** "vence em 2 h", "estourado há 20 min" ou "relógio parado". */
  texto: string;
  primeiraResposta: PrimeiraRespostaPendente | null;
}

const MS_POR_MINUTO = 60_000;
const MS_POR_HORA = 3_600_000;
const MS_POR_DIA = 24 * MS_POR_HORA;
/** O limite do grupo "Vence em até 2 horas". */
const PERTO = 2 * MS_POR_HORA;

/**
 * A distância, arredondada para baixo: os dias inteiros a partir de 48 h, as horas inteiras de 1 h
 * a 48 h, os minutos inteiros de 1 min a 1 h e "menos de 1 min" abaixo dele. No relógio comum, a
 * sexta à tarde chega a 63 h até a segunda, e o chamado esquecido, a centenas de horas.
 */
function distancia(ms: number): string {
  if (ms >= 2 * MS_POR_DIA) return `${Math.floor(ms / MS_POR_DIA)} dias`;
  if (ms >= MS_POR_HORA) return `${Math.floor(ms / MS_POR_HORA)} h`;
  if (ms >= MS_POR_MINUTO) return `${Math.floor(ms / MS_POR_MINUTO)} min`;
  return 'menos de 1 min';
}

/** Se os dois momentos caem no mesmo dia do calendário, no fuso de quem olha. */
function mesmoDia(a: Date, b: Date, fuso: string): boolean {
  const x = relogioDoFuso(a, fuso);
  const y = relogioDoFuso(b, fuso);
  return x.ano === y.ano && x.mes === y.mes && x.dia === y.dia;
}

/**
 * A primeira resposta que falta, com o relógio contando. Parado, ela já foi dada: esperar a
 * resposta e resolver mandam mensagem à pessoa.
 */
function primeiraRespostaPendente(
  { prazo, contadoS, relogioDesde, primeiraRespostaEm }: RelogioDoChamado,
  horario: HorarioDaTi,
  agora: Date,
): PrimeiraRespostaPendente | null {
  if (primeiraRespostaEm !== null || relogioDesde === null) return null;
  const ate = momentoEmQueAlcanca(
    relogioDesde,
    prazo.respostaMin * 60 - contadoS,
    prazo.modo,
    horario,
  );
  return { ate, atrasada: ate.getTime() <= agora.getTime() };
}

/**
 * A situação do prazo agora, com o grupo no dia do fuso de quem olha. O texto diz a distância no
 * relógio comum entre agora e o vencimento, como os grupos, e o estouro começa no vencimento. O
 * chamado que volta a contar já depois do prazo (reaberto, retomado ou com o relógio fechado pela
 * mudança do horário) vence nessa volta. Parado, o que resta negativo diz quanto passou do prazo.
 */
export function situacaoDoPrazo(
  relogio: RelogioDoChamado,
  horario: HorarioDaTi,
  agora: Date,
  fuso: string,
): SituacaoDoPrazo {
  const { prazo, relogioDesde } = relogio;
  const prazoS = prazo.resolucaoMin * 60;
  const contadoS =
    relogio.contadoS +
    (relogioDesde === null ? 0 : segundosNoHorario(relogioDesde, agora, prazo.modo, horario));
  const contagem = { contadoS, prazoS, restaS: prazoS - contadoS };
  if (relogioDesde === null) {
    return {
      ...contagem,
      vencimento: null,
      grupo: 'parado',
      texto: 'relógio parado',
      primeiraResposta: null,
    };
  }
  const vencimento = momentoEmQueAlcanca(
    relogioDesde,
    prazoS - relogio.contadoS,
    prazo.modo,
    horario,
  );
  const falta = vencimento.getTime() - agora.getTime();
  let grupo: GrupoDoPrazo = 'depois-de-hoje';
  if (falta <= 0) grupo = 'estourado';
  else if (falta <= PERTO) grupo = 'ate-2-horas';
  else if (mesmoDia(vencimento, agora, fuso)) grupo = 'hoje';
  return {
    ...contagem,
    vencimento,
    grupo,
    texto: falta <= 0 ? `estourado há ${distancia(-falta)}` : `vence em ${distancia(falta)}`,
    primeiraResposta: primeiraRespostaPendente(relogio, horario, agora),
  };
}

/**
 * A ordem da lista dos prazos e das colunas do quadro: pelo vencimento, que põe os estourados à
 * frente, e os parados por último, pelo que resta. O empate fica com quem ordena, como pelo número.
 */
export function compararPrazos(a: SituacaoDoPrazo, b: SituacaoDoPrazo): number {
  if (a.vencimento !== null && b.vencimento !== null) {
    return a.vencimento.getTime() - b.vencimento.getTime();
  }
  if (a.vencimento !== null) return -1;
  if (b.vencimento !== null) return 1;
  return a.restaS - b.restaS;
}
