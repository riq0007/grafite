// Datas e horas da interface no fuso escolhido nos Ajustes (F1c, design, decisão 8): o relógio da
// barra, a central de notificações e os módulos formatam por aqui, e não pelo fuso do navegador.
import { parseDate } from '@internationalized/date';
import { fusoDoSistema } from './fusos.ts';

export interface DataHora {
  /** O fuso em vigor, como "America/Manaus": o escolhido, ou o do sistema. */
  fuso: string;
  /** "qui 24 set 14:32": o formato do relógio da barra. */
  formatarHorario: (data: Date) => string;
  /** "07/10/2026 14:32": com o ano, para registros de qualquer época, como os da auditoria. */
  formatarDataEHora: (data: Date) => string;
  /** "07/10/2026": o dia com o ano, como o de quando a conta entrou num grupo. */
  formatarData: (data: Date) => string;
  /** O primeiro instante do dia `aaaa-mm-dd` no fuso. */
  inicioDoDia: (dia: string) => Date;
  /** O último instante do dia `aaaa-mm-dd` no fuso: um período até ele inclui o dia inteiro. */
  fimDoDia: (dia: string) => Date;
  /** "14:32". */
  formatarHora: (data: Date) => string;
  /** "qua 23 set". */
  formatarDia: (data: Date) => string;
  /** "Hoje", "Ontem" ou o dia, com a virada do dia no fuso. */
  grupoDoDia: (data: Date, agora: Date) => string;
}

const UM_DIA = 86_400_000;

/** As partes da data, sem os pontos das abreviações do pt-BR ("set." vira "set"). */
function partes(formato: Intl.DateTimeFormat, data: Date): Record<string, string> {
  return Object.fromEntries(
    formato.formatToParts(data).map((parte) => [parte.type, parte.value.replace('.', '')]),
  );
}

/** As funções de data e hora num fuso IANA; sem fuso, no do sistema. */
export function criarDataHora(fuso?: string): DataHora {
  const noFuso = fuso ? { timeZone: fuso } : {};
  const emVigor = fuso ?? fusoDoSistema();
  const horario = new Intl.DateTimeFormat('pt-BR', {
    ...noFuso,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const hora = new Intl.DateTimeFormat('pt-BR', {
    ...noFuso,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const dia = new Intl.DateTimeFormat('pt-BR', {
    ...noFuso,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const dataEHora = new Intl.DateTimeFormat('pt-BR', {
    ...noFuso,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const calendario = new Intl.DateTimeFormat('en-US', {
    ...noFuso,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  const formatarDia = (data: Date) => {
    const { weekday, day, month } = partes(dia, data);
    return `${weekday} ${day} ${month}`;
  };
  /** O número do dia do calendário no fuso: a comparação não depende da duração do dia. */
  const numeroDoDia = (data: Date) => {
    const { year, month, day } = partes(calendario, data);
    return Date.UTC(Number(year), Number(month) - 1, Number(day)) / UM_DIA;
  };

  return {
    fuso: emVigor,
    formatarDataEHora: (data) => {
      const { day, month, year, hour, minute } = partes(dataEHora, data);
      return `${day}/${month}/${year} ${hour}:${minute}`;
    },
    formatarData: (data) => {
      const { day, month, year } = partes(dataEHora, data);
      return `${day}/${month}/${year}`;
    },
    inicioDoDia: (dia) => parseDate(dia).toDate(emVigor),
    fimDoDia: (dia) => new Date(parseDate(dia).add({ days: 1 }).toDate(emVigor).getTime() - 1),
    formatarHorario: (data) => {
      const { weekday, day, month, hour, minute } = partes(horario, data);
      return `${weekday} ${day} ${month} ${hour}:${minute}`;
    },
    formatarHora: (data) => hora.format(data),
    formatarDia,
    grupoDoDia: (data, agora) => {
      const diferenca = numeroDoDia(agora) - numeroDoDia(data);
      if (diferenca === 0) return 'Hoje';
      if (diferenca === 1) return 'Ontem';
      return formatarDia(data);
    },
  };
}
