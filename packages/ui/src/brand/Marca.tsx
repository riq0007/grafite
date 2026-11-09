import { MONTAGEM_DA_MARCA as montagem } from './gerado/marca.ts';
import estilos from './Marca.module.css';
import { BOJO, GRADE_DO_SIMBOLO, HASTE, NOME_DO_PRODUTO, TRACO_DO_SIMBOLO } from './simbolo.ts';

export interface PropsDaMarca {
  /** Símbolo e logotipo (padrão) ou só o símbolo, para espaços pequenos. */
  variante?: 'completa' | 'simbolo';
  /** Altura em px; a largura segue a proporção do desenho. */
  altura?: number;
  /** Quando o nome do produto já está escrito ao lado: a marca fica oculta de leitores de tela. */
  decorativa?: boolean;
}

/**
 * A marca do Grafite desenhada em linha, a partir da mesma montagem do marca.svg, na cor do texto
 * do tema (contraste de 3:1 verificado nos seis temas). Regras de uso: docs/identidade/marca.md.
 */
export function Marca({ variante = 'completa', altura = 16, decorativa = false }: PropsDaMarca) {
  const completa = variante === 'completa';
  const largura = completa ? montagem.largura : GRADE_DO_SIMBOLO;
  const alturaDoDesenho = completa ? montagem.altura : GRADE_DO_SIMBOLO;
  return (
    <svg
      className={estilos.marca}
      viewBox={`0 0 ${largura} ${alturaDoDesenho}`}
      width={Math.round(((altura * largura) / alturaDoDesenho) * 100) / 100}
      height={altura}
      role={decorativa ? undefined : 'img'}
      aria-label={decorativa ? undefined : NOME_DO_PRODUTO}
      aria-hidden={decorativa || undefined}
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={TRACO_DO_SIMBOLO}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={completa ? montagem.simbolo : undefined}
      >
        <circle cx={BOJO.cx} cy={BOJO.cy} r={BOJO.r} />
        <path d={HASTE} />
      </g>
      {completa && (
        <path fill="currentColor" transform={montagem.palavra} d={montagem.caminhoDaPalavra} />
      )}
    </svg>
  );
}
