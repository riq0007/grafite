// Camada flutuante em material translúcido e lista de opções, compartilhadas pela seleção,
// pela busca com sugestões e, adiante, pelo popover e pelo menu.
import { Check } from 'lucide-react';
import { type Ref, useContext, useEffectEvent, useLayoutEffect, useMemo, useRef } from 'react';
import { mergeRefs, VisuallyHidden } from 'react-aria';
import {
  ComboBoxStateContext,
  ListBox,
  ListBoxItem,
  type ListBoxItemProps,
  type ListBoxProps,
  OverlayTriggerStateContext,
  Popover,
  type PopoverProps,
  Text,
} from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import { registrarPainelAberto } from './botaoDireito.ts';
import estilos from './Flutuante.module.css';

export interface PropsDoPainelFlutuante extends Omit<PopoverProps, 'className'> {
  className?: string;
  /** O painel, para quem leva o foco a ele ou observa o toque fora dele. */
  ref?: Ref<HTMLElement>;
  /**
   * A camada opaca, com o material sólido no lugar do vidro, para o que se lê por cima de outro
   * conteúdo, como o resumo de um registro.
   */
  opaco?: boolean;
  /**
   * Fecha o painel na hora, quando quem o abre fecha depois de uma espera, como o cartão do ponteiro
   * parado: o botão direito fora do painel o fecha por aqui, e não pela espera.
   */
  fecharNaHora?: () => void;
}

/**
 * Painel sobreposto: material translúcido, que vira sólido com a transparência reduzida. Aberto, ele
 * entra no registro do botão direito (`botaoDireito.ts`): o botão direito fora dele o fecha e vale
 * onde cai, e o menu do navegador não abre por cima dele.
 */
export function PainelFlutuante({
  className,
  offset = 4,
  opaco = false,
  ref,
  fecharNaHora,
  ...resto
}: PropsDoPainelFlutuante) {
  const elemento = useRef<HTMLElement>(null);
  const juntas = useMemo(() => mergeRefs(ref, elemento), [ref]);
  // O painel aberto por fora, como o menu de contexto, segue o `isOpen`; o outro, o estado de quem o
  // abre, como o menu de botão, a seleção e o cartão, como o Popover do React Aria faz.
  const doGatilho = useContext(OverlayTriggerStateContext);
  // A lista de uma busca: o `close` dela confirma o texto, como ao sair do campo, e, sem o texto
  // livre, o apaga. O botão direito no campo, para colar, não é sair dele: a lista só fecha.
  const daBusca = useContext(ComboBoxStateContext);
  const porFora = resto.isOpen != null;
  const aberto = porFora ? Boolean(resto.isOpen) : Boolean(doGatilho?.isOpen);
  const fechar = useEffectEvent(() => {
    if (fecharNaHora) fecharNaHora();
    else if (porFora) resto.onOpenChange?.(false);
    else if (daBusca && daBusca === doGatilho) {
      if (daBusca.isOpen) daBusca.toggle();
    } else doGatilho?.close();
  });
  // A cópia que o React Aria monta fora da tela para ler os itens de uma coleção, como a do submenu,
  // não tem o painel e não entra no registro.
  useLayoutEffect(() => {
    if (!aberto || !elemento.current) return;
    return registrarPainelAberto({ elemento: () => elemento.current, fechar: () => fechar() });
  }, [aberto]);
  return (
    <Popover
      {...resto}
      ref={juntas}
      offset={offset}
      className={[estilos.painel, opaco ? estilos.opaco : null, className]
        .filter(Boolean)
        .join(' ')}
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
  /**
   * Uma segunda linha, no texto secundário, como o tipo, o local e o responsável de um ativo, que o
   * leitor de tela lê como a descrição da opção.
   */
  detalhe?: string;
}

/** Opção de lista, com a marca de escolhida à esquerda, como nos menus do macOS. */
export function Opcao({ children, descricaoOculta, detalhe, ...resto }: PropsDaOpcao) {
  return (
    <ListBoxItem {...resto} textValue={children} className={estilos.opcao}>
      <span className={estilos.marca}>
        <Icone icone={Check} />
      </span>
      {detalhe ? (
        // A descrição é uma só: o detalhe à vista e, depois dele, o que só o leitor de tela lê.
        <span className={estilos.textosDaOpcao}>
          <Text slot="label">{children}</Text>
          <Text slot="description" className={estilos.detalheDaOpcao}>
            {detalhe}
            {descricaoOculta && <VisuallyHidden>{` · ${descricaoOculta}`}</VisuallyHidden>}
          </Text>
        </span>
      ) : descricaoOculta ? (
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
