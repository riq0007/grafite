import { type CSSProperties, useMemo, useRef } from 'react';
import {
  type AriaSliderProps,
  mergeProps,
  useFocusRing,
  useSlider,
  useSliderThumb,
  VisuallyHidden,
} from 'react-aria';
import { useSliderState } from 'react-stately';
import estilos from './ControleDeslizante.module.css';

export type UnidadeDoControle = 'px' | '%' | '°';

export interface PropsDoControleDeslizante
  extends Omit<AriaSliderProps<number>, 'label' | 'orientation'> {
  /** Nome do controle, visível e acessível. */
  rotulo: string;
  /** Unidade do valor: "48 px", "95%" ou "265°" (pt-BR). */
  unidade: UnidadeDoControle;
  /** O texto à vista no lugar do número com a unidade, como "HB · 45" (change tema-personalizado). */
  textoDoValor?: (valor: number) => string;
  /** O que o leitor de tela anuncia, como "HB, 45 de 100"; sem ele, o texto à vista. */
  textoParaLeitor?: (valor: number) => string;
  /** Um gradiente CSS que pinta a trilha no lugar do preenchimento, como a volta das matizes. */
  trilha?: string;
  className?: string;
}

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/**
 * Formatador no formato que o estado do slider espera: o valor com a unidade, para o texto à
 * vista e para o leitor de tela. O slider pronto do React Aria só aceita as unidades do Intl,
 * que não incluem pixel (design, decisão 12).
 */
function formatadorComUnidade(
  unidade: UnidadeDoControle,
  textoDoValor?: (valor: number) => string,
): Intl.NumberFormat {
  const formatar = (valor: number) => {
    if (textoDoValor) return textoDoValor(valor);
    if (unidade === 'px') return `${numero.format(valor)} px`;
    return `${numero.format(valor)}${unidade}`;
  };
  return { format: formatar } as Intl.NumberFormat;
}

/** Os atributos `data-*` de quem usa o controle, como o `data-foco` dos Ajustes, vão para a raiz. */
const atributosDeDados = (props: object) =>
  Object.fromEntries(Object.entries(props).filter(([nome]) => nome.startsWith('data-')));

/** Escolhe um número num intervalo, com o valor e a unidade sempre à vista. */
export function ControleDeslizante({
  rotulo,
  unidade,
  textoDoValor,
  textoParaLeitor,
  trilha,
  className,
  ...props
}: PropsDoControleDeslizante) {
  const trilhaRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLInputElement>(null);
  const numberFormatter = useMemo(
    () => formatadorComUnidade(unidade, textoDoValor),
    [unidade, textoDoValor],
  );
  const opcoes = { ...props, label: rotulo, step: props.step ?? 1 };
  const estado = useSliderState({ ...opcoes, numberFormatter });
  const { groupProps, trackProps, labelProps, outputProps } = useSlider(opcoes, estado, trilhaRef);
  const { thumbProps, inputProps, isDragging } = useSliderThumb(
    { index: 0, trackRef: trilhaRef, inputRef: entradaRef, isDisabled: props.isDisabled },
    estado,
  );
  const { focusProps, isFocusVisible } = useFocusRing();
  const fracao = `${estado.getThumbPercent(0) * 100}%`;
  const paraLeitor: { 'aria-valuetext'?: string } = textoParaLeitor
    ? { 'aria-valuetext': textoParaLeitor(estado.getThumbValue(0)) }
    : {};

  return (
    <div
      {...atributosDeDados(props)}
      {...groupProps}
      className={[estilos.controle, className].filter(Boolean).join(' ')}
      data-disabled={props.isDisabled || undefined}
      aria-disabled={props.isDisabled || undefined}
    >
      <div className={estilos.topo}>
        <label {...labelProps} htmlFor={inputProps.id} className={estilos.rotulo}>
          {rotulo}
        </label>
        <output {...outputProps} className={estilos.valor}>
          {estado.getThumbValueLabel(0)}
        </output>
      </div>
      <div
        {...trackProps}
        ref={trilhaRef}
        className={estilos.trilha}
        data-parte="trilha"
        data-pintada={trilha ? '' : undefined}
        style={trilha ? ({ '--trilha-pintada': trilha } as CSSProperties) : undefined}
      >
        {!trilha && <div className={estilos.preenchido} style={{ width: fracao }} />}
        <div
          {...thumbProps}
          className={estilos.marcador}
          style={{ left: fracao }}
          data-arrastando={isDragging || undefined}
          data-foco-visivel={isFocusVisible || undefined}
        >
          <VisuallyHidden>
            <input ref={entradaRef} {...mergeProps(inputProps, focusProps, paraLeitor)} />
          </VisuallyHidden>
        </div>
      </div>
    </div>
  );
}
