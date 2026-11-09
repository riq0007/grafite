// Os indicadores (spec indicadores; change p3d-indicadores, design, decisão 2; spec
// indicadores-da-operacao; change p4f-indicadores-da-operacao, design, decisões 4 e 5): os dos
// alertas e os da operação, cada um com o nome, o que mede, a unidade da meta, a meta de fábrica, os
// limites e a decisão que ele pede fora da meta. A meta fica num inteiro na unidade do indicador: os
// tempos em minutos, as porcentagens em décimos de ponto percentual (990 é 99%), os alertas que
// voltam em vezes e as OS repetidas em quantidade de OS.

export const INDICADORES_DOS_ALERTAS = [
  'toner',
  'critico',
  'disponibilidade',
  'que-voltam',
] as const;

export const INDICADORES_DA_OPERACAO = [
  'resolucao-das-os',
  'os-repetidas',
  'paginas-por-toner',
] as const;

/** Os dois grupos, na ordem das telas: os da tabela das metas da organização. */
export const INDICADORES = [...INDICADORES_DOS_ALERTAS, ...INDICADORES_DA_OPERACAO] as const;

export type IndicadorDosAlertas = (typeof INDICADORES_DOS_ALERTAS)[number];
export type IndicadorDaOperacao = (typeof INDICADORES_DA_OPERACAO)[number];
export type Indicador = (typeof INDICADORES)[number];

export type UnidadeDoIndicador = 'minutos' | 'por-mil' | 'vezes' | 'ordens';

export interface DefinicaoDoIndicador {
  nome: string;
  /** Uma linha com o que o indicador mede. */
  mede: string;
  unidade: UnidadeDoIndicador;
  metaDeFabrica: number;
  /** O mínimo e o máximo da meta, na unidade do indicador. */
  limites: readonly [number, number];
  /** Os limites como a mensagem os escreve, como "1 h" e "30 dias". */
  limitesEmTexto: readonly [string, string];
  /** O que fazer com o indicador fora da meta. */
  decisao: string;
}

const DIA = 24 * 60;

export const DEFINICOES_DOS_INDICADORES: Record<Indicador, DefinicaoDoIndicador> = {
  toner: {
    nome: 'Tempo de atendimento do toner',
    mede: 'Do alerta do toner à troca, nos toners trocados no período.',
    unidade: 'minutos',
    metaDeFabrica: 2 * DIA,
    limites: [60, 30 * DIA],
    limitesEmTexto: ['1 h', '30 dias'],
    decisao:
      'Deixe toner de reserva nos locais que mais esperam, ou suba o limite da regra do toner para o alerta abrir antes.',
  },
  critico: {
    nome: 'Tempo até reconhecer o Crítico',
    mede: 'Da abertura ao reconhecimento, nos alertas Críticos do período.',
    unidade: 'minutos',
    metaDeFabrica: 30,
    limites: [1, DIA],
    limitesEmTexto: ['1 min', '1 dia'],
    decisao: 'Confira quem pode tratar os alertas e quem recebe o Crítico por e-mail e no celular.',
  },
  disponibilidade: {
    nome: 'Disponibilidade dos ativos',
    mede: 'O tempo de cada ativo sem responder, pelos alertas de ativo offline.',
    unidade: 'por-mil',
    metaDeFabrica: 990,
    limites: [900, 999],
    limitesEmTexto: ['90%', '99,9%'],
    decisao: 'Confira a rede e a energia desses ativos, ou se eles ainda estão em uso.',
  },
  'que-voltam': {
    nome: 'Alertas que voltam',
    mede: 'O mesmo alerta abrindo de novo no mesmo ativo, no período.',
    unidade: 'vezes',
    metaDeFabrica: 3,
    limites: [2, 20],
    limitesEmTexto: ['2', '20 vezes'],
    decisao: 'Verifique o equipamento, ou a duração e a folga da regra, se o alerta não pede ação.',
  },
  'resolucao-das-os': {
    nome: 'Tempo de resolução das OS',
    mede: 'Da abertura à resolução, com a espera pela peça e pelo fornecedor, nas OS resolvidas no período.',
    unidade: 'minutos',
    metaDeFabrica: 3 * DIA,
    limites: [60, 30 * DIA],
    limitesEmTexto: ['1 h', '30 dias'],
    decisao:
      'Veja onde as OS esperam: deixe no estoque as peças que mais faltam, ou cobre os fornecedores que mais demoram.',
  },
  'os-repetidas': {
    nome: 'OS repetidas',
    mede: 'Os ativos com várias OS abertas no período.',
    unidade: 'ordens',
    metaDeFabrica: 2,
    limites: [2, 10],
    limitesEmTexto: ['2', '10 OS'],
    decisao:
      'Confira se o conserto resolveu a causa do problema, ou se o ativo deve ser substituído.',
  },
  'paginas-por-toner': {
    nome: 'Páginas por toner',
    mede: 'As páginas de cada toner trocado no período, pelo total de páginas da impressora, comparadas ao rendimento.',
    unidade: 'por-mil',
    metaDeFabrica: 800,
    limites: [500, 1000],
    limitesEmTexto: ['50%', '100%'],
    decisao: 'Confira a qualidade do consumível e do fornecedor, e a configuração da impressora.',
  },
};

export const indicadorValido = (valor: unknown): valor is Indicador =>
  (INDICADORES as readonly unknown[]).includes(valor);

/** Um dos quatro dos alertas, que a rota dos alertas aceita. */
export const indicadorDosAlertas = (valor: unknown): valor is IndicadorDosAlertas =>
  (INDICADORES_DOS_ALERTAS as readonly unknown[]).includes(valor);

/** Um dos três da operação, que a rota do Operação aceita. */
export const indicadorDaOperacao = (valor: unknown): valor is IndicadorDaOperacao =>
  (INDICADORES_DA_OPERACAO as readonly unknown[]).includes(valor);

export type ConferenciaDaMeta = { ok: true; meta: number } | { ok: false; erro: string };

/** A meta inteira dentro dos limites do indicador, ou a mensagem da recusa. */
export function conferirMeta(indicador: Indicador, valor: unknown): ConferenciaDaMeta {
  const {
    limites: [minimo, maximo],
    limitesEmTexto: [deTexto, ateTexto],
  } = DEFINICOES_DOS_INDICADORES[indicador];
  if (typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo && valor <= maximo)
    return { ok: true, meta: valor };
  return { ok: false, erro: `A meta deve ficar entre ${deTexto} e ${ateTexto}.` };
}
