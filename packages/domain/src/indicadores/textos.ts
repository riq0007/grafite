// O texto dos valores, das metas e da notificação dos indicadores (spec indicadores, "Período dos
// indicadores" e "Indicador fora da meta avisa"; change p3d-indicadores, design, decisões 2 e 4; spec
// indicadores-da-operacao; change p4f-indicadores-da-operacao, design, decisões 4 e 8). A tela, a
// mensagem da meta, a auditoria e a notificação escrevem os números pelas mesmas funções.
import {
  DEFINICOES_DOS_INDICADORES,
  type Indicador,
  type IndicadorDaOperacao,
  indicadorDaOperacao,
} from './indicadores.ts';

const UMA_CASA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** O número com uma casa decimal só quando ela não é zero, como "1,5" e "2". */
const comUmaCasa = (valor: number) => UMA_CASA.format(Math.round(valor * 10) / 10);

/**
 * O tempo como a tela o escreve: "menos de 1 min", minutos inteiros abaixo de 1 hora, horas abaixo de
 * 1 dia e dias a partir dele, com o singular abaixo de 2 dias, como "1,5 dia".
 */
export function textoDoTempo(minutos: number): string {
  if (minutos < 1) return 'menos de 1 min';
  const inteiros = Math.round(minutos);
  if (inteiros < 60) return `${inteiros} min`;
  const horas = Math.round((minutos / 60) * 10) / 10;
  if (horas < 24) return `${comUmaCasa(horas)} h`;
  const dias = Math.round((minutos / (24 * 60)) * 10) / 10;
  return `${comUmaCasa(dias)} ${dias < 2 ? 'dia' : 'dias'}`;
}

/** A porcentagem de um valor em décimos de ponto percentual, como "97,5%" (975) e "99%" (990). */
export const textoDaPorcentagem = (porMil: number) => `${comUmaCasa(porMil / 10)}%`;

/** A quantidade com a unidade, no singular e no plural, como "1 ativo" e "2 toners". */
const plural = (quantidade: number, singular: string, plural: string) =>
  `${quantidade} ${quantidade === 1 ? singular : plural}`;

/** A quantidade de ativos, no singular e no plural. */
const ativos = (quantidade: number) => plural(quantidade, 'ativo', 'ativos');

/** A quantidade de toners, no singular e no plural. */
const toners = (quantidade: number) => plural(quantidade, 'toner', 'toners');

/** A meta na unidade do indicador, como "2 dias", "99%", "3 vezes" e "2 OS". */
export function textoDaMeta(indicador: Indicador, meta: number): string {
  switch (DEFINICOES_DOS_INDICADORES[indicador].unidade) {
    case 'minutos':
      return textoDoTempo(meta);
    case 'por-mil':
      return textoDaPorcentagem(meta);
    case 'vezes':
      return `${meta} vezes`;
    case 'ordens':
      return `${meta} OS`;
  }
}

/**
 * O valor do indicador: o tempo, nos indicadores de tempo, ou a quantidade na lista: os toners, nas
 * páginas por toner, e os ativos, nos outros.
 */
export function textoDoValor(indicador: Indicador, valor: number): string {
  if (DEFINICOES_DOS_INDICADORES[indicador].unidade === 'minutos') return textoDoTempo(valor);
  return indicador === 'paginas-por-toner' ? toners(valor) : ativos(valor);
}

/** A base do cálculo de um indicador da operação, como "Mediana de 12 OS resolvidas". */
export function textoDaBaseDaOperacao(indicador: IndicadorDaOperacao, base: number): string {
  switch (indicador) {
    case 'resolucao-das-os':
      return `Mediana de ${plural(base, 'OS resolvida', 'OS resolvidas')}`;
    case 'os-repetidas':
      return `${plural(base, 'ativo', 'ativos')} com OS no período`;
    case 'paginas-por-toner':
      return plural(
        base,
        'toner trocado com o total de páginas',
        'toners trocados com o total de páginas',
      );
  }
}

/**
 * O motivo no lugar do número de um indicador da operação: sem dado, ou nada na lista dos que
 * contam. Nas páginas por toner, a base diz se algum toner foi medido.
 */
export function motivoSemValorDaOperacao(
  indicador: IndicadorDaOperacao,
  meta: number,
  base: number,
): string {
  switch (indicador) {
    case 'resolucao-das-os':
      return 'Nenhuma OS resolvida nos últimos 30 dias.';
    case 'os-repetidas':
      return `Nenhum ativo com ${textoDaMeta(indicador, meta)} nos últimos 30 dias.`;
    case 'paginas-por-toner':
      return base === 0
        ? 'Nenhum toner trocado com o total de páginas nos últimos 30 dias.'
        : `Nenhum toner abaixo de ${textoDaPorcentagem(meta)} do rendimento.`;
  }
}

/** O "antes → depois" da meta, como a auditoria o guarda. */
export const textoDaMudancaDaMeta = (indicador: Indicador, antes: number, depois: number) =>
  `${textoDaMeta(indicador, antes)} → ${textoDaMeta(indicador, depois)}`;

/** O `data-foco` da seção do indicador na tela. */
export const focoDoIndicador = (indicador: Indicador) => `indicador-${indicador}`;

/** O endereço da tela dos indicadores do módulo dele, com o foco no indicador. */
export const destinoDoIndicador = (indicador: Indicador) =>
  `/${indicadorDaOperacao(indicador) ? 'operacao' : 'alertas'}/indicadores?foco=${focoDoIndicador(indicador)}`;

export interface NotificacaoDoIndicador {
  titulo: string;
  descricao: string;
  destino: string;
  /** O módulo de onde a notificação vem: "Alertas" ou "Operação". */
  origem: string;
}

/** A notificação do indicador que saiu da meta, com o valor dele e a meta. */
export function notificacaoDoIndicador(
  indicador: Indicador,
  valor: number,
  meta: number,
): NotificacaoDoIndicador {
  const { nome, decisao } = DEFINICOES_DOS_INDICADORES[indicador];
  const doTempo = `${textoDoTempo(valor)}, com a meta de ${textoDoTempo(meta)}`;
  const resumo = {
    toner: doTempo,
    critico: doTempo,
    disponibilidade: `${ativos(valor)} abaixo de ${textoDaPorcentagem(meta)}`,
    'que-voltam': `${ativos(valor)} com o mesmo alerta ${meta} vezes ou mais`,
    'resolucao-das-os': doTempo,
    'os-repetidas': `${ativos(valor)} com ${textoDaMeta(indicador, meta)} ou mais`,
    'paginas-por-toner': `${toners(valor)} abaixo de ${textoDaPorcentagem(meta)} do rendimento`,
  }[indicador];
  const titulo = indicador === 'disponibilidade' ? 'Disponibilidade' : nome;
  return {
    titulo: `${titulo} fora da meta: ${resumo}`,
    descricao: decisao,
    destino: destinoDoIndicador(indicador),
    origem: indicadorDaOperacao(indicador) ? 'Operação' : 'Alertas',
  };
}
