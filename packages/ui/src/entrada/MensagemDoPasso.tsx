import { CircleAlert } from 'lucide-react';
import type { Ref } from 'react';
import { Icone } from '../icones/Icone.tsx';
import estilos from './Entrada.module.css';

/**
 * A recusa de um passo da entrada, em texto e anunciada. A `chave` muda a cada tentativa, para a
 * mesma mensagem duas vezes seguidas ser anunciada de novo.
 */
export function MensagemDoPasso({
  texto,
  chave,
  ref,
}: {
  texto: string | null;
  chave: number;
  /** A mensagem, para quem a leva à vista, como o pé do campo de escrever na tela estreita. */
  ref?: Ref<HTMLParagraphElement>;
}) {
  if (!texto) return null;
  return (
    <p key={chave} ref={ref} role="alert" className={estilos.mensagem}>
      <Icone icone={CircleAlert} />
      <span>{texto}</span>
    </p>
  );
}
