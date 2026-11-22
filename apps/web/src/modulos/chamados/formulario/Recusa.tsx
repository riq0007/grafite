import { Icone } from '@grafite/ui';
import { CircleAlert } from 'lucide-react';
import type { Ref } from 'react';
import estilos from './Formulario.module.css';

/** Uma recusa do formulário que se preenche, em texto, com o ícone, como o erro dos campos do kit. */
export function Recusa({
  texto,
  ref,
}: {
  texto: string;
  /** A frase, para quem a leva à vista, como o campo de escrever do chamado, que rola por dentro. */
  ref?: Ref<HTMLParagraphElement>;
}) {
  return (
    <p ref={ref} role="alert" className={estilos.recusa}>
      <Icone icone={CircleAlert} />
      {texto}
    </p>
  );
}
