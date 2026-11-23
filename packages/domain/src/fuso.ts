// O relógio de um fuso horário, pelo `Intl.DateTimeFormat` com o `timeZone`, com o horário de verão
// dele: o dia e a hora locais de um momento e o momento de um dia e uma hora locais. Servem ao
// quando da distribuição (software/quando.ts) e ao relógio dos chamados (chamados/prazo.ts).

const formatos = new Map<string, Intl.DateTimeFormat>();

/**
 * O formato que lê o relógio do fuso; `null` no fuso que o Intl não conhece. Ele fica guardado pelo
 * nome que o Intl devolve (`resolvedOptions().timeZone`), e não pelo texto pedido: o Intl aceita o
 * mesmo fuso em qualquer caixa ("america/sao_paulo"), e o fuso pode vir da consulta. Guardado pelo
 * texto, cada jeito novo de escrevê-lo ficaria na memória; pelo nome, fica no máximo um formato por
 * nome que o Intl conhece. O pedido escrito de outro jeito monta o formato de novo, e ele toma o
 * lugar do guardado com o mesmo nome.
 */
function formatoDo(fuso: string): Intl.DateTimeFormat | null {
  const guardado = formatos.get(fuso);
  if (guardado) return guardado;
  let formato: Intl.DateTimeFormat;
  try {
    formato = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return null;
  }
  formatos.set(formato.resolvedOptions().timeZone, formato);
  return formato;
}

/**
 * O nome que o Intl dá ao fuso, na caixa certa, como "America/Sao_Paulo" para "america/sao_paulo";
 * `null` no fuso que ele não conhece. A rota que recebe o fuso da consulta e lê o relógio dele num
 * laço o troca pelo nome uma vez: pelo nome, o relógio acha o formato guardado, sem montar outro a
 * cada leitura.
 */
export function nomeDoFuso(fuso: string): string | null {
  return formatoDo(fuso)?.resolvedOptions().timeZone ?? null;
}

/** Se o fuso existe no Intl do servidor (e do navegador). */
export function fusoValido(fuso: string | null | undefined): fuso is string {
  return !!fuso && formatoDo(fuso) !== null;
}

/** O dia e a hora no relógio de um fuso. */
export interface RelogioDoFuso {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

/** O relógio do fuso no momento; o fuso desconhecido lê o de UTC. */
export function relogioDoFuso(momento: Date, fuso: string): RelogioDoFuso {
  const formato = formatoDo(fuso) ?? (formatoDo('UTC') as Intl.DateTimeFormat);
  const partes = Object.fromEntries(
    formato.formatToParts(momento).map(({ type, value }) => [type, Number(value)]),
  );
  return {
    ano: partes.year ?? 0,
    mes: partes.month ?? 0,
    dia: partes.day ?? 0,
    hora: partes.hour ?? 0,
    minuto: partes.minute ?? 0,
    segundo: partes.second ?? 0,
  };
}

/** Quanto o relógio do fuso está à frente de UTC no momento, em milissegundos. */
function deslocamento(momento: Date, fuso: string): number {
  const { ano, mes, dia, hora, minuto, segundo } = relogioDoFuso(momento, fuso);
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  return comoUtc - Math.floor(momento.getTime() / 1000) * 1000;
}

/** O instante de um dia e uma hora do relógio do fuso; a hora que o verão pula cai depois dele. */
export function instanteDoRelogio(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
  fuso: string,
): Date {
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto);
  const primeiro = comoUtc - deslocamento(new Date(comoUtc), fuso);
  return new Date(comoUtc - deslocamento(new Date(primeiro), fuso));
}

/** O instante do dia ("2026-11-15") e da hora ("22:00") no relógio do fuso. */
export function instanteNoFuso(data: string, hora: string, fuso: string): Date {
  const [ano = 0, mes = 0, dia = 0] = data.split('-').map(Number);
  const [horas = 0, minutos = 0] = hora.split(':').map(Number);
  return instanteDoRelogio(ano, mes, dia, horas, minutos, fuso);
}

const MS_POR_HORA = 3_600_000;

/**
 * O começo de um dia do calendário no relógio do fuso: a meia-noite ou, quando o verão a pula, a
 * hora que ele deixa no lugar dela, como a 01:00 de 06/09/2026 em America/Santiago. O dia passa do
 * fim do mês e do ano, como no `Date.UTC`.
 */
export function comecoDoDiaDoCalendario(ano: number, mes: number, dia: number, fuso: string): Date {
  const meiaNoite = Date.UTC(ano, mes - 1, dia);
  const doDia = new Date(meiaNoite);
  const ehDoDia = (instante: Date) => {
    const relogio = relogioDoFuso(instante, fuso);
    return (
      relogio.ano === doDia.getUTCFullYear() &&
      relogio.mes === doDia.getUTCMonth() + 1 &&
      relogio.dia === doDia.getUTCDate()
    );
  };
  // A meia-noite com o deslocamento de 12 h antes e com o de 12 h depois. Com a troca do verão perto
  // dela, o de antes leva a meia-noite pulada à hora que o verão deixa, e o de depois cai na véspera;
  // vale o primeiro instante que já é do dia.
  const candidatos = [meiaNoite - 12 * MS_POR_HORA, meiaNoite + 12 * MS_POR_HORA]
    .map((perto) => new Date(meiaNoite - deslocamento(new Date(perto), fuso)))
    .filter(ehDoDia);
  if (candidatos.length === 0) return instanteDoRelogio(ano, mes, dia, 0, 0, fuso);
  return new Date(Math.min(...candidatos.map((instante) => instante.getTime())));
}

/**
 * O começo do dia do momento no relógio do fuso: a meia-noite, ou a hora que o verão deixa no lugar
 * dela. Os resolvidos hoje do quadro dos chamados contam a partir dele.
 */
export function comecoDoDia(momento: Date, fuso: string): Date {
  const { ano, mes, dia } = relogioDoFuso(momento, fuso);
  return comecoDoDiaDoCalendario(ano, mes, dia, fuso);
}

/**
 * O começo do ano do momento no relógio do fuso: a meia-noite do 1º de janeiro. As OS concluídas no
 * ano do resumo do ativo no chamado contam a partir dele, no fuso do horário da TI.
 */
export function comecoDoAno(momento: Date, fuso: string): Date {
  return comecoDoDiaDoCalendario(relogioDoFuso(momento, fuso).ano, 1, 1, fuso);
}
