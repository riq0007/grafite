// Os indicadores criados em texto e no formulário (spec indicadores, "Indicadores da organização";
// change regras-indicadores-e-tarefas, design, decisão 3): a medida e o recorte numa linha, o valor
// e a meta na unidade da medida, e a meta como a pessoa a escreve: o toner em horas, o Crítico em
// minutos, as porcentagens com a vírgula e os alertas que voltam em vezes.
import {
  definicaoDaMedida,
  type MedidaDoIndicadorCriado,
  textoDaMeta,
  textoDaPorcentagem,
  textoDoValor,
} from '@grafite/domain';
import type { IndicadorCriado } from './consultas.ts';

/** A medida e o recorte, como "Disponibilidade dos ativos · Impressora · Jundiaí". */
export function medidaERecorte(indicador: Pick<IndicadorCriado, 'medida' | 'recorte'>): string {
  const { tipo, modelo, local } = indicador.recorte;
  return [definicaoDaMedida(indicador.medida).nome, tipo?.nome, modelo?.nome, local?.nome]
    .filter(Boolean)
    .join(' · ');
}

/** O valor na unidade da medida: a porcentagem dos backups, ou o texto do indicador dela. */
export const valorDoCriado = (medida: MedidaDoIndicadorCriado, valor: number) =>
  medida === 'backups-do-control-id' ? textoDaPorcentagem(valor) : textoDoValor(medida, valor);

/** A meta na unidade da medida. */
export const metaDoCriado = (medida: MedidaDoIndicadorCriado, meta: number) =>
  medida === 'backups-do-control-id' ? textoDaPorcentagem(meta) : textoDaMeta(medida, meta);

/** Em que unidade a pessoa escreve a meta de cada medida. */
export const UNIDADE_DA_META: Record<MedidaDoIndicadorCriado, string> = {
  toner: 'Em horas, como 48.',
  critico: 'Em minutos, como 30.',
  disponibilidade: 'Em porcentagem, como 98,5.',
  'que-voltam': 'Em vezes no mesmo ativo, nos últimos 30 dias.',
  'backups-do-control-id': 'Em porcentagem dos controles, como 100.',
};

const UMA_CASA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, useGrouping: false });

/** A meta guardada como a pessoa a escreve no campo. */
export function metaNoCampo(medida: MedidaDoIndicadorCriado, meta: number): string {
  switch (medida) {
    case 'toner':
      return UMA_CASA.format(meta / 60);
    case 'critico':
    case 'que-voltam':
      return String(meta);
    case 'disponibilidade':
    case 'backups-do-control-id':
      return UMA_CASA.format(meta / 10);
  }
}

/** A meta escrita, na unidade da medida, ou `NaN`, que o domínio recusa com a mensagem dele. */
export function metaDoCampo(medida: MedidaDoIndicadorCriado, texto: string): number {
  const limpo = texto.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(limpo)) return Number.NaN;
  const numero = Number(limpo);
  switch (medida) {
    case 'toner':
      return Math.round(numero * 60);
    case 'critico':
    case 'que-voltam':
      return numero;
    case 'disponibilidade':
    case 'backups-do-control-id':
      return Math.round(numero * 10);
  }
}

/** A meta de fábrica de cada medida, no campo do indicador novo. */
export const metaDeFabricaNoCampo = (medida: MedidaDoIndicadorCriado) =>
  metaNoCampo(medida, definicaoDaMedida(medida).metaDeFabrica);

const plural = (quantidade: number, singular: string, plural: string) =>
  `${quantidade} ${quantidade === 1 ? singular : plural}`;

/** A base do cálculo de cada medida, como a dos quatro dos alertas. */
export function baseDoCriado(medida: MedidaDoIndicadorCriado, base: number): string {
  switch (medida) {
    case 'toner':
      return `Mediana de ${plural(base, 'troca', 'trocas')}`;
    case 'critico':
      return `Mediana de ${plural(base, 'alerta Crítico', 'alertas Críticos')}`;
    case 'disponibilidade':
      return `${plural(base, 'ativo com queda', 'ativos com queda')} no período`;
    case 'que-voltam':
      return `${plural(base, 'alerta aberto', 'alertas abertos')} no período`;
    case 'backups-do-control-id':
      return `${plural(base, 'controle com o backup ligado', 'controles com o backup ligado')}`;
  }
}

/** O motivo no lugar do número, como nos quatro dos alertas. */
export function semValorDoCriado(
  medida: MedidaDoIndicadorCriado,
  valor: number | null,
  meta: number,
): string {
  switch (medida) {
    case 'toner':
      return 'Nenhum toner trocado nos últimos 30 dias.';
    case 'critico':
      return 'Nenhum alerta Crítico para reconhecer nos últimos 30 dias.';
    case 'disponibilidade':
      return valor === null
        ? 'Nenhuma regra de ativo offline ativa.'
        : `Nenhum ativo abaixo de ${metaDoCriado(medida, meta)}.`;
    case 'que-voltam':
      return `Nenhum alerta abriu ${meta} vezes no mesmo ativo.`;
    case 'backups-do-control-id':
      return 'Nenhum controle com o backup ligado.';
  }
}
