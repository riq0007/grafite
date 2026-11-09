import type { LucideIcon } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Button, type ButtonProps } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import estilos from './Botao.module.css';

export type NivelDoBotao = 'primario' | 'secundario' | 'terciario' | 'destrutivo';

export interface PropsDoBotao extends Omit<ButtonProps, 'children' | 'className' | 'isPending'> {
  /** Primário: a ação principal da tela (uma por tela). Padrão: secundário. */
  nivel?: NivelDoBotao;
  /** Operação em andamento: indica o processamento, não aciona de novo e mantém a largura. */
  carregando?: boolean;
  /** Texto anunciado enquanto carrega. */
  rotuloCarregando?: string;
  /** Ícone decorativo antes do texto. */
  icone?: LucideIcon;
  className?: string;
  children: ReactNode;
  /** O botão, para quem prende algo a ele, como um popover aberto por fora. */
  ref?: Ref<HTMLButtonElement>;
}

/** Botão de texto nos quatro níveis da hierarquia. Só ícone: use o BotaoDeIcone. */
export function Botao({
  nivel = 'secundario',
  carregando = false,
  rotuloCarregando = 'Processando',
  icone,
  className,
  children,
  ...resto
}: PropsDoBotao) {
  return (
    <Button
      {...resto}
      isPending={carregando}
      data-nivel={nivel}
      className={[estilos.botao, className].filter(Boolean).join(' ')}
    >
      {/* O rótulo continua no layout enquanto carrega: é ele que segura a largura. */}
      <span className={estilos.rotulo}>
        {icone && <Icone icone={icone} />}
        {children}
      </span>
      {carregando && (
        <>
          <span className={estilos.indicador}>
            <svg viewBox="0 0 16 16" className={estilos.giro} aria-hidden="true">
              <circle cx="8" cy="8" r="6" pathLength="100" />
            </svg>
          </span>
          <span className={estilos.somenteLeitor}>, {rotuloCarregando}</span>
        </>
      )}
    </Button>
  );
}
