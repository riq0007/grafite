import type { Ref } from 'react';
import estilos from './AbaFechada.module.css';
import type { FormaDaAba } from './nativo.ts';
import { Simbolo } from './Simbolo.tsx';

export const ROTULO_DA_ABA = 'Suporte da TI';

interface Props {
  forma: FormaDaAba;
  compacta: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A aba fechada (spec aba-dos-colaboradores, "Aba fechada"): a pílula de fábrica ou o entalhe preso
 * à borda de cima, sem o logo, com os estados repouso, mouse em cima, pressionada e foco.
 */
export function AbaFechada({ forma, compacta, ref }: Props) {
  const classes = [estilos.aba, estilos[forma], compacta && forma === 'pilula' && estilos.compacta]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      data-forma={forma}
      aria-haspopup="dialog"
      aria-expanded={false}
    >
      <span className={estilos.disco}>
        <Simbolo nome="ajuda" />
      </span>
      {ROTULO_DA_ABA}
      <Simbolo nome="baixo" className={estilos.seta} />
    </button>
  );
}
