import { Form, type FormProps } from 'react-aria-components';
import estilos from './Campo.module.css';

export interface PropsDoFormulario extends Omit<FormProps, 'className'> {
  className?: string;
}

/**
 * Formulário da biblioteca. No envio com campo inválido, o foco vai para o primeiro campo
 * com erro, e a mensagem aparece em texto, ligada a ele.
 */
export function Formulario({ className, ...resto }: PropsDoFormulario) {
  return <Form {...resto} className={[estilos.formulario, className].filter(Boolean).join(' ')} />;
}
