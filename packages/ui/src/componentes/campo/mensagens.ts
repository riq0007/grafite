// Mensagens de validação em pt-BR. A mensagem nativa do navegador vem no idioma dele,
// então as falhas nativas são traduzidas aqui; as mensagens próprias passam como estão.

export type TipoDeCampo = 'texto' | 'escolha';

export function mensagemDeValidacao(
  detalhes: ValidityState,
  erros: string[],
  tipo: TipoDeCampo = 'texto',
): string {
  if (detalhes.customError) return erros.join(' ');
  if (detalhes.valueMissing) {
    return tipo === 'escolha' ? 'Escolha uma opção.' : 'Preencha este campo.';
  }
  if (detalhes.typeMismatch || detalhes.patternMismatch) return 'Formato inválido.';
  if (detalhes.tooShort) return 'Texto curto demais.';
  if (detalhes.tooLong) return 'Texto longo demais.';
  if (detalhes.rangeUnderflow || detalhes.rangeOverflow || detalhes.stepMismatch) {
    return 'Valor fora do intervalo permitido.';
  }
  return 'Valor inválido.';
}
