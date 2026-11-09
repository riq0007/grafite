import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icone } from '../../icones/Icone.tsx';
import estilos from './Exibicao.module.css';

export interface PropsDoEstadoVazio {
  /** O que aconteceu, em texto objetivo ("Nenhum ativo encontrado"). */
  titulo: string;
  /** O que fazer a seguir. */
  descricao?: string;
  /** A ação relevante, quando há uma. */
  acao?: ReactNode;
  icone?: LucideIcon;
  className?: string;
}

export function EstadoVazio({ titulo, descricao, acao, icone, className }: PropsDoEstadoVazio) {
  return (
    <div className={[estilos.vazio, className].filter(Boolean).join(' ')}>
      {icone && (
        <span className={estilos.iconeDoVazio}>
          <Icone icone={icone} tamanho={24} />
        </span>
      )}
      <p className={estilos.tituloDoVazio}>{titulo}</p>
      {descricao && <p className={estilos.descricaoDoVazio}>{descricao}</p>}
      {acao && <div className={estilos.acaoDoVazio}>{acao}</div>}
    </div>
  );
}
