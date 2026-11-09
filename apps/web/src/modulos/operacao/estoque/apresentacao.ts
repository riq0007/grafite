// O estoque em texto (spec modulo-operacao; change p4c-estoque, design, decisão 7): o consumível
// pelo nome, pelo tipo e pela cor, as quantidades com os milhares, o mínimo e a situação do saldo,
// com o texto que a cor e o ícone só reforçam.
import {
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  ROTULOS_DAS_SITUACOES_DO_SALDO,
  ROTULOS_DOS_MOTIVOS_DO_AJUSTE,
  ROTULOS_DOS_TIPOS_DE_CONSUMIVEL,
  type SituacaoDoSaldo,
  textoDoContador,
} from '@grafite/domain';
import type { DataHora, Situacao } from '@grafite/ui';
import type { ConsumivelDoEstoque, MovimentoDoEstoque } from './consultas.ts';

/** O ativo como a escolha o mostra: o rótulo e o patrimônio. */
export const rotuloDoAtivo = ({
  rotulo,
  patrimonio,
}: {
  rotulo: string;
  patrimonio: string | null;
}) => (patrimonio ? `${rotulo} · ${patrimonio}` : rotulo);

/** O que vem ao lado do código, como "HP 58A · Toner, Preto". */
export function descricaoDoConsumivel({
  nome,
  tipo,
  cor,
}: Pick<ConsumivelDoEstoque, 'nome' | 'tipo' | 'cor'>): string {
  const doTipo = ROTULOS_DOS_TIPOS_DE_CONSUMIVEL[tipo];
  return [nome, cor ? `${doTipo}, ${ROTULOS_DAS_CORES_DE_CONSUMIVEL[cor]}` : doTipo]
    .filter(Boolean)
    .join(' · ');
}

export const quantidadeEscrita = (quantidade: number) => quantidade.toLocaleString('pt-BR');

/** O mínimo, ou "Sem mínimo", quando ele é 0. */
export const minimoEscrito = (minimo: number) =>
  minimo === 0 ? 'Sem mínimo' : quantidadeEscrita(minimo);

/** A situação do saldo, com o tipo do rótulo. */
export const SITUACOES_DO_SALDO_NA_TELA: Record<
  SituacaoDoSaldo,
  { tipo: Situacao; texto: string }
> = {
  'sem-estoque': { tipo: 'critico', texto: ROTULOS_DAS_SITUACOES_DO_SALDO['sem-estoque'] },
  'abaixo-do-minimo': {
    tipo: 'atencao',
    texto: ROTULOS_DAS_SITUACOES_DO_SALDO['abaixo-do-minimo'],
  },
  'em-estoque': { tipo: 'sucesso', texto: ROTULOS_DAS_SITUACOES_DO_SALDO['em-estoque'] },
};

/** "21/10 14:32": o momento da leitura do contador, no fuso escolhido, sem o ano. */
export const lidoEmCurto = (
  lidoEm: Date,
  dataHora: Pick<DataHora, 'formatarData' | 'formatarHora'>,
) => `${dataHora.formatarData(lidoEm).slice(0, 5)} ${dataHora.formatarHora(lidoEm)}`;

/**
 * O detalhe do tipo da movimentação, em linhas: o fornecedor e a nota, na entrada; o ativo e o
 * contador de páginas, na saída; o motivo, no ajuste.
 */
export function detalheDoMovimento(
  movimento: MovimentoDoEstoque,
  dataHora: Pick<DataHora, 'formatarData' | 'formatarHora'>,
): string[] {
  switch (movimento.tipo) {
    case 'entrada':
      return [
        [movimento.fornecedor?.nome, movimento.notaFiscal && `nota ${movimento.notaFiscal}`]
          .filter(Boolean)
          .join(' · '),
      ];
    case 'saida':
      return [
        ...(movimento.ativo ? [rotuloDoAtivo(movimento.ativo)] : []),
        ...(movimento.contador
          ? [
              textoDoContador(
                movimento.contador.paginas,
                lidoEmCurto(new Date(movimento.contador.lidoEm), dataHora),
              ),
            ]
          : []),
      ];
    case 'transferencia':
      return [];
    case 'ajuste':
      return movimento.motivo ? [ROTULOS_DOS_MOTIVOS_DO_AJUSTE[movimento.motivo]] : [];
  }
}
