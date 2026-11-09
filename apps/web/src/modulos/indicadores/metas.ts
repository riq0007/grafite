// A meta no formulário (spec indicadores, "Metas da organização"; change p3d-indicadores, design,
// decisão 2; spec indicadores-da-operacao, "Metas dos indicadores da operação"; change
// p4f-indicadores-da-operacao, design, decisão 10): a pessoa escreve o número, com a vírgula, e
// escolhe a unidade dos tempos; a tela o converte para a unidade do indicador (minutos, décimos de
// ponto percentual, vezes ou OS) e confere pelo domínio, com a mesma mensagem da API, antes de
// mandar.
import {
  type ConferenciaDaMeta,
  conferirMeta,
  DEFINICOES_DOS_INDICADORES,
  type Indicador,
} from '@grafite/domain';

export type UnidadeDoTempo = 'minutos' | 'horas' | 'dias';

/** Os indicadores medidos em tempo, cuja meta a pessoa escreve com a unidade. */
export type IndicadorDeTempo = 'toner' | 'critico' | 'resolucao-das-os';

const MINUTOS_DA_UNIDADE: Record<UnidadeDoTempo, number> = { minutos: 1, horas: 60, dias: 1440 };

interface OpcaoDeUnidade {
  id: UnidadeDoTempo;
  rotulo: string;
}

const HORAS: OpcaoDeUnidade = { id: 'horas', rotulo: 'Horas' };
const DIAS: OpcaoDeUnidade = { id: 'dias', rotulo: 'Dias' };

/** As unidades que cada indicador de tempo oferece, da menor para a maior. */
export const UNIDADES_DOS_TEMPOS: Record<
  IndicadorDeTempo,
  readonly [OpcaoDeUnidade, OpcaoDeUnidade]
> = {
  toner: [HORAS, DIAS],
  critico: [{ id: 'minutos', rotulo: 'Minutos' }, HORAS],
  'resolucao-das-os': [HORAS, DIAS],
};

export interface RascunhoDaMeta {
  /** Como a pessoa escreve, com a vírgula: "1,5". */
  numero: string;
  /** A unidade dos tempos; nula nos outros indicadores. */
  unidade: UnidadeDoTempo | null;
}

const UMA_CASA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, useGrouping: false });

export const ehTempo = (indicador: Indicador): indicador is IndicadorDeTempo =>
  DEFINICOES_DOS_INDICADORES[indicador].unidade === 'minutos';

/** Os indicadores em décimos de ponto percentual, que a pessoa escreve em porcentagem. */
const ehPorcentagem = (indicador: Indicador) =>
  DEFINICOES_DOS_INDICADORES[indicador].unidade === 'por-mil';

/** O rascunho da meta atual: os tempos na maior unidade que a escreve sem fração. */
export function rascunhoDaMeta(indicador: Indicador, meta: number): RascunhoDaMeta {
  if (ehTempo(indicador)) {
    const [menor, maior] = UNIDADES_DOS_TEMPOS[indicador];
    const unidade = meta % MINUTOS_DA_UNIDADE[maior.id] === 0 ? maior.id : menor.id;
    return { numero: UMA_CASA.format(meta / MINUTOS_DA_UNIDADE[unidade]), unidade };
  }
  const numero = ehPorcentagem(indicador) ? meta / 10 : meta;
  return { numero: UMA_CASA.format(numero), unidade: null };
}

/** O número escrito com a vírgula, ou `NaN`. */
function lerNumero(texto: string): number {
  const limpo = texto.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(limpo) ? Number(limpo) : Number.NaN;
}

/**
 * A meta na unidade do indicador, conferida pelo domínio. A fração que a unidade não guarda, como
 * 2,5 vezes ou 99,55%, fica como está, e o domínio a recusa.
 */
export function conferirRascunhoDaMeta(
  indicador: Indicador,
  { numero, unidade }: RascunhoDaMeta,
): ConferenciaDaMeta {
  const lido = lerNumero(numero);
  const naUnidade = ehTempo(indicador)
    ? Math.round(lido * MINUTOS_DA_UNIDADE[unidade ?? 'minutos'])
    : ehPorcentagem(indicador)
      ? Number((lido * 10).toFixed(6))
      : lido;
  return conferirMeta(indicador, naUnidade);
}
