// O carimbo de seção (spec componentes-base, "Carimbo de seção"; change componentes-v3, design,
// decisão 5): o título de seção como o carimbo de uma prancha, em legenda e maiúsculas, com a linha
// fina que segue até a borda. É título de verdade, para o leitor de tela e a busca de títulos.
import type { ReactNode } from 'react';
import estilos from './Carimbo.module.css';

export interface PropsDoCarimbo {
  children: ReactNode;
  /** O nível do título, 2 por padrão. */
  nivel?: 2 | 3 | 4;
  id?: string;
}

export function Carimbo({ children, nivel = 2, id }: PropsDoCarimbo) {
  const Titulo = `h${nivel}` as const;
  return (
    <Titulo className={estilos.carimbo} id={id}>
      <span>{children}</span>
      <span className={estilos.linha} data-parte="linha" aria-hidden="true" />
    </Titulo>
  );
}
