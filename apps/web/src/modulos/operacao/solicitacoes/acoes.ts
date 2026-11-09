// As ações de uma solicitação (spec modulo-operacao, "Tela das solicitações" e "Ficha da
// solicitação"; change p4d-solicitacoes, design, decisão 8): as que a situação e o tipo permitem a
// quem atende todos os locais dela, as mesmas na linha da lista e na ficha.
import {
  ROTULOS_DOS_TIPOS_DE_SOLICITACAO,
  recusaDaSituacao,
  type SituacaoDeDestino,
  situacaoPendente,
} from '@grafite/domain';
import type { Solicitacao } from './consultas.ts';

export type AcaoDaSolicitacao =
  | 'abrir-os'
  | 'alterar'
  | 'pedido'
  | 'entrega'
  | 'conclusao'
  | 'situacao'
  | 'cancelamento';

export const ROTULOS_DAS_ACOES: Record<AcaoDaSolicitacao, string> = {
  'abrir-os': 'Abrir OS',
  alterar: 'Alterar',
  pedido: 'Pedir ao fornecedor',
  entrega: 'Entregar',
  conclusao: 'Concluir',
  situacao: 'Mudar a situação',
  cancelamento: 'Cancelar',
};

/** As situações a que o lote pode levar, na ordem do atendimento. */
export const SITUACOES_DE_DESTINO: readonly SituacaoDeDestino[] = [
  'em-atendimento',
  'aguardando-entrega',
  'concluida',
  'cancelada',
];

/**
 * As situações a que a solicitação pode passar por "Mudar a situação", com as regras do lote: o
 * conserto não fica Aguardando entrega, e o toner se conclui assim só com o pedido ao fornecedor.
 */
export const situacoesPossiveis = (solicitacao: Solicitacao): SituacaoDeDestino[] =>
  SITUACOES_DE_DESTINO.filter(
    (nova) =>
      recusaDaSituacao({
        tipo: solicitacao.tipo,
        atual: solicitacao.situacao,
        nova,
        noLote: true,
        comFornecedor: solicitacao.fornecedor !== null,
      }) === null,
  );

/**
 * As ações da solicitação pendente que a conta atende, na ordem da tela: a OS do conserto, para quem
 * também atende as OS; a alteração; o pedido ao fornecedor, no toner e no equipamento; a entrega,
 * no toner com item pendente; a conclusão, no conserto e no equipamento, porque o toner se conclui
 * pela entrega; a mudança da situação; e o cancelamento. O conserto que segue a OS não tem nenhuma:
 * ele muda só pela OS (change p4e-ordens-de-servico).
 */
export function acoesDaSolicitacao(
  solicitacao: Solicitacao,
  { abreOS = false }: { abreOS?: boolean } = {},
): AcaoDaSolicitacao[] {
  if (!solicitacao.permite.atender || !situacaoPendente(solicitacao.situacao)) return [];
  if (solicitacao.ordem !== null) return [];
  const comItemPendente = solicitacao.impressoras.some(({ itens }) =>
    itens.some(({ entrega }) => entrega === null),
  );
  const acoes: AcaoDaSolicitacao[] = [];
  if (solicitacao.tipo === 'conserto' && abreOS) acoes.push('abrir-os');
  acoes.push('alterar');
  if (solicitacao.tipo !== 'conserto') acoes.push('pedido');
  if (solicitacao.tipo === 'toner' && comItemPendente) acoes.push('entrega');
  if (solicitacao.tipo !== 'toner') acoes.push('conclusao');
  if (situacoesPossiveis(solicitacao).length > 0) acoes.push('situacao');
  acoes.push('cancelamento');
  return acoes;
}

/** "Solicitação 45 · Conserto · Joana Prado", no alto de cada gaveta. */
export const resumoDaSolicitacao = ({ numero, tipo, pessoa }: Solicitacao) =>
  `Solicitação ${numero} · ${ROTULOS_DOS_TIPOS_DE_SOLICITACAO[tipo]} · ${pessoa.nome}`;
