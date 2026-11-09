// O estado de cada valor de um ativo (spec cadastro-de-ativos; design do P1b, decisão 5): de onde
// veio, quando e por quem, e a trava, que protege o valor conferido à mão da importação (P1e) e da
// coleta (P2). Funções puras: devolvem o estado novo, sem mudar o recebido.
import type { PoliticaDeEscrita } from './catalogo.ts';

export const ORIGENS_DO_VALOR = ['manual', 'planilha', 'coleta', 'api', 'agente'] as const;
export type OrigemDoValor = (typeof ORIGENS_DO_VALOR)[number];

export const ROTULOS_DAS_ORIGENS = {
  manual: 'Manual',
  planilha: 'Planilha',
  coleta: 'Coleta',
  api: 'API',
  agente: 'Agente do GLPI',
} as const satisfies Record<OrigemDoValor, string>;

/**
 * O estado de um campo: a última gravação do valor e a trava. Um campo travado antes de ter valor
 * tem a trava sem a origem, o momento e o autor.
 */
export interface EstadoDoCampo {
  origem: OrigemDoValor | null;
  /** ISO 8601. */
  momento: string | null;
  /** A conta que gravou, quando houver. */
  autorId: string | null;
  /** O coletor que gravou, na gravação pela coleta (change p2b-impressoras-por-snmp). */
  coletorId?: string | null;
  trava: boolean;
}

export type EstadoDosCampos = Readonly<Record<string, EstadoDoCampo>>;

/** Registra a gravação das chaves, mantendo a trava de cada uma; a da coleta guarda o coletor. */
export function registrarGravacao(
  estado: EstadoDosCampos,
  chaves: readonly string[],
  {
    origem,
    momento,
    autorId,
    coletorId = null,
  }: { origem: OrigemDoValor; momento: string; autorId: string | null; coletorId?: string | null },
): Record<string, EstadoDoCampo> {
  const novo: Record<string, EstadoDoCampo> = { ...estado };
  for (const chave of chaves) {
    novo[chave] = {
      origem,
      momento,
      autorId,
      ...(coletorId ? { coletorId } : {}),
      trava: estado[chave]?.trava ?? false,
    };
  }
  return novo;
}

/**
 * Liga e desliga as travas pedidas, com ou sem valor, sem mudar o momento nem o autor do valor.
 * Destravar um campo que nunca foi gravado tira o estado dele.
 */
export function aplicarTravas(
  estado: EstadoDosCampos,
  travas: Readonly<Record<string, boolean>>,
): Record<string, EstadoDoCampo> {
  const novo: Record<string, EstadoDoCampo> = { ...estado };
  for (const [chave, trava] of Object.entries(travas)) {
    const atual = novo[chave];
    if (atual) {
      if (!trava && atual.origem === null) delete novo[chave];
      else novo[chave] = { ...atual, trava };
    } else if (trava) {
      novo[chave] = { origem: null, momento: null, autorId: null, trava: true };
    }
  }
  return novo;
}

/**
 * Se a origem pode gravar o campo: a gravação manual sempre pode; as outras não mudam um campo
 * travado nem um campo só manual.
 */
export function podeGravar(
  definicao: { escrita: PoliticaDeEscrita },
  estado: EstadoDoCampo | undefined,
  origem: OrigemDoValor,
): boolean {
  if (origem === 'manual') return true;
  return definicao.escrita !== 'manual' && !estado?.trava;
}
