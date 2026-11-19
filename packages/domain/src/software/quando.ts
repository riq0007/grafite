// O quando da distribuição e a volta do agente (spec distribuicao-de-software, "Quando instalar" e
// "Deploy pelo agente do GLPI"; change software-por-pacote, design, decisões 7 e 8). A janela da
// noite vai das 22:00 às 06:00 no relógio do fuso de quem enviou, com o horário de verão dele; o dia
// marcado é um instante. O agente com um pedido que ainda não pode seguir volta até uma hora depois
// do próximo momento em que ele pode, porque o agente do GLPI sorteia até uma hora a menos no prazo.

import {
  fusoValido,
  instanteDoRelogio,
  type RelogioDoFuso as Relogio,
  relogioDoFuso as relogio,
} from '../fuso.ts';

export { fusoValido, instanteNoFuso } from '../fuso.ts';

export type QuandoDaDistribuicao = 'agora' | 'noite' | 'dia';

/** A hora em que a janela da noite abre e a em que ela fecha, no relógio do fuso. */
export const JANELA_DA_NOITE = { abre: 22, fecha: 6 } as const;

/** O prazo de fábrica do CONTACT e o maior que o Grafite dá, em minutos: 24 horas. */
export const EXPIRATION_DE_FABRICA = 24 * 60;

export interface PedidoNoTempo {
  quando: QuandoDaDistribuicao;
  aPartirDe: Date | null;
  fuso: string | null;
}

export const MENSAGENS_DO_QUANDO = {
  fusoDesconhecido: 'O fuso de quem envia não existe.',
  diaFaltando: 'Escolha o dia e a hora.',
  diaDeHoje: 'Escolha um dia de amanhã em diante.',
  diaDepoisDeUmAno: 'Escolha um dia até daqui a um ano.',
} as const;

/**
 * O instante ISO 8601 com o fuso, na forma que o `z.iso.datetime({ offset: true })` da rota aceita:
 * com os segundos, a fração opcional e o "Z" ou o "±hh:mm".
 */
const INSTANTE_COM_FUSO =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/**
 * O instante do texto ISO com o fuso, num dia que existe; `null` em qualquer outra forma. O texto
 * sem o fuso viraria a hora do servidor, e o `Date` aceita formas que o Node inventa.
 */
function instanteComFuso(texto: string): Date | null {
  const partes = INSTANTE_COM_FUSO.exec(texto);
  if (!partes) return null;
  const [ano = 0, mes = 0, dia = 0] = partes.slice(1, 4).map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  const instante = new Date(texto);
  return Number.isNaN(instante.getTime()) ? null : instante;
}

const fusoDo = (pedido: PedidoNoTempo) => pedido.fuso ?? 'UTC';

const doisDigitos = (valor: number) => String(valor).padStart(2, '0');

/**
 * A linha do log do chamado ao agente, com a hora no fuso de quem enviou ou, sem ele, na de UTC:
 * "Chamado às 22:00" ou "Chamado às 22:00, sem resposta".
 */
export function linhaDoChamado(momento: Date, fuso: string | null, respondeu: boolean): string {
  const { hora, minuto } = relogio(momento, fuso ?? 'UTC');
  const quando = `Chamado às ${doisDigitos(hora)}:${doisDigitos(minuto)}`;
  return respondeu ? quando : `${quando}, sem resposta`;
}

function naJanela(momento: Date, fuso: string): boolean {
  const { hora } = relogio(momento, fuso);
  return hora >= JANELA_DA_NOITE.abre || hora < JANELA_DA_NOITE.fecha;
}

/** Se o pedido pode seguir no momento: agora, sempre; o dia, a partir dele; a noite, na janela. */
export function podeSeguir(pedido: PedidoNoTempo, momento: Date): boolean {
  if (pedido.quando === 'agora') return true;
  if (pedido.quando === 'dia') return !pedido.aPartirDe || momento >= pedido.aPartirDe;
  return naJanela(momento, fusoDo(pedido));
}

/** O próximo momento em que o pedido pode seguir: o próprio momento, quando ele já pode. */
export function proximoMomento(pedido: PedidoNoTempo, momento: Date): Date {
  if (podeSeguir(pedido, momento)) return momento;
  if (pedido.quando === 'dia' && pedido.aPartirDe) return pedido.aPartirDe;
  const fuso = fusoDo(pedido);
  const { ano, mes, dia } = relogio(momento, fuso);
  // Fora da janela, o relógio está entre as 06:00 e as 22:00, e a janela abre no mesmo dia.
  return instanteDoRelogio(ano, mes, dia, JANELA_DA_NOITE.abre, 0, fuso);
}

/**
 * O `expiration` do CONTACT, em minutos: até uma hora depois do próximo momento do pedido que ainda
 * não pode seguir mais cedo, com o máximo de 24 horas, que é também o de quem não tem pedido assim.
 */
export function expirationDoContato(pedidos: readonly PedidoNoTempo[], momento: Date): number {
  let menor = EXPIRATION_DE_FABRICA;
  for (const pedido of pedidos) {
    if (podeSeguir(pedido, momento)) continue;
    const minutos = Math.ceil(
      (proximoMomento(pedido, momento).getTime() - momento.getTime()) / 60_000,
    );
    menor = Math.min(menor, minutos + 60);
  }
  return menor;
}

const dataDoRelogio = ({ ano, mes, dia }: Relogio) => ano * 10_000 + mes * 100 + dia;

/**
 * O quando que a distribuição guarda: agora, sem o dia; a noite e o dia, com o fuso que existe; e o
 * dia, como o instante ISO com o fuso, de amanhã até o mesmo dia do ano que vem no calendário do fuso.
 */
export function conferirQuando(
  pedido: { quando: QuandoDaDistribuicao; aPartirDe?: string | null; fuso?: string | null },
  momento: Date,
):
  | { ok: true; dados: PedidoNoTempo }
  | { ok: false; erros: Partial<Record<'aPartirDe' | 'fuso', string>> } {
  const fuso = pedido.fuso ?? null;
  if (pedido.quando === 'agora') {
    return {
      ok: true,
      dados: { quando: 'agora', aPartirDe: null, fuso: fusoValido(fuso) ? fuso : null },
    };
  }
  if (!fusoValido(fuso))
    return { ok: false, erros: { fuso: MENSAGENS_DO_QUANDO.fusoDesconhecido } };
  if (pedido.quando === 'noite')
    return { ok: true, dados: { quando: 'noite', aPartirDe: null, fuso } };
  const aPartirDe = pedido.aPartirDe ? instanteComFuso(pedido.aPartirDe) : null;
  if (!aPartirDe) {
    return { ok: false, erros: { aPartirDe: MENSAGENS_DO_QUANDO.diaFaltando } };
  }
  const marcado = dataDoRelogio(relogio(aPartirDe, fuso));
  const hoje = relogio(momento, fuso);
  if (marcado <= dataDoRelogio(hoje)) {
    return { ok: false, erros: { aPartirDe: MENSAGENS_DO_QUANDO.diaDeHoje } };
  }
  // O mesmo dia do ano que vem; o 29 de fevereiro sem par fica no 28, porque o número do dia que não
  // existe só deixa passar os dias antes dele.
  if (marcado > dataDoRelogio({ ...hoje, ano: hoje.ano + 1 })) {
    return { ok: false, erros: { aPartirDe: MENSAGENS_DO_QUANDO.diaDepoisDeUmAno } };
  }
  return { ok: true, dados: { quando: 'dia', aPartirDe, fuso } };
}
