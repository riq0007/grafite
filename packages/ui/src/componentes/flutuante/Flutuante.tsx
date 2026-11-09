// Camada flutuante em material translúcido e lista de opções, compartilhadas pela seleção,
// pela busca com sugestões e, adiante, pelo popover e pelo menu.
import { Check } from 'lucide-react';
import type { Ref } from 'react';
import { VisuallyHidden } from 'react-aria';
import {
  ListBox,
  ListBoxItem,
  type ListBoxItemProps,
  type ListBoxProps,
  Popover,
  type PopoverProps,
  Text,
} from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import estilos from './Flutuante.module.css';

export interface PropsDoPainelFlutuante extends Omit<PopoverProps, 'className'> {
  className?: string;
}

/** Painel sobreposto: material translúcido, que vira sólido com a transparência reduzida. */
export function PainelFlutuante({ className, offset = 4, ...resto }: PropsDoPainelFlutuante) {
  return (
    <Popover
      {...resto}
      offset={offset}
      className={[estilos.painel, className].filter(Boolean).join(' ')}
    />
  );
}

export function ListaDeOpcoes<T extends object>(
  props: Omit<ListBoxProps<T>, 'className'> & { ref?: Ref<HTMLDivElement> },
) {
  return <ListBox {...props} className={estilos.lista} />;
}

export interface PropsDaOpcao extends Omit<ListBoxItemProps, 'children' | 'className'> {
  children: string;
  /**
   * Um texto que o leitor de tela lê depois do nome, como "Sugerido", quando a tela já o mostra de
   * outro jeito, como num cabeçalho.
   */
  descricaoOculta?: string;
}

/** Opção de lista, com a marca de escolhida à esquerda, como nos menus do macOS. */
export function Opcao({ children, descricaoOculta, ...resto }: PropsDaOpcao) {
  return (
    <ListBoxItem {...resto} textValue={children} className={estilos.opcao}>
      <span className={estilos.marca}>
        <Icone icone={Check} />
      </span>
      {descricaoOculta ? (
        <>
          <Text slot="label">{children}</Text>
          <VisuallyHidden>
            <Text slot="description">{descricaoOculta}</Text>
          </VisuallyHidden>
        </>
      ) : (
        children
      )}
    </ListBoxItem>
  );
}
