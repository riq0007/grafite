import { type ReactNode, useId } from 'react';
import { Switch, type SwitchProps } from 'react-aria-components';
import estilos from './Escolhas.module.css';

export interface PropsDoInterruptor extends Omit<SwitchProps, 'children' | 'className'> {
  children: ReactNode;
  /** O que o interruptor faz, abaixo do nome e ligado a ele para o leitor de tela. */
  descricao?: string;
  className?: string;
}

/** Liga e desliga algo que vale na hora, sem botão de salvar. */
export function Interruptor({ children, descricao, className, ...resto }: PropsDoInterruptor) {
  const idDaDescricao = useId();
  const interruptor = (
    <Switch
      {...resto}
      aria-describedby={descricao ? idDaDescricao : resto['aria-describedby']}
      className={[estilos.escolha, className].filter(Boolean).join(' ')}
    >
      <span className={estilos.trilho} data-parte="trilho">
        <span className={estilos.pino} />
      </span>
      {children}
    </Switch>
  );
  if (!descricao) return interruptor;
  return (
    <div className={estilos.interruptorComDescricao}>
      {interruptor}
      <span id={idDaDescricao} className={estilos.descricaoDoInterruptor}>
        {descricao}
      </span>
    </div>
  );
}
