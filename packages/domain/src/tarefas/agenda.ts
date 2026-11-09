// A agenda das rotinas em texto e a próxima execução (spec modulo-administracao, "Tela de tarefas
// com falha"; change regras-indicadores-e-tarefas, design, decisão 4). O Grafite agenda as rotinas
// em três padrões do cron: a cada minuto, a cada N minutos e todo dia a uma hora, no fuso da rotina.
// Outro padrão aparece como está, sem a próxima execução.

const A_CADA_MINUTO = /^\* \* \* \* \*$/;
const A_CADA_N_MINUTOS = /^\*\/(\d{1,2}) \* \* \* \*$/;
const TODO_DIA = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;

const doisDigitos = (numero: number) => String(numero).padStart(2, '0');

/** A agenda como a tela a escreve, como "Todo dia às 03:30" ou "A cada 5 minutos". */
export function agendaEmTexto(cron: string): string {
  const limpo = cron.trim();
  if (A_CADA_MINUTO.test(limpo)) return 'A cada minuto';
  const aCada = limpo.match(A_CADA_N_MINUTOS);
  if (aCada) return `A cada ${Number(aCada[1])} minutos`;
  const todoDia = limpo.match(TODO_DIA);
  if (todoDia) {
    return `Todo dia às ${doisDigitos(Number(todoDia[2]))}:${doisDigitos(Number(todoDia[1]))}`;
  }
  return `Conforme a agenda ${limpo}`;
}

/** Quantos minutos o fuso está à frente do UTC, no momento dado (negativo no Brasil). */
function deslocamentoDoFuso(fuso: string, momento: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(momento);
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value);
  const noFuso = Date.UTC(
    valor('year'),
    valor('month') - 1,
    valor('day'),
    valor('hour'),
    valor('minute'),
  );
  return Math.round((noFuso - Math.floor(momento.getTime() / 60_000) * 60_000) / 60_000);
}

/** A próxima execução depois de `agora`, ou `null` no padrão que o Grafite não usa. */
export function proximaExecucao(cron: string, fuso: string, agora: Date): Date | null {
  const limpo = cron.trim();
  const minuto = 60_000;
  const inicioDoMinuto = Math.floor(agora.getTime() / minuto) * minuto;
  if (A_CADA_MINUTO.test(limpo)) return new Date(inicioDoMinuto + minuto);
  const aCada = limpo.match(A_CADA_N_MINUTOS);
  if (aCada) {
    const passo = Number(aCada[1]) * minuto;
    return new Date(Math.floor(agora.getTime() / passo) * passo + passo);
  }
  const todoDia = limpo.match(TODO_DIA);
  if (!todoDia) return null;
  const [minutos, horas] = [Number(todoDia[1]), Number(todoDia[2])];
  const deslocamento = deslocamentoDoFuso(fuso, agora);
  // O dia de hoje no fuso, e a hora marcada nele, em UTC.
  const noFuso = new Date(agora.getTime() + deslocamento * minuto);
  let alvo =
    Date.UTC(noFuso.getUTCFullYear(), noFuso.getUTCMonth(), noFuso.getUTCDate(), horas, minutos) -
    deslocamento * minuto;
  if (alvo <= agora.getTime()) alvo += 24 * 60 * minuto;
  return new Date(alvo);
}
