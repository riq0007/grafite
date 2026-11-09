// A situação de um ativo em texto (spec cadastro-de-ativos): a situação de uso, ou "Inativo". O
// texto diz o estado, e a cor só o acompanha.
import { USOS_DO_ATIVO, type UsoDoAtivo } from '@grafite/domain';
import type { Situacao } from '@grafite/ui';

const TIPO_DO_USO: Record<UsoDoAtivo, Situacao> = {
  'em-uso': 'sucesso',
  'em-estoque': 'neutra',
  'em-manutencao': 'atencao',
};

export function situacaoDoAtivo({
  uso,
  situacao,
}: {
  uso: UsoDoAtivo;
  situacao: 'ativo' | 'inativo';
}): { tipo: Situacao; texto: string } {
  if (situacao === 'inativo') return { tipo: 'neutra', texto: 'Inativo' };
  return {
    tipo: TIPO_DO_USO[uso],
    texto: USOS_DO_ATIVO.find((opcao) => opcao.id === uso)?.rotulo ?? uso,
  };
}
