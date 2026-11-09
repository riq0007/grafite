import type { Ref } from 'react';
import { Input, TextField, type TextFieldProps } from 'react-aria-components';
import estilos from './Campo.module.css';
import { DescricaoDoCampo, ErroDoCampo, RotuloDoCampo } from './partes.tsx';

export interface PropsDoCampoDeTexto
  extends Omit<TextFieldProps, 'children' | 'className' | 'isRequired' | 'isInvalid'> {
  /** Rótulo visível; o texto de exemplo nunca o substitui. */
  rotulo: string;
  descricao?: string;
  obrigatorio?: boolean;
  /** Erro vindo de fora do campo (da API, por exemplo). */
  erro?: string;
  placeholder?: string;
  className?: string;
  /** A caixa de entrada, para quem precisa pôr o foco nela (como depois de uma recusa). */
  ref?: Ref<HTMLInputElement>;
}

export function CampoDeTexto({
  rotulo,
  descricao,
  obrigatorio = false,
  erro,
  placeholder,
  className,
  ref,
  ...resto
}: PropsDoCampoDeTexto) {
  return (
    <TextField
      {...resto}
      isRequired={obrigatorio}
      isInvalid={erro ? true : undefined}
      className={[estilos.campo, className].filter(Boolean).join(' ')}
    >
      <RotuloDoCampo rotulo={rotulo} obrigatorio={obrigatorio} />
      <Input ref={ref} className={estilos.entrada} placeholder={placeholder} />
      {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
      <ErroDoCampo erro={erro} />
    </TextField>
  );
}
