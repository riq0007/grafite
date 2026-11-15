import { Search } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Input, TextField, type TextFieldProps } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import estilos from './Campo.module.css';

export interface PropsDoCampoDeBusca
  extends Omit<TextFieldProps, 'children' | 'className' | 'type' | 'aria-label'> {
  /** O que a busca procura ("Procurar na base"): o nome para o leitor de tela e o texto da caixa. */
  rotulo: string;
  /** O que fica no fim da caixa, como quantos itens a busca acha. */
  fim?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * A busca que filtra uma lista que está na tela, como nos mockups da rodada 3: a lupa e o texto
 * dentro da caixa, na altura dos botões, com o fim opcional à direita. Só para isso: o campo de um
 * formulário continua com o rótulo visível (CampoDeTexto). Aqui a lupa e o texto dizem o que a
 * caixa faz, e o rótulo vai para o leitor de tela.
 */
export function CampoDeBusca({ rotulo, fim, className, ref, ...resto }: PropsDoCampoDeBusca) {
  return (
    <TextField
      {...resto}
      type="search"
      aria-label={rotulo}
      className={[estilos.busca, className].filter(Boolean).join(' ')}
    >
      <Icone icone={Search} />
      <Input ref={ref} className={estilos.entradaDaBusca} placeholder={rotulo} />
      {fim && <span className={estilos.fimDaBusca}>{fim}</span>}
    </TextField>
  );
}
