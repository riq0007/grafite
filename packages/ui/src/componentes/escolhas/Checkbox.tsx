import type { ReactNode } from 'react';
import {
  Checkbox as CheckboxDoReactAria,
  CheckboxGroup,
  type CheckboxGroupProps,
  type CheckboxProps,
} from 'react-aria-components';
import estilosDoCampo from '../campo/Campo.module.css';
import { DescricaoDoCampo, ErroDoCampo, RotuloDoCampo } from '../campo/partes.tsx';
import estilos from './Escolhas.module.css';

export interface PropsDoCheckbox extends Omit<CheckboxProps, 'children' | 'className'> {
  children: ReactNode;
  className?: string;
}

/** Caixa de marcação com texto próprio; o estado misto serve ao "marcar todos". */
export function Checkbox({ children, className, ...resto }: PropsDoCheckbox) {
  return (
    <CheckboxDoReactAria
      {...resto}
      className={[estilos.escolha, className].filter(Boolean).join(' ')}
    >
      {({ isSelected, isIndeterminate }) => (
        <>
          <span className={estilos.caixa} data-parte="caixa">
            {/* A marca é desenho do controle, não ícone: traço próprio para 16 px. */}
            {(isSelected || isIndeterminate) && (
              <svg viewBox="0 0 16 16" className={estilos.marca} aria-hidden="true">
                <path d={isIndeterminate ? 'M4.5 8h7' : 'M4 8.5 7 11.5 12 5'} />
              </svg>
            )}
          </span>
          {children}
        </>
      )}
    </CheckboxDoReactAria>
  );
}

export interface PropsDoGrupoDeCheckboxes
  extends Omit<CheckboxGroupProps, 'children' | 'className' | 'isRequired' | 'isInvalid'> {
  rotulo: string;
  /** Os checkboxes do grupo, cada um com o seu `value`. */
  children: ReactNode;
  /** Texto de apoio abaixo das opções, ligado ao grupo para o leitor de tela. */
  descricao?: string;
  /** A recusa da escolha, abaixo das opções e ligada ao grupo. */
  erro?: string;
  className?: string;
}

/** Várias opções ligadas ou desligadas sob um nome só, como as severidades que viram aviso. */
export function GrupoDeCheckboxes({
  rotulo,
  children,
  descricao,
  erro,
  className,
  ...resto
}: PropsDoGrupoDeCheckboxes) {
  return (
    <CheckboxGroup
      {...resto}
      isInvalid={erro ? true : undefined}
      className={[estilosDoCampo.campo, className].filter(Boolean).join(' ')}
    >
      <RotuloDoCampo rotulo={rotulo} />
      <div className={estilos.opcoesDoGrupo}>{children}</div>
      {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
      <ErroDoCampo erro={erro} tipo="escolha" />
    </CheckboxGroup>
  );
}
