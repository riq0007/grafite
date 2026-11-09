// O estado de uma tabela com visões no endereço (design do P1c, decisão 8): a visão aberta, a busca
// e, só quando diferem da visão, as colunas com a largura, a ordem e os filtros. Recarregar, voltar
// da ficha e abrir o link em outro navegador mostram a mesma tabela.
import {
  type ColunaDaVisao,
  type DefinicaoDaVisao,
  type FiltroDaVisao,
  lerDefinicaoDaVisao,
  mesmaDefinicao,
  type OrdenacaoDaVisao,
  VISAO_DE_FABRICA,
} from '@grafite/domain';

/** As mudanças da tabela sobre a visão aberta, como o endereço as guarda. */
export interface MudancasNoEndereco {
  /** As colunas: `chave:largura,chave,…`. */
  colunas?: string;
  /** A ordem: `chave`, crescente, ou `-chave`, decrescente; vazia, sem ordem. */
  ordem?: string;
  filtros?: FiltroDaVisao[];
}

export interface EnderecoDaTabela extends MudancasNoEndereco {
  /** A visão aberta: o id, ou `fabrica`. */
  visao?: string;
  busca?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUNA = /^([^:,\s]+)(?::(\d+))?$/;

const ORDEM = /^(-?)([^-,\s][^,\s]*)$/;

const definicao = (parte: Partial<DefinicaoDaVisao>): DefinicaoDaVisao => ({
  colunas: [],
  ordenacao: null,
  filtros: [],
  ...parte,
});

export function colunasNoEndereco(colunas: readonly ColunaDaVisao[]): string {
  return colunas
    .map((coluna) =>
      coluna.largura === undefined ? coluna.chave : `${coluna.chave}:${coluna.largura}`,
    )
    .join(',');
}

/**
 * As colunas do endereço, com a largura trazida aos limites e a coluna repetida de fora, ou `null`
 * quando estão mal escritas.
 */
export function colunasDoEndereco(texto: string): ColunaDaVisao[] | null {
  const colunas: ColunaDaVisao[] = [];
  for (const parte of texto.split(',')) {
    const lida = COLUNA.exec(parte);
    if (!lida?.[1]) return null;
    colunas.push(
      lida[2] === undefined ? { chave: lida[1] } : { chave: lida[1], largura: Number(lida[2]) },
    );
  }
  const leitura = lerDefinicaoDaVisao(definicao({ colunas }));
  return leitura.ok ? leitura.definicao.colunas : null;
}

export function ordemNoEndereco(ordenacao: OrdenacaoDaVisao | null): string {
  if (!ordenacao) return '';
  return ordenacao.direcao === 'decrescente' ? `-${ordenacao.chave}` : ordenacao.chave;
}

/** A ordem do endereço; `null` sem ordem, e `undefined` quando está mal escrita. */
export function ordemDoEndereco(texto: string): OrdenacaoDaVisao | null | undefined {
  if (texto === '') return null;
  const lida = ORDEM.exec(texto);
  if (!lida?.[2]) return undefined;
  return { chave: lida[2], direcao: lida[1] === '-' ? 'decrescente' : 'crescente' };
}

/** O endereço da tabela, com o que é válido: o resto fica de fora, como se não estivesse lá. */
export function lerEnderecoDaTabela(busca: Record<string, unknown>): EnderecoDaTabela {
  const endereco: EnderecoDaTabela = {};
  const { visao, colunas, ordem, filtros } = busca;
  if (typeof visao === 'string' && (visao === VISAO_DE_FABRICA || UUID.test(visao))) {
    endereco.visao = visao.toLowerCase();
  }
  // O endereço digitado com só algarismos chega como número.
  const texto = typeof busca.busca === 'number' ? String(busca.busca) : busca.busca;
  if (typeof texto === 'string' && texto.trim() !== '') endereco.busca = texto;
  if (typeof colunas === 'string') {
    const lidas = colunasDoEndereco(colunas);
    if (lidas) endereco.colunas = colunasNoEndereco(lidas);
  }
  if (typeof ordem === 'string') {
    const lida = ordemDoEndereco(ordem);
    if (lida !== undefined) endereco.ordem = ordemNoEndereco(lida);
  }
  if (filtros !== undefined) {
    const leitura = lerDefinicaoDaVisao({ colunas: [], ordenacao: null, filtros });
    if (leitura.ok) endereco.filtros = leitura.definicao.filtros;
  }
  return endereco;
}

/** A definição da visão com as mudanças do endereço no lugar das partes dela. */
export function definicaoComMudancas(
  base: DefinicaoDaVisao,
  mudancas: MudancasNoEndereco,
): DefinicaoDaVisao {
  const colunas = mudancas.colunas === undefined ? null : colunasDoEndereco(mudancas.colunas);
  const ordem = mudancas.ordem === undefined ? undefined : ordemDoEndereco(mudancas.ordem);
  return {
    colunas: colunas ?? base.colunas,
    ordenacao: ordem === undefined ? base.ordenacao : ordem,
    filtros: mudancas.filtros ?? base.filtros,
  };
}

/** As mudanças da tabela sobre a visão: cada parte só quando difere da visão. */
export function mudancasSobre(
  base: DefinicaoDaVisao,
  tabela: DefinicaoDaVisao,
): MudancasNoEndereco {
  const mudancas: MudancasNoEndereco = {};
  if (
    !mesmaDefinicao(definicao({ colunas: base.colunas }), definicao({ colunas: tabela.colunas }))
  ) {
    mudancas.colunas = colunasNoEndereco(tabela.colunas);
  }
  if (
    !mesmaDefinicao(
      definicao({ ordenacao: base.ordenacao }),
      definicao({ ordenacao: tabela.ordenacao }),
    )
  ) {
    mudancas.ordem = ordemNoEndereco(tabela.ordenacao);
  }
  if (
    !mesmaDefinicao(definicao({ filtros: base.filtros }), definicao({ filtros: tabela.filtros }))
  ) {
    mudancas.filtros = tabela.filtros;
  }
  return mudancas;
}

/**
 * A tabela com as colunas, os filtros e a ordem da visão que deixaram de valer (o campo inativado),
 * de volta no lugar deles: a tabela não os mostra, mas a mudança e a visão salva não os perdem.
 */
export function comAsIndisponiveis(
  tabela: DefinicaoDaVisao,
  base: DefinicaoDaVisao,
  disponiveis: ReadonlySet<string>,
): DefinicaoDaVisao {
  const colunas = [...tabela.colunas];
  base.colunas.forEach((coluna, indice) => {
    if (disponiveis.has(coluna.chave) || colunas.some((outra) => outra.chave === coluna.chave)) {
      return;
    }
    // Logo depois da coluna que vinha antes dela na visão e ainda está na tabela.
    const anteriores = base.colunas.slice(0, indice).map((anterior) => anterior.chave);
    const depoisDe = colunas.findLastIndex((outra) => anteriores.includes(outra.chave));
    colunas.splice(depoisDe + 1, 0, { ...coluna });
  });
  const filtros = [
    ...tabela.filtros,
    ...base.filtros.filter(
      (filtro) =>
        !disponiveis.has(filtro.chave) &&
        !tabela.filtros.some((outro) => outro.chave === filtro.chave),
    ),
  ];
  const ordemIndisponivel = base.ordenacao && !disponiveis.has(base.ordenacao.chave);
  return {
    colunas,
    ordenacao: tabela.ordenacao ?? (ordemIndisponivel ? base.ordenacao : null),
    filtros,
  };
}
