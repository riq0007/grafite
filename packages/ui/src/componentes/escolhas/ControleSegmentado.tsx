import type { ReactNode } from 'react';
import {
  Label,
  Radio as RadioDoReactAria,
  RadioGroup,
  type RadioGroupProps,
  type RadioProps,
} from 'react-aria-components';
import estilosDoCampo from '../campo/Campo.module.css';
import { DescricaoDoCampo } from '../campo/partes.tsx';
import estilos from './Escolhas.module.css';

export interface PropsDoControleSegmentado
  extends Omit<RadioGroupProps, 'children' | 'className' | 'orientation'> {
  rotulo: string;
  /** Numa barra de ferramentas o contexto já diz o que é; o rótulo fica só para o leitor de tela. */
  ocultarRotulo?: boolean;
  /** Texto de apoio abaixo dos segmentos, ligado ao grupo para o leitor de tela. */
  descricao?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Escolha única entre poucas vistas ou modos, em segmentos lado a lado. É um grupo de rádios:
 * as setas trocam o segmento escolhido.
 */
export function ControleSegmentado({
  rotulo,
  ocultarRotulo = false,
  descricao,
  children,
  className,
  ...resto
}: PropsDoControleSegmentado) {
  return (
    <RadioGroup
      {...resto}
      orientation="horizontal"
      aria-label={ocultarRotulo ? rotulo : undefined}
      className={[estilos.segmentado, className].filter(Boolean).join(' ')}
    >
      {!ocultarRotulo && <Label className={estilosDoCampo.rotulo}>{rotulo}</Label>}
      <div className={estilos.trilhoSegmentado}>{children}</div>
      {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
    </RadioGroup>
  );
}

export interface PropsDoSegmento extends Omit<RadioProps, 'children' | 'className'> {
  children: ReactNode;
  className?: string;
}

export function Segmento({ children, className, ...resto }: PropsDoSegmento) {
  return (
    <RadioDoReactAria
      {...resto}
      // O segmento é um rótulo com o rádio escondido: pede o abraço do cursor suavizado.
      data-cursor-abracar=""
      className={[estilos.segmento, className].filter(Boolean).join(' ')}
    >
      {children}
    </RadioDoReactAria>
  );
}
