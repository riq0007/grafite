// A agenda da operação (design do F2d, decisão 14): o horário do backup e o dia do teste de
// restauração, numa linha só de `operacao.agenda`, fora das organizações.
import { agendaDaOperacao, type Banco } from '@grafite/db';
import type { AgendaDaOperacao } from './tarefas.ts';

/** O padrão da migration, se a linha faltar. */
const PADRAO: AgendaDaOperacao = { horario: '02:00', diaDoTeste: 0 };

const DIA = 24 * 60 * 60 * 1000;

export async function lerAgendaDaOperacao(banco: Banco): Promise<AgendaDaOperacao> {
  const [agenda] = await banco
    .select({ horario: agendaDaOperacao.horario, diaDoTeste: agendaDaOperacao.diaDoTeste })
    .from(agendaDaOperacao)
    .limit(1);
  return agenda ?? PADRAO;
}

/** O próximo momento, depois de `depoisDe`, em que o relógio do fuso marca `horario` (`HH:MM`). */
export function proximoHorario(horario: string, fuso: string, depoisDe: Date): Date {
  const [hora = 0, minuto = 0] = horario.split(':').map(Number);
  for (let dias = 0; dias <= 2; dias += 1) {
    const { ano, mes, dia } = dataNoFuso(new Date(depoisDe.getTime() + dias * DIA), fuso);
    const momento = instanteNoFuso({ ano, mes, dia, hora, minuto }, fuso);
    if (momento.getTime() > depoisDe.getTime()) return momento;
  }
  throw new Error(`O horário ${horario} não acontece no fuso ${fuso}.`);
}

function partesNoFuso(momento: Date, fuso: string): Record<string, number> {
  const formato = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return Object.fromEntries(
    formato
      .formatToParts(momento)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  );
}

function dataNoFuso(momento: Date, fuso: string) {
  const { year = 0, month = 1, day = 1 } = partesNoFuso(momento, fuso);
  return { ano: year, mes: month, dia: day };
}

/** Quanto o relógio do fuso está à frente do UTC nesse momento, em ms. */
function deslocamento(momento: Date, fuso: string): number {
  const {
    year = 0,
    month = 1,
    day = 1,
    hour = 0,
    minute = 0,
    second = 0,
  } = partesNoFuso(momento, fuso);
  const comoUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return comoUtc - Math.floor(momento.getTime() / 1000) * 1000;
}

/** O instante em que o relógio do fuso marca a data e a hora dadas. */
function instanteNoFuso(
  {
    ano,
    mes,
    dia,
    hora,
    minuto,
  }: { ano: number; mes: number; dia: number; hora: number; minuto: number },
  fuso: string,
): Date {
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto);
  const primeiro = deslocamento(new Date(comoUtc), fuso);
  const segundo = deslocamento(new Date(comoUtc - primeiro), fuso);
  return new Date(comoUtc - segundo);
}
