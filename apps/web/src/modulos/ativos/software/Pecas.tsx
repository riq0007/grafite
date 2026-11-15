// As peças comuns das telas do software (change software-por-pacote, design, decisão 4): o ícone do
// pacote, com o monograma na cor da série, e a barra em pedaços das situações.
import { monograma } from '@grafite/domain';
import { serieDoPacote } from './formatos.ts';
import estilos from './Pecas.module.css';

/** O monograma do pacote, que o leitor de tela pula: o nome vem sempre ao lado. */
export function IconeDoPacote({
  nome,
  tamanho = 'normal',
}: {
  nome: string;
  tamanho?: 'p' | 'normal' | 'm' | 'gg';
}) {
  return (
    <span
      aria-hidden="true"
      className={estilos.icone}
      data-tamanho={tamanho === 'normal' ? undefined : tamanho}
      data-serie={serieDoPacote(nome)}
    >
      {monograma(nome)}
    </span>
  );
}

export type ParteDaBarra = 'ok' | 'atencao' | 'critico' | 'info' | 'neutra';

/**
 * A barra das situações, um pedaço por situação, na proporção de cada uma. É desenho: o número ou os
 * rótulos ao lado dizem o mesmo em texto.
 */
export function BarraDeSituacoes({
  partes,
  className,
}: {
  partes: readonly { parte: ParteDaBarra; quantidade: number }[];
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={[estilos.barra, className].filter(Boolean).join(' ')}>
      {partes
        .filter(({ quantidade }) => quantidade > 0)
        .map(({ parte, quantidade }) => (
          <i key={parte} data-parte={parte} style={{ flex: quantidade }} />
        ))}
    </span>
  );
}
