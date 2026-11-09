// A estimativa de quando um suprimento acaba (spec impressoras-por-snmp, "Estimativa de quando o
// suprimento acaba"; change suprimentos-rostos-e-backups, design, decisão 3): a regressão linear do
// percentual pelo tempo, na série desde a última troca. É uma estimativa e nunca toma o lugar do
// nível medido.

export interface PontoDoSuprimento {
  momento: Date;
  percentual: number;
}

export interface EstimativaDoFim {
  /** Os dias, a partir do último ponto, até o nível chegar a zero. */
  dias: number;
  /** O momento do primeiro ponto usado, para a tela dizer "pelas leituras desde". */
  desde: Date;
}

/** Uma subida maior que esta, em pontos, é uma troca: a série começa de novo. */
const SUBIDA_DA_TROCA = 10;
const MINIMO_DE_PONTOS = 3;
const MINIMO_DE_DIAS = 3;
/** Menos que esta queda por dia é nível parado. */
const QUEDA_MINIMA_POR_DIA = 0.1;
const MAXIMO_DE_DIAS = 365;
const DIA = 86_400_000;

const media = (valores: number[]) => valores.reduce((soma, v) => soma + v, 0) / valores.length;

export function estimarFimDoSuprimento(pontos: PontoDoSuprimento[]): EstimativaDoFim | null {
  const emOrdem = [...pontos].sort((a, b) => a.momento.getTime() - b.momento.getTime());
  let inicio = 0;
  for (let i = 1; i < emOrdem.length; i++) {
    const atual = emOrdem[i];
    const anterior = emOrdem[i - 1];
    if (atual && anterior && atual.percentual - anterior.percentual > SUBIDA_DA_TROCA) inicio = i;
  }
  const serie = emOrdem.slice(inicio);
  const primeiro = serie[0];
  if (!primeiro || serie.length < MINIMO_DE_PONTOS) return null;
  const xs = serie.map((p) => (p.momento.getTime() - primeiro.momento.getTime()) / DIA);
  const ys = serie.map((p) => p.percentual);
  const ultimoX = xs.at(-1) ?? 0;
  if (ultimoX < MINIMO_DE_DIAS) return null;
  const mediaX = media(xs);
  const mediaY = media(ys);
  let somaXy = 0;
  let somaXx = 0;
  xs.forEach((x, i) => {
    somaXy += (x - mediaX) * ((ys[i] ?? 0) - mediaY);
    somaXx += (x - mediaX) ** 2;
  });
  if (somaXx === 0) return null;
  const inclinacao = somaXy / somaXx;
  if (inclinacao > -QUEDA_MINIMA_POR_DIA) return null;
  const noUltimo = mediaY + inclinacao * (ultimoX - mediaX);
  const dias = Math.max(0, noUltimo / -inclinacao);
  if (dias > MAXIMO_DE_DIAS) return null;
  return { dias: Math.round(dias), desde: primeiro.momento };
}
