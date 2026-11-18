import { Input, TextField, type TextFieldProps } from 'react-aria-components';
import estilos from './Campo.module.css';

export interface PropsDoNumeroNaFrase
  extends Omit<
    TextFieldProps,
    'children' | 'className' | 'value' | 'onChange' | 'isInvalid' | 'inputMode'
  > {
  /** O que o número é, para o leitor de tela, como "Tempo da resposta": a frase já o diz. */
  rotulo: string;
  valor: string;
  /** O texto só com os algarismos, até o `algarismos`. */
  aoMudar: (valor: string) => void;
  /** Quantos algarismos cabem, como os três do 1 a 999. */
  algarismos: number;
  /** Marcado com a recusa, que quem escreve a frase mostra embaixo e liga pelo `aria-describedby`. */
  invalido?: boolean;
  className?: string;
}

/**
 * Um número inteiro dentro de uma frase, como o prazo do tipo ("Responde em 30 min"): a caixa
 * estreita, em mono, sem rótulo à vista, que só aceita algarismos.
 */
export function NumeroNaFrase({
  rotulo,
  valor,
  aoMudar,
  algarismos,
  invalido = false,
  className,
  ...resto
}: PropsDoNumeroNaFrase) {
  return (
    <TextField
      {...resto}
      aria-label={rotulo}
      value={valor}
      onChange={(texto) => aoMudar(texto.replace(/\D/gu, '').slice(0, algarismos))}
      isInvalid={invalido || undefined}
      className={[estilos.numeroNaFrase, className].filter(Boolean).join(' ')}
    >
      <Input inputMode="numeric" className={estilos.entradaDoNumeroNaFrase} />
    </TextField>
  );
}
