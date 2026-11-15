// O quando do assistente da distribuição (spec distribuicao-de-software, "Quando instalar"; change
// software-por-pacote, design, decisão 7): agora, na janela da noite ou a partir de um dia marcado.
// O dia e a hora se leem no relógio do fuso de quem envia, como o servidor confere.
import { instanteNoFuso, JANELA_DA_NOITE, MENSAGENS_DO_QUANDO } from '@grafite/domain';

export type ChaveDoQuando = 'agora' | 'noite' | 'dia';

export interface QuandoDoAssistente {
  chave: ChaveDoQuando;
  /** O dia marcado, em `aaaa-mm-dd`. */
  dia: string | null;
  /** A hora do dia marcado, em `hh:mm`. */
  hora: string;
}

export const MENSAGEM_DA_HORA = 'Use a hora no formato 22:00.';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const formatos = new Map<string, Intl.DateTimeFormat>();

/** O dia, a hora e o minuto do momento no relógio do fuso. */
export function relogioNoFuso(momento: Date, fuso: string) {
  let formato = formatos.get(fuso);
  if (!formato) {
    formato = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatos.set(fuso, formato);
  }
  const partes = Object.fromEntries(
    formato.formatToParts(momento).map(({ type, value }) => [type, value]),
  );
  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
  };
}

/** O dia do momento no relógio do fuso, em `aaaa-mm-dd`. */
export const diaNoFuso = (momento: Date, fuso: string) => relogioNoFuso(momento, fuso).dia;

/** O dia seguinte ao de hoje no relógio do fuso, em `aaaa-mm-dd`. */
export function amanhaNoFuso(agora: Date, fuso: string): string {
  const [ano = 0, mes = 1, dia = 1] = diaNoFuso(agora, fuso).split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

/** Se o momento cai na janela da noite, das 22:00 às 06:00 do relógio do fuso. */
export function naJanelaDaNoite(momento: Date, fuso: string): boolean {
  const { hora } = relogioNoFuso(momento, fuso);
  return hora >= JANELA_DA_NOITE.abre || hora < JANELA_DA_NOITE.fecha;
}

const doisDigitos = (numero: number) => String(numero).padStart(2, '0');

/** "22:00" e "06:00": a abertura e o fim da janela da noite, como a tela os escreve. */
export const ABRE_A_NOITE = `${doisDigitos(JANELA_DA_NOITE.abre)}:00`;
export const FECHA_A_NOITE = `${doisDigitos(JANELA_DA_NOITE.fecha)}:00`;

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** "qui 12/11": o dia da semana e o dia de um `aaaa-mm-dd`. */
export function diaCurto(dia: string): string {
  const [ano = 0, mes = 1, numero = 1] = dia.split('-').map(Number);
  const semana = SEMANA[new Date(Date.UTC(ano, mes - 1, numero)).getUTCDay()];
  return `${semana} ${doisDigitos(numero)}/${doisDigitos(mes)}`;
}

export const comMaiuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * O momento do pedido para o meio da frase: "agora", "hoje às 22:00", "agora, na janela da noite",
 * "amanhã às 08:00" ou "qui 12/11 às 22:00".
 */
export function textoDoMomento(quando: QuandoDoAssistente, agora: Date, fuso: string): string {
  if (quando.chave === 'agora') return 'agora';
  if (quando.chave === 'noite') {
    return naJanelaDaNoite(agora, fuso) ? 'agora, na janela da noite' : `hoje às ${ABRE_A_NOITE}`;
  }
  if (!quando.dia) return 'no dia marcado';
  const dia = quando.dia === amanhaNoFuso(agora, fuso) ? 'amanhã' : diaCurto(quando.dia);
  return `${dia} às ${quando.hora}`;
}

/** O dia marcado conferido: o instante dele no fuso, de amanhã em diante, ou o motivo da recusa. */
export function conferirODia(
  { dia, hora }: Pick<QuandoDoAssistente, 'dia' | 'hora'>,
  agora: Date,
  fuso: string,
): { ok: true; instante: Date } | { ok: false; erros: { dia?: string; hora?: string } } {
  if (!dia) return { ok: false, erros: { dia: MENSAGENS_DO_QUANDO.diaFaltando } };
  if (!HORA.test(hora)) return { ok: false, erros: { hora: MENSAGEM_DA_HORA } };
  if (dia <= diaNoFuso(agora, fuso)) {
    return { ok: false, erros: { dia: MENSAGENS_DO_QUANDO.diaDeHoje } };
  }
  return { ok: true, instante: instanteNoFuso(dia, hora, fuso) };
}
