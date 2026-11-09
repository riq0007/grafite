// Os filtros e a ordem das listas dos alertas (spec modulo-alertas, "Lista dos alertas abertos" e
// "Lista dos alertas resolvidos"), na query string: voltar da ficha traz a lista como estava. A
// ordem é a da tabela, que a API recebe pela ordem e pela direção dela.
import { type SeveridadeDoAlerta, severidadeDoAlerta } from '@grafite/domain';
import type { Ordenacao } from '@grafite/ui';

export const COLUNAS_ORDENAVEIS = ['severidade', 'ha', 'ativo', 'alerta'] as const;
export type ColunaOrdenavel = (typeof COLUNAS_ORDENAVEIS)[number];

export interface FiltrosDosAbertos {
  severidade?: SeveridadeDoAlerta;
  regra?: string;
  coluna?: ColunaOrdenavel;
  direcao?: Ordenacao['direcao'];
}

export interface FiltrosDosResolvidos {
  severidade?: SeveridadeDoAlerta;
  regra?: string;
  ativo?: string;
  /** O nome do ativo do filtro, para o rótulo dele, quando vem da ficha. */
  nomeDoAtivo?: string;
}

/** A ordem de fábrica: o mais grave e, na mesma severidade, o mais antigo. */
export const ORDEM_DE_FABRICA: Ordenacao = { coluna: 'severidade', direcao: 'decrescente' };

const texto = (valor: unknown) =>
  typeof valor === 'string' && valor.trim() !== '' ? valor : undefined;

export function validarFiltrosDosAbertos(busca: Record<string, unknown>): FiltrosDosAbertos {
  const filtros: FiltrosDosAbertos = {};
  if (severidadeDoAlerta(busca.severidade)) filtros.severidade = busca.severidade;
  const regra = texto(busca.regra);
  if (regra) filtros.regra = regra;
  if ((COLUNAS_ORDENAVEIS as readonly unknown[]).includes(busca.coluna)) {
    filtros.coluna = busca.coluna as ColunaOrdenavel;
  }
  if (busca.direcao === 'crescente' || busca.direcao === 'decrescente') {
    filtros.direcao = busca.direcao;
  }
  return filtros;
}

export function validarFiltrosDosResolvidos(busca: Record<string, unknown>): FiltrosDosResolvidos {
  const filtros: FiltrosDosResolvidos = {};
  if (severidadeDoAlerta(busca.severidade)) filtros.severidade = busca.severidade;
  const regra = texto(busca.regra);
  if (regra) filtros.regra = regra;
  const ativo = texto(busca.ativo);
  if (ativo) {
    filtros.ativo = ativo;
    const nome = texto(busca.nomeDoAtivo);
    if (nome) filtros.nomeDoAtivo = nome;
  }
  return filtros;
}

/**
 * A ordem da tabela como a API a recebe. "Há" crescente é o mais novo primeiro, como na tela
 * inicial, e a API ordena pelo momento em que abriu: as direções se invertem.
 */
export function ordemDaApi({ coluna, direcao }: Ordenacao): {
  ordem: ColunaOrdenavel;
  direcao: 'asc' | 'desc';
} {
  const ordem = (COLUNAS_ORDENAVEIS as readonly string[]).includes(coluna)
    ? (coluna as ColunaOrdenavel)
    : 'severidade';
  const crescente = direcao === 'crescente';
  if (ordem === 'ha') return { ordem, direcao: crescente ? 'desc' : 'asc' };
  return { ordem, direcao: crescente ? 'asc' : 'desc' };
}
