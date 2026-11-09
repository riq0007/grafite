import type { LucideIcon } from 'lucide-react';
import { Button, type ButtonProps } from 'react-aria-components';
import { Dica } from '../componentes/flutuante/Dica.tsx';
import estilos from './Icone.module.css';

/** Espessura de traço única do projeto (spec iconografia). */
export const TRACO_DOS_ICONES = 1.7;

export interface PropsDoIcone {
  icone: LucideIcon;
  /** Só quando o ícone informa algo sozinho; sem rótulo ele é decorativo. */
  rotulo?: string;
  tamanho?: number;
}

/** Ícone da família do projeto: herda a cor do texto ao redor (currentColor). */
export function Icone({ icone: Svg, rotulo, tamanho = 16 }: PropsDoIcone) {
  if (rotulo) {
    return (
      <Svg
        size={tamanho}
        strokeWidth={TRACO_DOS_ICONES}
        role="img"
        aria-label={rotulo}
        focusable="false"
      />
    );
  }
  return <Svg size={tamanho} strokeWidth={TRACO_DOS_ICONES} aria-hidden="true" focusable="false" />;
}

export interface PropsDoBotaoDeIcone
  extends Omit<ButtonProps, 'children' | 'className' | 'aria-label'> {
  icone: LucideIcon;
  /** Obrigatório: é o nome que o leitor de tela anuncia e o texto da dica. */
  rotulo: string;
  /** Mostra o nome como dica ao parar o mouse ou focar pelo teclado. */
  comDica?: boolean;
  className?: string;
}

/** Botão só de ícone. O rótulo é exigido pelo tipo, para nunca faltar nome acessível. */
export function BotaoDeIcone({
  icone,
  rotulo,
  comDica = true,
  className,
  ...resto
}: PropsDoBotaoDeIcone) {
  const botao = (
    <Button
      {...resto}
      aria-label={rotulo}
      className={[estilos.botao, className].filter(Boolean).join(' ')}
    >
      <Icone icone={icone} />
    </Button>
  );
  return comDica ? <Dica texto={rotulo}>{botao}</Dica> : botao;
}
