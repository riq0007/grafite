// O resultado de cada categoria da comparação e da restauração em texto (spec
// comparacao-e-restauracao-do-control-id): com exatamente um, o singular; com zero ou mais de um, o
// plural, como se fala.
import type { OperacaoDoControlId } from './consultas.ts';

/** A quantidade com a palavra no singular só quando ela é um. */
const contagem = (quantos: unknown, singular: string, plural: string) => {
  const numero = Number(quantos ?? 0);
  return `${numero} ${numero === 1 ? singular : plural}`;
};

/** O resultado de uma categoria em texto, conforme o tipo da operação. */
export function textoDaCategoria(
  tipo: OperacaoDoControlId['tipo'],
  categoria: Record<string, unknown>,
): string {
  const rotulo = String(categoria.rotulo ?? categoria.categoria);
  if (categoria.situacao === 'pulado') return `${rotulo}: não escolhida`;
  if (tipo === 'comparacao') {
    const partes = [
      contagem(categoria.iguais, 'igual', 'iguais'),
      `${Number(categoria.soNoBackup ?? 0)} só no backup`,
      `${Number(categoria.soNoControle ?? 0)} só no controle`,
      contagem(categoria.divergentes, 'divergente', 'divergentes'),
    ];
    return `${rotulo}: ${partes.join(', ')}${categoria.erro ? ` (${String(categoria.erro)})` : ''}`;
  }
  const partes = [
    contagem(categoria.criados, 'criado', 'criados'),
    contagem(categoria.ignorados, 'já existia', 'já existiam'),
    ...(Number(categoria.erros ?? 0) > 0 ? [`${categoria.erros} com erro`] : []),
  ];
  return `${rotulo}: ${partes.join(', ')}`;
}
