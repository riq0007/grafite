import {
  Circle,
  CircleCheck,
  Info,
  type LucideIcon,
  OctagonAlert,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Icone } from '../../icones/Icone.tsx';
import estilos from './RotuloDeSituacao.module.css';

export type Situacao = 'neutra' | 'sucesso' | 'info' | 'atencao' | 'critico';

/**
 * Formas diferentes por situação: quem não distingue as cores distingue o desenho. Os avisos
 * usam as mesmas formas.
 */
export const ICONES_DAS_SITUACOES: Record<Situacao, LucideIcon> = {
  neutra: Circle,
  sucesso: CircleCheck,
  info: Info,
  atencao: TriangleAlert,
  critico: OctagonAlert,
};

/** Nome de cada situação em texto, para quando ela precisa ser dita e não só sugerida. */
export const NOMES_DAS_SITUACOES: Record<Situacao, string> = {
  neutra: 'Neutra',
  sucesso: 'Sucesso',
  info: 'Informação',
  atencao: 'Atenção',
  critico: 'Crítico',
};

export interface PropsDoRotuloDeSituacao {
  situacao: Situacao;
  children: ReactNode;
  className?: string;
}

/** Situação em uma linha só: o texto informa, o ícone e a cor reforçam. */
export function RotuloDeSituacao({ situacao, children, className }: PropsDoRotuloDeSituacao) {
  return (
    <span
      data-situacao={situacao}
      className={[estilos.rotulo, className].filter(Boolean).join(' ')}
    >
      <Icone icone={ICONES_DAS_SITUACOES[situacao]} tamanho={12} />
      {children}
    </span>
  );
}
