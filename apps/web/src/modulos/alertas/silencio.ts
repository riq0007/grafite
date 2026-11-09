// O momento em que o silêncio dos alertas de um ativo termina (spec alertas, "Silenciar os alertas de
// um ativo"): o dia e a hora escolhidos, no fuso da interface.

const HORA = /^(\d{1,2}):(\d{2})$/;

/**
 * O dia (`aaaa-mm-dd`) e a hora (`HH:MM`) como um momento, pelo início do dia no fuso em vigor; a
 * hora que não existe, ou o dia que falta, não dão momento nenhum.
 */
export function momentoDoSilencio(
  dia: string | null,
  hora: string,
  inicioDoDia: (dia: string) => Date,
): Date | null {
  const lida = HORA.exec(hora.trim());
  if (!dia || !lida) return null;
  const horas = Number(lida[1]);
  const minutos = Number(lida[2]);
  if (horas > 23 || minutos > 59) return null;
  return new Date(inicioDoDia(dia).getTime() + (horas * 60 + minutos) * 60_000);
}
