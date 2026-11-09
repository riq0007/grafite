import { CircleAlert } from 'lucide-react';
import { Icone } from '../icones/Icone.tsx';
import estilos from './Entrada.module.css';

/**
 * A recusa de um passo da entrada, em texto e anunciada. A `chave` muda a cada tentativa, para a
 * mesma mensagem duas vezes seguidas ser anunciada de novo.
 */
export function MensagemDoPasso({ texto, chave }: { texto: string | null; chave: number }) {
  if (!texto) return null;
  return (
    <p key={chave} role="alert" className={estilos.mensagem}>
      <Icone icone={CircleAlert} />
      <span>{texto}</span>
    </p>
  );
}
