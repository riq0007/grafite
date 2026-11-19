// O que a tela "Quem está com o quê" monta do quadro e da lista dos prazos (spec modulo-chamados,
// "Quem está com o quê"; spec chamados, "Carga de cada pessoa"; change chamados-da-ti, design,
// decisão 22): a chave e os textos de cada coluna, a idade do mais antigo, arredondada como no
// mockup, e os quadrados de cada coluna na ordem do vencimento, com o chamado da lista e a situação
// do prazo no momento da tela.
import { compararPrazos, type HorarioDaTi, type SituacaoDoPrazo } from '@grafite/domain';
import type {
  ChamadoNosPrazos,
  ColunaDoQuadro,
  PrazosDosChamados,
  QuadroDosChamados,
} from '../consultas.ts';
import type { ContarOPrazo } from '../prazo.ts';

const MS_POR_MINUTO = 60_000;
const MS_POR_HORA = 60 * MS_POR_MINUTO;
const MS_POR_DIA = 24 * MS_POR_HORA;

/**
 * A idade do aberto mais antigo, arredondada para o mais perto, e não para baixo, como o mockup
 * (16 h 35 min dá "17 h"): em minutos até 59 min, em horas até 23 h e em dias daí em diante. A
 * unidade sobe quando o arredondamento chega à seguinte; abaixo de meio minuto, e com o relógio do
 * computador atrás do servidor, "menos de 1 min".
 */
export function idadeDoMaisAntigo(abertoEm: Date, agora: Date): string {
  const ms = agora.getTime() - abertoEm.getTime();
  if (ms < MS_POR_MINUTO / 2) return 'menos de 1 min';
  const minutos = Math.round(ms / MS_POR_MINUTO);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.round(ms / MS_POR_HORA);
  if (horas < 24) return `${horas} h`;
  return `${Math.round(ms / MS_POR_DIA)} d`;
}

/** "mais antigo #1041, há 17 h". */
export function textoDoMaisAntigo(
  { numero, abertoEm }: { numero: number; abertoEm: string },
  agora: Date,
): string {
  return `mais antigo #${numero}, há ${idadeDoMaisAntigo(new Date(abertoEm), agora)}`;
}

/** "3 na triagem". */
export const textoDaTriagem = (abertos: number) => `${abertos} na triagem`;

/** "1 aberto" ou "12 abertos". */
export const textoDosAbertos = (abertos: number) =>
  `${abertos} ${abertos === 1 ? 'aberto' : 'abertos'}`;

/** "Carga: 2 de 5", com os abertos, que passam da carga cheia, como "Carga: 7 de 5". */
export const textoDaCarga = (abertos: number, cheia: number) => `Carga: ${abertos} de ${cheia}`;

/** Quantos resolvidos hoje o pé mostra pelo número; os outros entram no "e mais 2". */
const RESOLVIDOS_NO_PE = 3;

/**
 * O pé da coluna: "Resolveu hoje: #1035", "Resolveu hoje: #1031, #1033, #1035 e mais 2", com os
 * menores números primeiro, ou "Nada resolvido hoje".
 */
export function textoDosResolvidosHoje(numeros: readonly number[]): string {
  if (numeros.length === 0) return 'Nada resolvido hoje';
  const pelaOrdem = [...numeros].sort((a, b) => a - b).map((numero) => `#${numero}`);
  const mostrados = pelaOrdem.slice(0, RESOLVIDOS_NO_PE);
  const resto = pelaOrdem.length - mostrados.length;
  const lista =
    resto > 0
      ? `${mostrados.join(', ')} e mais ${resto}`
      : mostrados.length === 1
        ? mostrados.join('')
        : `${mostrados.slice(0, -1).join(', ')} e ${mostrados.at(-1)}`;
  return `Resolveu hoje: ${lista}`;
}

/**
 * A chave da coluna: a conta e a marca de quem não atende mais, porque a mesma conta pode ter as
 * duas colunas. O alvo do arraste (5.9) usa a mesma chave.
 */
export const chaveDaColuna = (coluna: Pick<ColunaDoQuadro, 'conta' | 'naoAtendeMais'>) =>
  `${coluna.conta}:${coluna.naoAtendeMais ? 'nao-atende-mais' : 'atende'}`;

/** Os abertos que a conta vê: os da triagem e os de todas as colunas. */
export const abertosNoQuadro = (quadro: Pick<QuadroDosChamados, 'triagem' | 'colunas'>) =>
  quadro.colunas.reduce(
    (soma, coluna) => soma + coluna.abertos.length,
    quadro.triagem.abertos.length,
  );

/** A lista dos prazos pelo número, para cada quadrado achar o chamado dele. */
export const listaPorNumero = (prazos: Pick<PrazosDosChamados, 'chamados'>) =>
  new Map(prazos.chamados.map((chamado) => [chamado.numero, chamado]));

/**
 * Um quadrado da coluna: o número, que vem do quadro, e o chamado e a situação do prazo, que vêm da
 * lista. Sem o chamado, a lista ainda não o trouxe; sem a situação, o prazo é ilegível.
 */
export interface Quadrado {
  numero: number;
  chamado: ChamadoNosPrazos | null;
  situacao: SituacaoDoPrazo | null;
}

/**
 * Os quadrados de uma coluna na ordem do vencimento (`compararPrazos`): os estourados, os que vencem
 * antes e os de relógio parado, pelo que resta, com o empate pelo número. Depois, pelo número, os de
 * prazo ilegível e os que a lista ainda não trouxe.
 */
export function quadradosDaColuna(
  numeros: readonly number[],
  {
    lista,
    horario,
    contar,
  }: {
    lista: ReadonlyMap<number, ChamadoNosPrazos>;
    horario: HorarioDaTi;
    contar: ContarOPrazo;
  },
): Quadrado[] {
  const quadrados = numeros.map((numero): Quadrado => {
    const chamado = lista.get(numero) ?? null;
    const situacao = chamado?.relogio ? contar(chamado.relogio, horario) : null;
    return { numero, chamado, situacao };
  });
  return quadrados.sort((a, b) => {
    if (a.situacao && b.situacao) {
      return compararPrazos(a.situacao, b.situacao) || a.numero - b.numero;
    }
    if (a.situacao) return -1;
    if (b.situacao) return 1;
    return a.numero - b.numero;
  });
}
