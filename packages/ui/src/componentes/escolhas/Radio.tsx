import type { ReactNode } from 'react';
import {
  Radio as RadioDoReactAria,
  RadioGroup,
  type RadioGroupProps,
  type RadioProps,
} from 'react-aria-components';
import estilosDoCampo from '../campo/Campo.module.css';
import { DescricaoDoCampo, ErroDoCampo, RotuloDoCampo } from '../campo/partes.tsx';
import estilos from './Escolhas.module.css';

export interface PropsDoGrupoDeRadios
  extends Omit<RadioGroupProps, 'children' | 'className' | 'isRequired' | 'isInvalid'> {
  rotulo: string;
  children: ReactNode;
  descricao?: string;
  obrigatorio?: boolean;
  /** Erro vindo de fora do grupo (da API, por exemplo). */
  erro?: string;
  className?: string;
}

/** Escolha única entre poucas opções visíveis. As setas movem a escolha. */
export function GrupoDeRadios({
  rotulo,
  children,
  descricao,
  obrigatorio = false,
  erro,
  className,
  ...resto
}: PropsDoGrupoDeRadios) {
  return (
    <RadioGroup
      {...resto}
      isRequired={obrigatorio}
      isInvalid={erro ? true : undefined}
      className={[estilosDoCampo.campo, className].filter(Boolean).join(' ')}
    >
      <RotuloDoCampo rotulo={rotulo} obrigatorio={obrigatorio} />
      <div className={estilos.opcoesDoGrupo}>{children}</div>
      {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
      <ErroDoCampo erro={erro} tipo="escolha" />
    </RadioGroup>
  );
}

export interface PropsDoRadio extends Omit<RadioProps, 'children' | 'className'> {
  children: ReactNode;
  className?: string;
}

export function Radio({ children, className, ...resto }: PropsDoRadio) {
  return (
    <RadioDoReactAria {...resto} className={[estilos.escolha, className].filter(Boolean).join(' ')}>
      <span className={estilos.bolinha} data-parte="bolinha" />
      {children}
    </RadioDoReactAria>
  );
}
