// As ações de cada OS (spec modulo-operacao, "Ficha da ordem de serviço" e "Tela das ordens de
// serviço"; change p4e-ordens-de-servico, design, decisão 8): as que a situação permite a quem
// atende, as mesmas na ficha e no menu da linha, e o resumo que a gaveta de cada uma mostra.
import { type AcaoNaOrdem, recusaNaOrdem, SITUACOES_DE_ATENDIMENTO } from '@grafite/domain';
import { ativoEmTexto } from './apresentacao.ts';
import type { OrdemDeServico } from './consultas.ts';

export type AcaoDaOrdem =
  | 'situacao'
  | 'peca'
  | 'resolver'
  | 'corrigir'
  | 'encerrar-sem-resolver'
  | 'reabrir'
  | 'encerrar';

export const ROTULOS_DAS_ACOES_DA_ORDEM: Record<AcaoDaOrdem, string> = {
  situacao: 'Mudar a situação',
  peca: 'Lançar peça',
  resolver: 'Resolver',
  corrigir: 'Corrigir',
  'encerrar-sem-resolver': 'Encerrar sem resolver',
  reabrir: 'Reabrir',
  encerrar: 'Encerrar',
};

/** A ação do domínio de cada uma; a mudança da situação vale se alguma situação nova vale. */
const NO_DOMINIO: Record<Exclude<AcaoDaOrdem, 'situacao'>, AcaoNaOrdem> = {
  peca: { acao: 'lancar-peca' },
  resolver: { acao: 'resolver' },
  corrigir: { acao: 'corrigir' },
  'encerrar-sem-resolver': { acao: 'encerrar-sem-resolver' },
  reabrir: { acao: 'reabrir' },
  encerrar: { acao: 'encerrar' },
};

const NA_ORDEM_DA_FICHA: readonly AcaoDaOrdem[] = [
  'situacao',
  'peca',
  'resolver',
  'corrigir',
  'encerrar-sem-resolver',
  'reabrir',
  'encerrar',
];

/** As situações a que "Mudar a situação" leva a OS: as de atendimento, menos a em que ela está. */
export const situacoesPossiveisDaOrdem = (ordem: Pick<OrdemDeServico, 'situacao'>) =>
  SITUACOES_DE_ATENDIMENTO.filter(
    (nova) => recusaNaOrdem(ordem.situacao, { acao: 'mudar', nova }) === null,
  );

/** As ações que a situação da OS permite, na ordem da ficha; nenhuma a quem não atende. */
export function acoesDaOrdem(ordem: Pick<OrdemDeServico, 'situacao' | 'permite'>): AcaoDaOrdem[] {
  if (!ordem.permite.atender) return [];
  return NA_ORDEM_DA_FICHA.filter((acao) =>
    acao === 'situacao'
      ? situacoesPossiveisDaOrdem(ordem).length > 0
      : recusaNaOrdem(ordem.situacao, NO_DOMINIO[acao]) === null,
  );
}

/** "OS 12 · NB-0031 · Dell Latitude 5440", no topo da gaveta de cada ação. */
export const resumoDaOrdem = (ordem: Pick<OrdemDeServico, 'numero' | 'ativo'>) =>
  `OS ${ordem.numero} · ${ativoEmTexto(ordem)}`;
