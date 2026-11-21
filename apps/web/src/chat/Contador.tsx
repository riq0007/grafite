// O contador do chat (spec chat, "Não lidas"; spec modulo-chat, "Trilha do chat", "Lista do Chat" e
// "Selos e movimento do chat"): o número escrito, até 99, e "99+" acima, numa cápsula, no neutro
// das conversas ou no azul do chamado. O número à vista é só desenho: o leitor de tela ouve a
// contagem em texto no nome do item, como "Chat, 3 não lidas".
import { contadorDoChat, MAXIMO_NO_CONTADOR } from '@grafite/domain';
import estilos from './Contador.module.css';

/** O neutro, das conversas e dos avisos, ou o azul do chamado. */
export type TomDoContador = 'neutro' | 'chamado';

export function Contador({
  quantos,
  tom = 'neutro',
  className,
}: {
  quantos: number;
  tom?: TomDoContador;
  className?: string;
}) {
  const texto = contadorDoChat(quantos);
  if (texto === null) return null;
  return (
    <span
      aria-hidden="true"
      data-tom={tom}
      className={[estilos.contador, className].filter(Boolean).join(' ')}
    >
      {texto}
    </span>
  );
}

/**
 * A contagem em texto, como "3 não lidas"; acima de 99, "mais de 99", como o "99+" do contador, que
 * a API conta até 100. Nenhuma no zero.
 */
export function contagemEmTexto(quantos: number, um: string, varios: string): string | null {
  if (quantos <= 0) return null;
  if (quantos > MAXIMO_NO_CONTADOR) return `mais de ${MAXIMO_NO_CONTADOR} ${varios}`;
  return `${quantos} ${quantos === 1 ? um : varios}`;
}

/**
 * O nome do item para o leitor de tela, com o que só o desenho mostra, como "Chat, 3 não lidas": as
 * partes que existem, separadas por vírgula, como o nome do sino da casca.
 */
export function nomeParaOLeitor(...partes: (string | false | null)[]): string {
  return partes
    .filter((parte): parte is string => typeof parte === 'string' && parte !== '')
    .join(', ');
}
