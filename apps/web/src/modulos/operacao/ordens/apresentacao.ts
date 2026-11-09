// As OS em texto (spec modulo-operacao, "Tela das ordens de serviço"; change p4e-ordens-de-servico,
// design, decisão 8): a situação com o tipo do rótulo e o ativo pelo patrimônio e pelo nome, com o
// texto que a cor e o ícone só reforçam.
import { ROTULOS_DAS_SITUACOES_DA_ORDEM, type SituacaoDaOrdem } from '@grafite/domain';
import type { Situacao } from '@grafite/ui';
import type { OrdemDeServico } from './consultas.ts';

/** A situação da OS, com o tipo do rótulo. */
export const SITUACOES_DA_ORDEM_NA_TELA: Record<
  SituacaoDaOrdem,
  { tipo: Situacao; texto: string }
> = {
  aberta: { tipo: 'info', texto: ROTULOS_DAS_SITUACOES_DA_ORDEM.aberta },
  'em-atendimento': {
    tipo: 'atencao',
    texto: ROTULOS_DAS_SITUACOES_DA_ORDEM['em-atendimento'],
  },
  'aguardando-peca': {
    tipo: 'atencao',
    texto: ROTULOS_DAS_SITUACOES_DA_ORDEM['aguardando-peca'],
  },
  'aguardando-fornecedor': {
    tipo: 'atencao',
    texto: ROTULOS_DAS_SITUACOES_DA_ORDEM['aguardando-fornecedor'],
  },
  resolvida: { tipo: 'sucesso', texto: ROTULOS_DAS_SITUACOES_DA_ORDEM.resolvida },
  encerrada: { tipo: 'neutra', texto: ROTULOS_DAS_SITUACOES_DA_ORDEM.encerrada },
};

/** "NB-0031 · Dell Latitude 5440", ou só o nome, sem o patrimônio. */
export const ativoEmTexto = ({ ativo }: Pick<OrdemDeServico, 'ativo'>) =>
  [ativo.patrimonio, ativo.rotulo].filter(Boolean).join(' · ');

/** "Dell Assistência · OS DL-5521", ou só o fornecedor, sem o número; nulo sem o fornecedor. */
export const fornecedorDaOrdemEmTexto = ({
  fornecedor,
  osDoFornecedor,
}: Pick<OrdemDeServico, 'fornecedor' | 'osDoFornecedor'>) =>
  fornecedor
    ? [fornecedor.nome, osDoFornecedor ? `OS ${osDoFornecedor}` : null].filter(Boolean).join(' · ')
    : null;

/**
 * O nome de cada mudança no histórico, que vem da mais nova para a mais antiga: a Em atendimento
 * depois da Resolvida é a reabertura, e a Encerrada depois de uma em aberto, o encerramento sem
 * resolver.
 */
export function rotuloDaMudanca(historico: OrdemDeServico['historico'], indice: number): string {
  const mudanca = historico[indice];
  const anterior = historico[indice + 1];
  if (!mudanca) return '';
  if (mudanca.situacao === 'em-atendimento' && anterior?.situacao === 'resolvida') {
    return 'Reaberta';
  }
  if (mudanca.situacao === 'encerrada' && anterior && anterior.situacao !== 'resolvida') {
    return 'Encerrada sem resolver';
  }
  return ROTULOS_DAS_SITUACOES_DA_ORDEM[mudanca.situacao];
}
