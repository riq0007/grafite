// O cálculo dos indicadores sobre os alertas do período (spec indicadores; change p3d-indicadores,
// design, decisão 1). A API lê os alertas que tocam os últimos 60 dias pelo alcance da conta, ou da
// organização inteira na avaliação diária, e os passa para cá com o momento da consulta e as metas:
// a tela e a notificação calculam pela mesma função. O alvo do alerta (o ativo ou o coletor, como a
// lista os mostra) passa sem ser lido; a `alvoChave` o identifica para somar e agrupar.
import type { CondicaoDeAlerta, SeveridadeDoAlerta } from '../alertas/regras.ts';
import type { IndicadorDosAlertas } from './indicadores.ts';

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const DIAS_DO_PERIODO = 30;

/** Quantas linhas cada lista mostra; as outras viram "E mais <N>.". */
export const ITENS_POR_INDICADOR = 20;

export interface AlertaParaOsIndicadores<A> {
  id: string;
  condicao: CondicaoDeAlerta;
  regra: { id: string; nome: string };
  severidade: SeveridadeDoAlerta;
  texto: string;
  alvoChave: string;
  alvo: A;
  /** Quando a condição começou, antes da duração da regra. */
  observadoEm: Date;
  abertoEm: Date;
  reconhecidoEm: Date | null;
  /** O nome atual de quem reconheceu. */
  reconhecidoPor: string | null;
  resolvidoEm: Date | null;
  comoTerminou: 'voltou-ao-normal' | 'regra-deixou-de-valer' | null;
  abertoNoSilencio: boolean;
}

export interface PeriodoDosIndicadores {
  inicio: Date;
  fim: Date;
  inicioDoAnterior: Date;
}

/** Os últimos 30 dias até o momento da consulta, com os 30 anteriores a eles. */
export function periodoDosIndicadores(agora: Date): PeriodoDosIndicadores {
  return {
    inicio: new Date(agora.getTime() - DIAS_DO_PERIODO * DIA),
    fim: agora,
    inicioDoAnterior: new Date(agora.getTime() - 2 * DIAS_DO_PERIODO * DIA),
  };
}

export type SituacaoDoIndicador = 'dentro' | 'fora' | 'sem-dado';

export interface ResultadoDoIndicador<I> {
  /** Os tempos em minutos; a disponibilidade e os alertas que voltam, a quantidade na lista. */
  valor: number | null;
  anterior: number | null;
  /** Quantos alertas, trocas ou ativos o valor resume. */
  base: number;
  situacao: SituacaoDoIndicador;
  itens: I[];
  /** Quantos ficaram de fora da lista. */
  mais: number;
}

/** Um alerta na lista de um indicador de tempo. */
export interface ItemDeTempo<A> {
  id: string;
  texto: string;
  alvo: A;
  minutos: number;
  /** O alerta ainda espera: o toner sem troca, ou o Crítico sem reconhecimento. */
  esperando: boolean;
  reconhecidoPor: string | null;
}

/** Dentro de [inicio, fim). */
export const dentro = (momento: Date, inicio: Date, fim: Date) =>
  momento.getTime() >= inicio.getTime() && momento.getTime() < fim.getTime();

export const minutosEntre = (de: Date, ate: Date) => (ate.getTime() - de.getTime()) / MINUTO;

export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? (ordenados[meio] as number)
    : ((ordenados[meio - 1] as number) + (ordenados[meio] as number)) / 2;
}

/** A lista cortada em 20, com quantos ficaram de fora. */
export function cortar<I>(itens: readonly I[]): { itens: I[]; mais: number } {
  return {
    itens: itens.slice(0, ITENS_POR_INDICADOR),
    mais: Math.max(0, itens.length - ITENS_POR_INDICADOR),
  };
}

export const situacaoDoTempo = (valor: number | null, meta: number): SituacaoDoIndicador =>
  valor === null ? 'sem-dado' : valor > meta ? 'fora' : 'dentro';

/**
 * O tempo de atendimento do toner: a mediana do alerta à troca, nos toners trocados no período. A
 * lista traz primeiro os ainda abertos há mais tempo que a meta, do mais antigo para o mais novo, e
 * depois os trocados depois da meta, do mais demorado para o mais rápido.
 */
export function indicadorDoToner<A>(
  alertas: readonly AlertaParaOsIndicadores<A>[],
  { inicio, fim, inicioDoAnterior }: PeriodoDosIndicadores,
  meta: number,
): ResultadoDoIndicador<ItemDeTempo<A>> {
  const doToner = alertas.filter(
    (alerta) => alerta.condicao === 'toner.nivel' && !alerta.abertoNoSilencio,
  );
  const trocadosEm = (de: Date, ate: Date) =>
    doToner.filter(
      (alerta) =>
        alerta.comoTerminou === 'voltou-ao-normal' &&
        alerta.resolvidoEm !== null &&
        dentro(alerta.resolvidoEm, de, ate),
    );
  const duracao = (alerta: AlertaParaOsIndicadores<A>) =>
    minutosEntre(alerta.abertoEm, alerta.resolvidoEm as Date);
  const trocados = trocadosEm(inicio, fim);
  const valor = mediana(trocados.map(duracao));

  const item = (alerta: AlertaParaOsIndicadores<A>, minutos: number, esperando: boolean) => ({
    id: alerta.id,
    texto: alerta.texto,
    alvo: alerta.alvo,
    minutos,
    esperando,
    reconhecidoPor: null,
  });
  const esperando = doToner
    .filter((alerta) => alerta.resolvidoEm === null)
    .map((alerta) => item(alerta, minutosEntre(alerta.abertoEm, fim), true))
    .filter((esperou) => esperou.minutos > meta)
    .sort((a, b) => b.minutos - a.minutos);
  const demorados = trocados
    .map((alerta) => item(alerta, duracao(alerta), false))
    .filter((demorou) => demorou.minutos > meta)
    .sort((a, b) => b.minutos - a.minutos);

  return {
    valor,
    anterior: mediana(trocadosEm(inicioDoAnterior, inicio).map(duracao)),
    base: trocados.length,
    situacao: situacaoDoTempo(valor, meta),
    ...cortar([...esperando, ...demorados]),
  };
}

/**
 * O tempo até reconhecer o Crítico: a mediana da abertura ao reconhecimento, nos Críticos abertos
 * no período. O ainda aberto sem reconhecimento entra com o tempo até agora; o que terminou sem
 * reconhecimento não esperou ninguém e fica de fora.
 */
export function indicadorDoCritico<A>(
  alertas: readonly AlertaParaOsIndicadores<A>[],
  { inicio, fim, inicioDoAnterior }: PeriodoDosIndicadores,
  meta: number,
): ResultadoDoIndicador<ItemDeTempo<A>> {
  const esperasEm = (de: Date, ate: Date) =>
    alertas
      .filter(
        (alerta) =>
          alerta.severidade === 'critico' &&
          !alerta.abertoNoSilencio &&
          dentro(alerta.abertoEm, de, ate) &&
          (alerta.reconhecidoEm !== null || alerta.resolvidoEm === null),
      )
      .map((alerta) => ({
        id: alerta.id,
        texto: alerta.texto,
        alvo: alerta.alvo,
        minutos: minutosEntre(alerta.abertoEm, alerta.reconhecidoEm ?? fim),
        esperando: alerta.reconhecidoEm === null,
        reconhecidoPor: alerta.reconhecidoPor,
      }));
  const esperas = esperasEm(inicio, fim);
  const valor = mediana(esperas.map(({ minutos }) => minutos));
  return {
    valor,
    anterior: mediana(esperasEm(inicioDoAnterior, inicio).map(({ minutos }) => minutos)),
    base: esperas.length,
    situacao: situacaoDoTempo(valor, meta),
    ...cortar(
      esperas.filter(({ minutos }) => minutos > meta).sort((a, b) => b.minutos - a.minutos),
    ),
  };
}

/** Um ativo na lista da disponibilidade. */
export interface ItemDaDisponibilidade<A> {
  alvo: A;
  /** A disponibilidade em décimos de ponto percentual, arredondada para baixo: 975 é 97,5%. */
  porMil: number;
  minutosForaDoAr: number;
}

/** O tempo fora do ar de cada alvo na janela: a união das quedas dele, cortadas nela. */
function quedasNaJanela<A>(
  quedas: readonly AlertaParaOsIndicadores<A>[],
  de: Date,
  ate: Date,
  agora: Date,
): Map<string, { alvo: A; ms: number }> {
  const intervalos = new Map<string, { alvo: A; trechos: [number, number][] }>();
  for (const queda of quedas) {
    const comeco = Math.max(queda.observadoEm.getTime(), de.getTime());
    const fim = Math.min((queda.resolvidoEm ?? agora).getTime(), ate.getTime());
    if (fim <= comeco) continue;
    const doAlvo = intervalos.get(queda.alvoChave) ?? { alvo: queda.alvo, trechos: [] };
    doAlvo.trechos.push([comeco, fim]);
    intervalos.set(queda.alvoChave, doAlvo);
  }
  const fora = new Map<string, { alvo: A; ms: number }>();
  for (const [chave, { alvo, trechos }] of intervalos) {
    // Duas regras de ativo offline no mesmo ativo abrem dois alertas da mesma queda: a união
    // conta o tempo uma vez só.
    trechos.sort((a, b) => a[0] - b[0]);
    let ms = 0;
    let [aberto, fechado] = trechos[0] as [number, number];
    for (const [comeco, fim] of trechos.slice(1)) {
      if (comeco > fechado) {
        ms += fechado - aberto;
        [aberto, fechado] = [comeco, fim];
      } else {
        fechado = Math.max(fechado, fim);
      }
    }
    ms += fechado - aberto;
    fora.set(chave, { alvo, ms });
  }
  return fora;
}

/**
 * A disponibilidade dos ativos: a quantidade abaixo da meta, pelo tempo sem responder dos alertas de
 * ativo offline, de quando a falta de resposta começou até o fim do alerta, ou até agora. Sem uma
 * regra de ativo offline ativa, o indicador não tem dado: nenhum alerta não quer dizer 100%.
 */
export function indicadorDaDisponibilidade<A>(
  alertas: readonly AlertaParaOsIndicadores<A>[],
  { inicio, fim, inicioDoAnterior }: PeriodoDosIndicadores,
  meta: number,
  regraDeOfflineAtiva: boolean,
): ResultadoDoIndicador<ItemDaDisponibilidade<A>> {
  if (!regraDeOfflineAtiva)
    return { valor: null, anterior: null, base: 0, situacao: 'sem-dado', itens: [], mais: 0 };
  const quedas = alertas.filter(
    (alerta) => alerta.condicao === 'rede.offline' && !alerta.abertoNoSilencio,
  );
  const abaixoEm = (de: Date, ate: Date) => {
    const periodo = ate.getTime() - de.getTime();
    const fora = quedasNaJanela(quedas, de, ate, fim);
    // A conta inteira, sem a fração: abaixo da meta é (período − fora) / período < meta / 1000.
    const abaixo = [...fora.values()]
      .filter(({ ms }) => (periodo - ms) * 1000 < meta * periodo)
      .map(({ alvo, ms }) => ({
        alvo,
        porMil: Math.floor(((periodo - ms) * 1000) / periodo),
        minutosForaDoAr: ms / MINUTO,
      }))
      .sort((a, b) => a.porMil - b.porMil || b.minutosForaDoAr - a.minutosForaDoAr);
    return { abaixo, comQueda: fora.size };
  };
  const doPeriodo = abaixoEm(inicio, fim);
  const valor = doPeriodo.abaixo.length;
  return {
    valor,
    anterior: abaixoEm(inicioDoAnterior, inicio).abaixo.length,
    base: doPeriodo.comQueda,
    situacao: valor > 0 ? 'fora' : 'dentro',
    ...cortar(doPeriodo.abaixo),
  };
}

/** Um ativo ou coletor na lista dos alertas que voltam. */
export interface ItemQueVolta<A> {
  alvo: A;
  regra: { id: string; nome: string };
  vezes: number;
  ultimaEm: Date;
}

/**
 * Os alertas que voltam: os ativos e os coletores em que alertas da mesma regra abriram no período
 * a quantidade de vezes da meta ou mais, do que mais voltou para o que menos voltou.
 */
export function indicadorQueVolta<A>(
  alertas: readonly AlertaParaOsIndicadores<A>[],
  { inicio, fim, inicioDoAnterior }: PeriodoDosIndicadores,
  meta: number,
): ResultadoDoIndicador<ItemQueVolta<A>> {
  const voltasEm = (de: Date, ate: Date) => {
    const abertos = alertas.filter(
      (alerta) => !alerta.abertoNoSilencio && dentro(alerta.abertoEm, de, ate),
    );
    const grupos = new Map<string, ItemQueVolta<A>>();
    for (const alerta of abertos) {
      const chave = `${alerta.alvoChave} ${alerta.regra.id}`;
      const grupo = grupos.get(chave);
      if (!grupo) {
        grupos.set(chave, {
          alvo: alerta.alvo,
          regra: alerta.regra,
          vezes: 1,
          ultimaEm: alerta.abertoEm,
        });
        continue;
      }
      grupo.vezes += 1;
      if (alerta.abertoEm.getTime() > grupo.ultimaEm.getTime()) grupo.ultimaEm = alerta.abertoEm;
    }
    const voltaram = [...grupos.values()]
      .filter(({ vezes }) => vezes >= meta)
      .sort((a, b) => b.vezes - a.vezes || b.ultimaEm.getTime() - a.ultimaEm.getTime());
    return { voltaram, abertos: abertos.length };
  };
  const doPeriodo = voltasEm(inicio, fim);
  const valor = doPeriodo.voltaram.length;
  return {
    valor,
    anterior: voltasEm(inicioDoAnterior, inicio).voltaram.length,
    base: doPeriodo.abertos,
    situacao: valor > 0 ? 'fora' : 'dentro',
    ...cortar(doPeriodo.voltaram),
  };
}

export interface ContextoDosIndicadores {
  agora: Date;
  metas: Record<IndicadorDosAlertas, number>;
  /** Se a organização tem uma regra de ativo offline ativa, sem a qual a disponibilidade não mede. */
  regraDeOfflineAtiva: boolean;
}

export interface IndicadoresCalculados<A> {
  periodo: PeriodoDosIndicadores;
  toner: ResultadoDoIndicador<ItemDeTempo<A>>;
  critico: ResultadoDoIndicador<ItemDeTempo<A>>;
  disponibilidade: ResultadoDoIndicador<ItemDaDisponibilidade<A>>;
  'que-voltam': ResultadoDoIndicador<ItemQueVolta<A>>;
}

/** Os quatro indicadores dos alertas dados, no período até `agora`, com as metas da organização. */
export function calcularIndicadores<A>(
  alertas: readonly AlertaParaOsIndicadores<A>[],
  { agora, metas, regraDeOfflineAtiva }: ContextoDosIndicadores,
): IndicadoresCalculados<A> {
  const periodo = periodoDosIndicadores(agora);
  return {
    periodo,
    toner: indicadorDoToner(alertas, periodo, metas.toner),
    critico: indicadorDoCritico(alertas, periodo, metas.critico),
    disponibilidade: indicadorDaDisponibilidade(
      alertas,
      periodo,
      metas.disponibilidade,
      regraDeOfflineAtiva,
    ),
    'que-voltam': indicadorQueVolta(alertas, periodo, metas['que-voltam']),
  };
}
