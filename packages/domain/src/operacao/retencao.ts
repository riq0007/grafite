// A retenção dos backups (F2d, design, decisão 12): depois de cada backup feito, ficam o último de
// cada um dos dias, das semanas ISO e dos meses mais recentes, contados no fuso do servidor, e
// sempre o mais novo. O resto é apagado de cada destino.

export interface Retencao {
  diarios: number;
  semanais: number;
  mensais: number;
}

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Os backups que ficam, entre os momentos dados, na ordem em que vieram e com as mesmas instâncias.
 * Um período sem backup não conta: os 7 diários são os 7 dias mais recentes que têm backup.
 */
export function backupsQueFicam(
  momentos: readonly Date[],
  retencao: Retencao,
  fuso: string,
): Date[] {
  const doMaisNovo = [...momentos].sort((a, b) => b.getTime() - a.getTime());
  const maisNovo = doMaisNovo[0];
  if (maisNovo === undefined) return [];

  const periodos = periodosNoFuso(fuso);
  const ficam = new Set<Date>([maisNovo]);
  guardarOUltimoDeCada(doMaisNovo, periodos.dia, retencao.diarios, ficam);
  guardarOUltimoDeCada(doMaisNovo, periodos.semana, retencao.semanais, ficam);
  guardarOUltimoDeCada(doMaisNovo, periodos.mes, retencao.mensais, ficam);
  return momentos.filter((momento) => ficam.has(momento));
}

/** Percorre do mais novo ao mais antigo: o primeiro de cada período é o último dele. */
function guardarOUltimoDeCada(
  doMaisNovo: readonly Date[],
  periodo: (momento: Date) => string,
  quantos: number,
  ficam: Set<Date>,
): void {
  const vistos = new Set<string>();
  for (const momento of doMaisNovo) {
    if (vistos.size >= quantos) return;
    const chave = periodo(momento);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    ficam.add(momento);
  }
}

/** O dia, a semana ISO (pela segunda-feira dela) e o mês de um momento, no calendário do fuso. */
function periodosNoFuso(fuso: string) {
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dataLocal = (momento: Date) => {
    const partes = Object.fromEntries(
      formato.formatToParts(momento).map(({ type, value }) => [type, value]),
    );
    return { ano: Number(partes.year), mes: Number(partes.month), dia: Number(partes.day) };
  };
  return {
    dia: (momento: Date) => {
      const { ano, mes, dia } = dataLocal(momento);
      return `${ano}-${mes}-${dia}`;
    },
    semana: (momento: Date) => {
      const { ano, mes, dia } = dataLocal(momento);
      const meiaNoite = Date.UTC(ano, mes - 1, dia);
      const desdeSegunda = (new Date(meiaNoite).getUTCDay() + 6) % 7;
      return String((meiaNoite - desdeSegunda * UM_DIA) / UM_DIA);
    },
    mes: (momento: Date) => {
      const { ano, mes } = dataLocal(momento);
      return `${ano}-${mes}`;
    },
  };
}
