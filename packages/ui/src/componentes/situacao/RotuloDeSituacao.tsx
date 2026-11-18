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
  /**
   * Sem o ícone, nos rótulos juntos de uma contagem ("14 concluídas", "1 falhou"), em que o texto já
   * diz a situação de cada um.
   */
  semIcone?: boolean;
  /**
   * O ícone da palavra, no lugar do da situação, no módulo que dá um ícone a cada uma: nos
   * chamados, o "Em atendimento" e o "Só a TI abre" são informação, com desenhos diferentes.
   */
  icone?: LucideIcon;
}

/** Situação em uma linha só: o texto informa, o ícone e a cor reforçam. */
export function RotuloDeSituacao({
  situacao,
  children,
  className,
  semIcone,
  icone = ICONES_DAS_SITUACOES[situacao],
}: PropsDoRotuloDeSituacao) {
  return (
    <span
      data-situacao={situacao}
      className={[estilos.rotulo, className].filter(Boolean).join(' ')}
    >
      {!semIcone && <Icone icone={icone} tamanho={12} />}
      {children}
    </span>
  );
}
