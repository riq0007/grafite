// Partes comuns a todo campo de formulário: rótulo, descrição e erro.
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { FieldError, Label, Text } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import estilos from './Campo.module.css';
import { mensagemDeValidacao, type TipoDeCampo } from './mensagens.ts';

export interface PropsDoRotulo {
  rotulo: string;
  obrigatorio?: boolean;
}

/**
 * Rótulo visível do campo. A marca "obrigatório" é só visual: o leitor de tela já
 * anuncia a obrigatoriedade pelo próprio campo, e repetir viraria ruído.
 */
export function RotuloDoCampo({ rotulo, obrigatorio = false }: PropsDoRotulo) {
  return (
    <Label className={estilos.rotulo}>
      {rotulo}
      {obrigatorio && (
        <span className={estilos.obrigatorio} aria-hidden="true">
          obrigatório
        </span>
      )}
    </Label>
  );
}

export function DescricaoDoCampo({ children }: { children: ReactNode }) {
  return (
    <Text slot="description" className={estilos.descricao}>
      {children}
    </Text>
  );
}

export interface PropsDoErro {
  /** Erro vindo de fora do campo (da API, por exemplo). */
  erro?: string;
  tipo?: TipoDeCampo;
}

/** Erro em texto, ligado ao campo; só aparece quando o campo está inválido. */
export function ErroDoCampo({ erro, tipo }: PropsDoErro) {
  return (
    <FieldError className={estilos.erro}>
      {({ validationDetails, validationErrors }) => (
        <>
          <Icone icone={CircleAlert} />
          {erro ?? mensagemDeValidacao(validationDetails, validationErrors, tipo)}
        </>
      )}
    </FieldError>
  );
}
