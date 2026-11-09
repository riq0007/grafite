// O endereço das solicitações (spec modulo-operacao, "Tela das solicitações" e "Formulários das
// solicitações"; change p4d-solicitacoes, design, decisão 8), na query string: a busca, a situação,
// com as pendentes quando ela não está, o tipo e o local, e a nova solicitação aberta, pelo tipo,
// com a impressora ou o ativo da ficha de onde ela veio, para a busca e a ficha do ativo abrirem a
// gaveta pelo endereço.
import {
  ROTULOS_DAS_SITUACOES_DA_SOLICITACAO,
  ROTULOS_DOS_TIPOS_DE_SOLICITACAO,
  SITUACOES_DA_SOLICITACAO,
  type SituacaoDaSolicitacao,
  TIPOS_DE_SOLICITACAO,
  type TipoDeSolicitacao,
} from '@grafite/domain';

/** A situação do filtro: sem ela, as pendentes; "todas" traz também as encerradas. */
export type SituacaoDoFiltroDasSolicitacoes = 'todas' | SituacaoDaSolicitacao;

export interface FiltrosDasSolicitacoes {
  /** O número, quem pediu, a impressora ou o ativo e a OS do fornecedor. */
  busca?: string;
  situacao?: SituacaoDoFiltroDasSolicitacoes;
  tipo?: TipoDeSolicitacao;
  /** O local, com os de dentro, entre os locais da solicitação. */
  local?: string;
  /** A nova solicitação aberta na gaveta, pelo tipo. */
  nova?: TipoDeSolicitacao;
  /** A impressora do toner ou o ativo do conserto, quando a nova vem da ficha do ativo. */
  ativo?: string;
}

/** O filtro da situação: as pendentes primeiro, que valem sem nada no endereço. */
export const PENDENTES = 'pendentes';

export const OPCOES_DA_SITUACAO = [
  { id: PENDENTES, rotulo: 'Pendentes' },
  ...SITUACOES_DA_SOLICITACAO.map((id) => ({
    id,
    rotulo: ROTULOS_DAS_SITUACOES_DA_SOLICITACAO[id],
  })),
  { id: 'todas', rotulo: 'Todas' },
];

export const OPCOES_DO_TIPO = TIPOS_DE_SOLICITACAO.map((id) => ({
  id,
  rotulo: ROTULOS_DOS_TIPOS_DE_SOLICITACAO[id],
}));

/** Um id do endereço: as letras, os números e o hífen dos ids, e nada mais. */
const ID = /^[\w-]{1,64}$/;

const id = (valor: unknown) => (typeof valor === 'string' && ID.test(valor) ? valor : undefined);

const conhecido = <T extends string>(lista: readonly T[], valor: unknown): valor is T =>
  (lista as readonly unknown[]).includes(valor);

const SITUACOES_DO_FILTRO: readonly SituacaoDoFiltroDasSolicitacoes[] = [
  'todas',
  ...SITUACOES_DA_SOLICITACAO,
];

export function validarFiltrosDasSolicitacoes(
  busca: Record<string, unknown>,
): FiltrosDasSolicitacoes {
  const filtros: FiltrosDasSolicitacoes = {};
  if (typeof busca.busca === 'string' && busca.busca.trim() !== '') filtros.busca = busca.busca;
  if (conhecido(SITUACOES_DO_FILTRO, busca.situacao)) filtros.situacao = busca.situacao;
  if (conhecido(TIPOS_DE_SOLICITACAO, busca.tipo)) filtros.tipo = busca.tipo;
  const local = id(busca.local);
  if (local) filtros.local = local;
  if (conhecido(TIPOS_DE_SOLICITACAO, busca.nova)) filtros.nova = busca.nova;
  const ativo = id(busca.ativo);
  if (ativo) filtros.ativo = ativo;
  return filtros;
}
