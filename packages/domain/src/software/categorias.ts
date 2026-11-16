// As categorias da base de software (spec distribuicao-de-software, "Categorias da base"; change
// software-por-pacote, design, decisão 3): cada organização começa com as 7 do mockup, na ordem
// dele, e a TI as renomeia, ordena e remove depois.

/** As categorias de fábrica, na ordem em que a organização nova as recebe. */
export const CATEGORIAS_DE_SOFTWARE_DE_FABRICA = [
  'Navegadores',
  'Compactadores',
  'Drivers',
  'Escritório',
  'Utilitários',
  'Rede e segurança',
  'Mídia',
] as const;

export const MENSAGENS_DAS_CATEGORIAS = {
  nome: 'Informe o nome da categoria.',
  nomeLongo: 'Use até 40 caracteres.',
  nomeRepetido: 'Já existe uma categoria com este nome.',
  comPacotes: 'Tire os pacotes desta categoria antes de removê-la.',
  ordem: 'A ordem precisa ter todas as categorias, uma vez cada.',
} as const;

/** O nome da categoria, de 1 a 40 caracteres, com os espaços juntados. */
export function conferirNomeDaCategoria(
  nome: unknown,
): { ok: true; nome: string } | { ok: false; erro: string } {
  const limpo = typeof nome === 'string' ? nome.replace(/\s+/g, ' ').trim() : '';
  if (limpo === '') return { ok: false, erro: MENSAGENS_DAS_CATEGORIAS.nome };
  if (limpo.length > 40) return { ok: false, erro: MENSAGENS_DAS_CATEGORIAS.nomeLongo };
  return { ok: true, nome: limpo };
}
