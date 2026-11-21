import { type Ref, useId } from 'react';
import { Input, TextField, type TextFieldProps } from 'react-aria-components';
import estilos from './Campo.module.css';
import { DescricaoDoCampo, ErroDoCampo, RotuloDoCampo } from './partes.tsx';

/** O contador no fim da caixa, como "20/120" no título do chamado. */
export interface ContadorDoCampo {
  /** Até quantos caracteres o campo vai. */
  maximo: number;
  /** Como o texto se conta, como a regra do campo o conta; sem ela, em caracteres. */
  contar?: (texto: string) => number;
}

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
  /**
   * O contador no fim da caixa, no campo controlado (`value`), como "20/120" no título do
   * transformar em chamado. Acima do máximo, o número fica na cor crítica, e o texto já diz que
   * passou. O leitor de tela ouve o máximo com o campo ("Até 120 caracteres."), e não cada número.
   */
  contador?: ContadorDoCampo;
}

const emCaracteres = (texto: string) => [...texto].length;

export function CampoDeTexto({
  rotulo,
  descricao,
  obrigatorio = false,
  erro,
  placeholder,
  className,
  ref,
  contador,
  ...resto
}: PropsDoCampoDeTexto) {
  const idDoMaximo = useId();
  if (!contador) {
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
  const contados = (contador.contar ?? emCaracteres)(
    typeof resto.value === 'string' ? resto.value : '',
  );
  return (
    <TextField
      {...resto}
      aria-describedby={[resto['aria-describedby'], idDoMaximo].filter(Boolean).join(' ')}
      isRequired={obrigatorio}
      isInvalid={erro ? true : undefined}
      className={[estilos.campo, className].filter(Boolean).join(' ')}
    >
      <RotuloDoCampo rotulo={rotulo} obrigatorio={obrigatorio} />
      <div className={estilos.caixaComContador}>
        <Input ref={ref} className={estilos.entradaComContador} placeholder={placeholder} />
        <span
          className={estilos.contadorDoCampo}
          data-passou={contados > contador.maximo || undefined}
          aria-hidden="true"
        >
          {contados}/{contador.maximo}
        </span>
        <span id={idDoMaximo} className={estilos.paraOLeitor}>
          Até {contador.maximo} caracteres.
        </span>
      </div>
      {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
      <ErroDoCampo erro={erro} />
    </TextField>
  );
}
