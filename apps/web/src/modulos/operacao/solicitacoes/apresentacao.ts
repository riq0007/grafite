// As solicitações em texto (spec modulo-operacao, "Tela das solicitações"; change p4d-solicitacoes,
// design, decisão 8): a situação com o tipo do rótulo, o pedido resumido, os locais e o pedido ao
// fornecedor, com o texto que a cor e o ícone só reforçam.
import {
  ROTULOS_DAS_SITUACOES_DA_ORDEM,
  ROTULOS_DAS_SITUACOES_DA_SOLICITACAO,
  resumoDoPedido,
  type SituacaoDaSolicitacao,
  textoDaOrdem,
} from '@grafite/domain';
import type { Situacao } from '@grafite/ui';
import type { Solicitacao } from './consultas.ts';

/** A situação da solicitação, com o tipo do rótulo. */
export const SITUACOES_NA_TELA: Record<SituacaoDaSolicitacao, { tipo: Situacao; texto: string }> = {
  aberta: { tipo: 'info', texto: ROTULOS_DAS_SITUACOES_DA_SOLICITACAO.aberta },
  'em-atendimento': {
    tipo: 'atencao',
    texto: ROTULOS_DAS_SITUACOES_DA_SOLICITACAO['em-atendimento'],
  },
  'aguardando-entrega': {
    tipo: 'atencao',
    texto: ROTULOS_DAS_SITUACOES_DA_SOLICITACAO['aguardando-entrega'],
  },
  concluida: { tipo: 'sucesso', texto: ROTULOS_DAS_SITUACOES_DA_SOLICITACAO.concluida },
  cancelada: { tipo: 'neutra', texto: ROTULOS_DAS_SITUACOES_DA_SOLICITACAO.cancelada },
};

/** A impressora ou o ativo pelo patrimônio, como as pessoas o citam, ou pelo rótulo sem ele. */
export const referenciaDoAtivo = ({
  rotulo,
  patrimonio,
}: {
  rotulo: string;
  patrimonio: string | null;
}) => patrimonio ?? rotulo;

/** "PAT-00412: 1 Preto", "NB-0031: Não liga" ou "2 Notebook". */
export function pedidoEmTexto(solicitacao: Solicitacao): string {
  switch (solicitacao.tipo) {
    case 'toner':
      return resumoDoPedido({
        tipo: 'toner',
        impressoras: solicitacao.impressoras.map(({ ativo, itens }) => ({
          rotulo: referenciaDoAtivo(ativo),
          itens,
        })),
      });
    case 'conserto':
      return resumoDoPedido({
        tipo: 'conserto',
        ativo: solicitacao.ativo ? referenciaDoAtivo(solicitacao.ativo) : '',
        defeito: solicitacao.defeito ?? '',
      });
    case 'equipamento':
      return resumoDoPedido({
        tipo: 'equipamento',
        quantidade: solicitacao.quantidade ?? 0,
        tipoDeAtivo: solicitacao.tipoDeAtivo?.nome ?? '',
      });
  }
}

/** Os caminhos dos locais, com "Sem local" para a impressora ou o ativo que não tem. */
export const locaisEmTexto = ({
  locais,
  semLocal,
}: Pick<Solicitacao, 'locais' | 'semLocal'>): string =>
  [...locais.map(({ caminho }) => caminho), ...(semLocal ? ['Sem local'] : [])].join('; ');

/** "OS 12 · Aguardando peça": a OS que o conserto segue, com a situação dela. */
export const ordemEmTexto = ({ numero, situacao }: NonNullable<Solicitacao['ordem']>): string =>
  `${textoDaOrdem(numero)} · ${ROTULOS_DAS_SITUACOES_DA_ORDEM[situacao]}`;

/** "Locadora Sul · OS 5555", ou nulo sem o pedido ao fornecedor. */
export const fornecedorEmTexto = ({
  fornecedor,
  osDoFornecedor,
}: Pick<Solicitacao, 'fornecedor' | 'osDoFornecedor'>): string | null =>
  fornecedor
    ? [fornecedor.nome, osDoFornecedor ? `OS ${osDoFornecedor}` : null].filter(Boolean).join(' · ')
    : null;
