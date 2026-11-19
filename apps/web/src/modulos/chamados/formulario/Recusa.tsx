import { Icone } from '@grafite/ui';
import { CircleAlert } from 'lucide-react';
import estilos from './Formulario.module.css';

/** Uma recusa do formulário que se preenche, em texto, com o ícone, como o erro dos campos do kit. */
export function Recusa({ texto }: { texto: string }) {
  return (
    <p role="alert" className={estilos.recusa}>
      <Icone icone={CircleAlert} />
      {texto}
    </p>
  );
}
