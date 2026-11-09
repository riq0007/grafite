import { Lock, LockOpen } from 'lucide-react';
import { ToggleButton } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import estilos from './EstadoDoCampo.module.css';

export interface PropsDoEstadoDoCampo {
  /** O nome do campo, para o botão da trava: "Trava de Local". */
  rotuloDoCampo: string;
  /** De onde veio o valor, em texto, como "Manual" ou "Planilha"; sem gravação, nada. */
  origem?: string | null;
  /** O nome de quem gravou. */
  autor?: string | null;
  /** O momento da gravação, já no fuso escolhido. */
  momento?: string | null;
  travado: boolean;
  /** Para quem edita: liga e desliga a trava. Sem ele, a trava só aparece, em texto, quando ligada. */
  aoMudarTrava?: (travado: boolean) => void;
  className?: string;
}

/**
 * O estado de um campo (spec cadastro-de-ativos): de onde veio o valor, quem o gravou e quando, e a
 * trava, que protege o valor conferido à mão da importação e da coleta. A trava diz o estado em
 * texto, e não só pelo ícone.
 */
export function EstadoDoCampo({
  rotuloDoCampo,
  origem,
  autor,
  momento,
  travado,
  aoMudarTrava,
  className,
}: PropsDoEstadoDoCampo) {
  const gravacao = [origem, autor, momento].filter(Boolean).join(' · ');
  if (!gravacao && !travado && !aoMudarTrava) return null;
  return (
    <span className={[estilos.estado, className].filter(Boolean).join(' ')}>
      {gravacao && <span className={estilos.gravacao}>{gravacao}</span>}
      {aoMudarTrava ? (
        <ToggleButton
          aria-label={`Trava de ${rotuloDoCampo}`}
          isSelected={travado}
          onChange={aoMudarTrava}
          className={estilos.trava}
        >
          <Icone icone={travado ? Lock : LockOpen} tamanho={14} />
          <span>{travado ? 'Travado' : 'Travar'}</span>
        </ToggleButton>
      ) : (
        travado && (
          <span className={estilos.travado}>
            <Icone icone={Lock} tamanho={14} />
            <span>Travado</span>
          </span>
        )
      )}
    </span>
  );
}
