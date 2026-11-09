// Os filtros e a visão em texto (spec tabelas-configuraveis e auditoria; design do P1c, decisões 1 e
// 6): o rótulo do filtro ativo, como "Garantia até: de 01/01/2026 até 31/12/2026", com os valores
// pelo motor de campos e os registros pelo nome; e a definição da visão como a auditoria a guarda,
// com as colunas pelos rótulos.
import { mostrarData } from '../campos/datas.ts';
import { mostrarDecimal } from '../campos/numeros.ts';
import type { DefinicaoDeCampo } from '../campos/tipos.ts';
import { mostrarValor } from '../campos/valores.ts';
import {
  type ColunaDaTabela,
  type DefinicaoDaVisao,
  type FiltroDaVisao,
  ROTULOS_DAS_SITUACOES,
} from './visoes.ts';

/** O que a descrição precisa de uma coluna: o rótulo, o filtro e, se houver, o campo e a unidade. */
export interface ColunaDescrita extends Pick<ColunaDaTabela, 'chave' | 'rotulo' | 'filtro'> {
  campo?: DefinicaoDeCampo;
  /** O sufixo dos números de uma coluna coletada, como "%". */
  unidade?: string;
}

/** O nome de um registro (um tipo, um modelo, uma pessoa, o caminho de um local), se já é conhecido. */
export type NomeDoRegistro = (id: string) => string | undefined;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Um limite do intervalo: o número pelo campo da coluna, com a unidade, ou a data em dd/mm/aaaa. */
function limite(valor: number | string, coluna: ColunaDescrita | undefined): string {
  if (typeof valor === 'number') {
    const numero = coluna?.campo ? mostrarValor(coluna.campo, valor) : mostrarDecimal(valor);
    return `${numero}${coluna?.unidade ?? ''}`;
  }
  return DATA.test(valor) ? mostrarData(valor) : valor;
}

function escolhas(
  valores: readonly string[],
  coluna: ColunaDescrita | undefined,
  nomeDoRegistro: NomeDoRegistro,
): string {
  const opcoes = coluna?.campo?.configuracao?.opcoes ?? [];
  return valores
    .map((id) => opcoes.find((opcao) => opcao.id === id)?.rotulo ?? nomeDoRegistro(id) ?? '…')
    .join(', ');
}

/**
 * O operador e o valor do filtro em texto (change filtros-e-barra-da-tabela, design, decisão 3): o
 * operador à parte, como "contém", quando ele não é o próprio valor, como "está vazio" ou o
 * intervalo "de 01/01/2026 até 31/12/2026".
 */
export function partesDoFiltro(
  filtro: FiltroDaVisao,
  coluna: ColunaDescrita | undefined,
  nomeDoRegistro: NomeDoRegistro = () => undefined,
): { operador: string | null; valor: string } {
  switch (filtro.operador) {
    case 'contem':
      return { operador: 'contém', valor: filtro.texto };
    case 'vazio':
      return { operador: null, valor: 'está vazio' };
    case 'preenchido':
      return { operador: null, valor: 'está preenchido' };
    case 'entre': {
      const de = filtro.de === undefined ? null : limite(filtro.de, coluna);
      const ate = filtro.ate === undefined ? null : limite(filtro.ate, coluna);
      if (de !== null && ate !== null) return { operador: null, valor: `de ${de} até ${ate}` };
      return { operador: null, valor: de !== null ? `a partir de ${de}` : `até ${ate}` };
    }
    case 'qualquer':
      return {
        operador: 'é qualquer de',
        valor: escolhas(filtro.valores, coluna, nomeDoRegistro),
      };
    case 'em':
      return { operador: 'em', valor: nomeDoRegistro(filtro.local) ?? '…' };
    case 'igual':
      return { operador: 'só em', valor: nomeDoRegistro(filtro.local) ?? '…' };
    case 'situacao':
      return { operador: null, valor: ROTULOS_DAS_SITUACOES[filtro.situacao] };
  }
}

/**
 * O filtro ativo em texto, com o rótulo da coluna, ou a chave quando a coluna não é conhecida. As
 * escolhas dizem só os nomes: "Tipo: Impressora, Switch".
 */
export function descreverFiltro(
  filtro: FiltroDaVisao,
  coluna: ColunaDescrita | undefined,
  nomeDoRegistro: NomeDoRegistro = () => undefined,
): string {
  const rotulo = coluna?.rotulo ?? filtro.chave;
  const { operador, valor } = partesDoFiltro(filtro, coluna, nomeDoRegistro);
  return operador && filtro.operador !== 'qualquer'
    ? `${rotulo}: ${operador} ${valor}`
    : `${rotulo}: ${valor}`;
}

/** A definição como a auditoria a guarda: as colunas pelos rótulos, a ordenação e os filtros. */
export function descreverDefinicao(
  definicao: DefinicaoDaVisao,
  colunas: readonly ColunaDescrita[],
  nomeDoRegistro: NomeDoRegistro = () => undefined,
): { colunas: string[]; ordenacao: string | null; filtros: string[] } {
  const porChave = new Map(colunas.map((coluna) => [coluna.chave, coluna]));
  const rotuloDa = (chave: string) => porChave.get(chave)?.rotulo ?? chave;
  return {
    colunas: definicao.colunas.map(({ chave }) => rotuloDa(chave)),
    ordenacao: definicao.ordenacao
      ? `${rotuloDa(definicao.ordenacao.chave)}, ${definicao.ordenacao.direcao}`
      : null,
    filtros: definicao.filtros.map((filtro) =>
      descreverFiltro(filtro, porChave.get(filtro.chave), nomeDoRegistro),
    ),
  };
}
