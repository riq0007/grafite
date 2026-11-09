import { Label, ProgressBar } from 'react-aria-components';
import estilos from './Exibicao.module.css';

export interface PropsDaBarraDeProgresso {
  rotulo: string;
  /** De 0 a 100. Sem valor, a barra é indeterminada (algo em andamento, sem prazo conhecido). */
  valor?: number;
  className?: string;
}

export function BarraDeProgresso({ rotulo, valor, className }: PropsDaBarraDeProgresso) {
  const indeterminada = valor === undefined;
  return (
    <ProgressBar
      value={valor}
      isIndeterminate={indeterminada}
      className={[estilos.progresso, className].filter(Boolean).join(' ')}
    >
      {({ percentage, valueText }) => (
        <>
          <div className={estilos.cabecalhoDoProgresso}>
            <Label className={estilos.rotuloDoProgresso}>{rotulo}</Label>
            {!indeterminada && <span className={estilos.valorDoProgresso}>{valueText}</span>}
          </div>
          <div className={estilos.trilho}>
            <div
              className={estilos.preenchimento}
              style={indeterminada ? undefined : { width: `${percentage}%` }}
            />
          </div>
        </>
      )}
    </ProgressBar>
  );
}
