import { Eye, EyeOff } from 'lucide-react';
import { type Ref, useState } from 'react';
import { Input, TextField, type TextFieldProps } from 'react-aria-components';
import { BotaoDeIcone } from '../../icones/Icone.tsx';
import estilos from './Campo.module.css';
import { DescricaoDoCampo, ErroDoCampo, RotuloDoCampo } from './partes.tsx';

export interface PropsDoCampoDeSenha
  extends Omit<
    TextFieldProps,
    'children' | 'className' | 'type' | 'isRequired' | 'isInvalid' | 'autoComplete'
  > {
  rotulo: string;
  /**
   * Para os gerenciadores de senha: `current-password` na entrada e na senha atual,
   * `new-password` na senha nova.
   */
  autoComplete: 'current-password' | 'new-password';
  descricao?: string;
  obrigatorio?: boolean;
  /** Erro vindo de fora do campo (da API ou da regra da senha). */
  erro?: string;
  className?: string;
  /** A caixa de entrada, para quem precisa pôr o foco nela (como depois de uma recusa). */
  ref?: Ref<HTMLInputElement>;
}

/**
 * Campo de senha com "Mostrar senha". O clique no botão não tira o foco da digitação; pelo teclado,
 * o foco fica no próprio botão, como em qualquer botão.
 */
export function CampoDeSenha({
  rotulo,
  autoComplete,
  descricao,
  obrigatorio = false,
  erro,
  className,
  ref,
  ...resto
}: PropsDoCampoDeSenha) {
  const [visivel, definirVisivel] = useState(false);
  return (
    <TextField
      {...resto}
      type={visivel ? 'text' : 'password'}
      autoComplete={autoComplete}
      isRequired={obrigatorio}
      isInvalid={erro ? true : undefined}
      className={[estilos.campo, className].filter(Boolean).join(' ')}
    >
      <RotuloDoCampo rotulo={rotulo} obrigatorio={obrigatorio} />
      <div className={estilos.comAcao}>
        <Input
          ref={ref}
          className={`${estilos.entrada} ${estilos.entradaComAcao}`}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <BotaoDeIcone
          icone={visivel ? EyeOff : Eye}
          rotulo={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          comDica={false}
          preventFocusOnPress
          onPress={() => definirVisivel((atual) => !atual)}
          className={estilos.acaoDoCampo}
        />
      </div>
      {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
      <ErroDoCampo erro={erro} />
    </TextField>
  );
}
