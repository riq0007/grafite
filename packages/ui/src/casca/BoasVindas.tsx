import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { OLA } from '../brand/gerado/ola.ts';
import { Botao } from '../componentes/botao/Botao.tsx';
import estilos from './BoasVindas.module.css';

/** A espessura do traço que escreve o "olá", nas medidas do desenho. */
const TRACO_DO_OLA = 1.2;
/**
 * A revelação passa da largura do desenho: no fim dela, a borda macia fica além do "á", e o
 * desenho inteiro aparece por igual.
 */
const LARGURA_DA_REVELACAO = OLA.largura * 1.2;

export interface PropsDasBoasVindas {
  /** Avisa o app, uma vez só, quando as boas-vindas terminam ou são puladas. */
  aoTerminar: () => void;
  /** Paradas no fim da escrita, sem sair: para o catálogo e a regressão visual. */
  parado?: boolean;
}

/**
 * As boas-vindas do primeiro acesso (spec chegada; design, decisão 3): o "olá" escrito à mão, da
 * esquerda para a direita, e "Bem-vindo ao Grafite". Depois de um tempo à vista, saem e avisam o
 * app, que monta a casca. Clique, Esc e o botão "Pular", que recebe o foco, pulam na hora. Os
 * tempos vêm dos tokens: com movimento reduzido, o "olá" nasce escrito, e tudo é troca de
 * opacidade.
 */
export function BoasVindas({ aoTerminar, parado = false }: PropsDasBoasVindas) {
  const [saindo, definirSaindo] = useState(false);
  const terminou = useRef(false);
  const idDoTitulo = useId();
  const sufixo = useId().replace(/\W/g, '');
  const idDaMascara = `ola-mascara-${sufixo}`;
  const idDoDegrade = `ola-degrade-${sufixo}`;
  const aoTerminarAtual = useRef(aoTerminar);
  aoTerminarAtual.current = aoTerminar;

  const terminar = useCallback(() => {
    if (terminou.current) return;
    terminou.current = true;
    aoTerminarAtual.current();
  }, []);

  useEffect(() => {
    if (parado) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') terminar();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [parado, terminar]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o clique em qualquer lugar é um atalho do ponteiro; pelo teclado, Esc e o botão "Pular" fazem o mesmo
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={idDoTitulo}
      className={[estilos.boasVindas, parado && estilos.parado, saindo && estilos.saindo]
        .filter(Boolean)
        .join(' ')}
      onClick={parado ? undefined : terminar}
      onAnimationEnd={(evento) => {
        // A animação da própria camada marca o fim do tempo à vista: é hora de sair.
        if (!parado && evento.target === evento.currentTarget) definirSaindo(true);
      }}
    >
      <div
        className={estilos.conteudo}
        onTransitionEnd={(evento) => {
          if (
            saindo &&
            evento.target === evento.currentTarget &&
            evento.propertyName === 'opacity'
          ) {
            terminar();
          }
        }}
      >
        <svg
          className={estilos.ola}
          viewBox={`0 0 ${OLA.largura} ${OLA.altura}`}
          role="img"
          aria-label="olá"
        >
          <defs>
            {/* A borda direita da revelação é macia, como a tinta chegando. */}
            <linearGradient id={idDoDegrade} x1="0" x2="1">
              <stop offset="0" stopColor="currentColor" />
              <stop offset="0.86" stopColor="currentColor" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
            <mask
              id={idDaMascara}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={LARGURA_DA_REVELACAO}
              height={OLA.altura}
              style={{ maskType: 'alpha' }}
            >
              <rect
                className={estilos.revelar}
                width={LARGURA_DA_REVELACAO}
                height={OLA.altura}
                fill={`url(#${idDoDegrade})`}
              />
            </mask>
          </defs>
          <g mask={`url(#${idDaMascara})`} strokeWidth={TRACO_DO_OLA}>
            <path className={estilos.letras} d={OLA.letras} pathLength={1} />
            <path className={estilos.acento} d={OLA.acento} pathLength={1} />
          </g>
        </svg>
        <p id={idDoTitulo} className={estilos.titulo}>
          Bem-vindo ao Grafite
        </p>
      </div>
      <Botao nivel="terciario" autoFocus onPress={terminar} className={estilos.pular}>
        Pular
      </Botao>
    </div>
  );
}
