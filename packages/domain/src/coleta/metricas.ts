// As métricas da coleta (spec leituras-e-estado e disponibilidade-de-rede; design do P2a, decisão 4):
// cada uma com o intervalo em que o coletor a lê. O ping vira duas leituras, a disponibilidade e a
// latência, para a situação de cada leitura valer para um valor só. O SNMP das impressoras (change
// p2b-impressoras-por-snmp, design, decisão 1) vira a resposta e uma leitura por suprimento, por
// contador e pelas condições, as mensagens e a série. A sondagem do Control iD (change
// p2c-saude-do-control-id, design, decisão 1) vira a situação e, quando o controle responde, o
// firmware, com o produto, e a série.

export const METRICAS_DA_COLETA = [
  'rede.disponibilidade',
  'rede.latencia',
  'snmp.resposta',
  'impressora.suprimento',
  'impressora.contador',
  'impressora.condicoes',
  'impressora.mensagens',
  'impressora.serie',
  'controlid.sondagem',
  'controlid.firmware',
  'controlid.serie',
] as const;

export type MetricaDaColeta = (typeof METRICAS_DA_COLETA)[number];

/**
 * As métricas com um valor por item do ativo, como cada suprimento e cada contador da impressora: o
 * item é o índice dele, um número inteiro positivo em texto. As outras têm o item vazio.
 */
export const METRICAS_COM_ITEM: readonly MetricaDaColeta[] = [
  'impressora.suprimento',
  'impressora.contador',
];

/** A leitura válida, a que falhou ("sem dado", nunca um valor) e a de valor fora da faixa válida. */
export const SITUACOES_DA_LEITURA = ['valida', 'sem-dado', 'inconsistente'] as const;

export type SituacaoDaLeitura = (typeof SITUACOES_DA_LEITURA)[number];

/** O intervalo do SNMP, em ms: cada impressora a cada 10 min. */
const INTERVALO_DO_SNMP = 600_000;
/** O intervalo da sondagem do Control iD, em ms: cada controle a cada 5 min. */
const INTERVALO_DA_SONDAGEM = 300_000;

/** O intervalo de cada métrica, em ms: o ping a cada 2 min, a sondagem a cada 5 e o SNMP a cada 10. */
export const INTERVALOS_DAS_METRICAS: Record<MetricaDaColeta, number> = {
  'rede.disponibilidade': 120_000,
  'rede.latencia': 120_000,
  'snmp.resposta': INTERVALO_DO_SNMP,
  'impressora.suprimento': INTERVALO_DO_SNMP,
  'impressora.contador': INTERVALO_DO_SNMP,
  'impressora.condicoes': INTERVALO_DO_SNMP,
  'impressora.mensagens': INTERVALO_DO_SNMP,
  'impressora.serie': INTERVALO_DO_SNMP,
  'controlid.sondagem': INTERVALO_DA_SONDAGEM,
  'controlid.firmware': INTERVALO_DA_SONDAGEM,
  'controlid.serie': INTERVALO_DA_SONDAGEM,
};

/** A leitura mais antiga que estes intervalos aparece como desatualizada. */
export const INTERVALOS_ATE_DESATUALIZAR = 3;

export const metricaDaColeta = (metrica: string): metrica is MetricaDaColeta =>
  (METRICAS_DA_COLETA as readonly string[]).includes(metrica);
