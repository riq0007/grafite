import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { ToggleButton, type ToggleButtonProps } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import estilos from './Botao.module.css';

export interface PropsDoBotaoAlternavel extends Omit<ToggleButtonProps, 'children' | 'className'> {
  children: string;
  /** O ícone de desligado; ligado, o botão mostra o visto. */
  icone?: LucideIcon;
  className?: string;
}

/**
 * O botão que liga e desliga um filtro, como "Só os desatualizados" (change software-por-pacote): o
 * secundário, com o estado no `aria-pressed`, no visto no lugar do ícone e na borda do destaque, e
 * nunca só na cor.
 */
export function BotaoAlternavel({ children, icone, className, ...resto }: PropsDoBotaoAlternavel) {
  return (
    <ToggleButton
      {...resto}
      data-nivel="secundario"
      className={[estilos.botao, estilos.alternavel, className].filter(Boolean).join(' ')}
    >
      {({ isSelected }) => {
        const doEstado = isSelected ? Check : icone;
        return (
          <span className={estilos.rotulo}>
            {doEstado && <Icone icone={doEstado} />}
            {children}
          </span>
        );
      }}
    </ToggleButton>
  );
}
