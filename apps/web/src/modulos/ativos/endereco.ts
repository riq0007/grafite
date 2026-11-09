// O endereço da tabela dos ativos (design do P1c, decisão 8): o de toda tabela com visões, e os
// links antigos do P1b, com o tipo, o local e a situação, lidos como os filtros equivalentes, que
// valem sobre os da visão até o endereço ser reescrito.
import { type FiltroDaVisao, lerDefinicaoDaVisao, SITUACOES_DO_FILTRO } from '@grafite/domain';
import { lerEnderecoDaTabela } from '../../tabelas/endereco.ts';
import type { EnderecoComLegado } from '../../tabelas/useEstadoDaTabela.ts';
import { type OrigemNoEndereco, origemDoEndereco } from './origem.ts';

/** O endereço da tabela dos ativos, com a origem dela (change relacoes-vivas, decisão 3). */
export type EnderecoDosAtivos = EnderecoComLegado & OrigemNoEndereco;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Os filtros de um link antigo, um por coluna. */
function filtrosDoLinkAntigo(busca: Record<string, unknown>): FiltroDaVisao[] {
  const filtros: FiltroDaVisao[] = [];
  if (typeof busca.tipo === 'string' && /^[\w-]+$/.test(busca.tipo)) {
    filtros.push({ chave: 'ativo.tipo', operador: 'qualquer', valores: [busca.tipo] });
  }
  if (typeof busca.local === 'string' && UUID.test(busca.local)) {
    filtros.push({ chave: 'ativo.local', operador: 'em', local: busca.local.toLowerCase() });
  }
  const situacao = SITUACOES_DO_FILTRO.find((candidata) => candidata === busca.situacao);
  if (situacao) filtros.push({ chave: 'ativo.situacao', operador: 'situacao', situacao });
  return filtros;
}

export function lerEnderecoDosAtivos(busca: Record<string, unknown>): EnderecoDosAtivos {
  const endereco: EnderecoComLegado = lerEnderecoDaTabela(busca);
  const doLink = filtrosDoLinkAntigo(busca);
  // O legado que uma troca levou ao endereço antes da reescrita, como a busca digitada enquanto as
  // visões carregam.
  const leitura =
    busca.legado === undefined
      ? undefined
      : lerDefinicaoDaVisao({ colunas: [], ordenacao: null, filtros: busca.legado });
  const anterior = leitura?.ok ? leitura.definicao.filtros : [];
  const legado = [
    ...anterior.filter((filtro) => !doLink.some((novo) => novo.chave === filtro.chave)),
    ...doLink,
  ];
  const comOrigem = origemDoEndereco(busca);
  return legado.length > 0 ? { ...endereco, legado, ...comOrigem } : { ...endereco, ...comOrigem };
}
