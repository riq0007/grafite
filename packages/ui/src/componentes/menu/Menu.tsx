import { Check, ChevronRight, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import {
  Header,
  Menu as MenuDoReactAria,
  MenuItem,
  type MenuItemProps,
  MenuSection,
  type MenuSectionProps,
  MenuTrigger,
  Separator,
  SubmenuTrigger,
  Text,
} from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import { tempos } from '../../tokens/tempos.ts';
import estilosDoFlutuante from '../flutuante/Flutuante.module.css';
import { PainelFlutuante } from '../flutuante/Flutuante.tsx';
import estilos from './Menu.module.css';

export interface PropsDoMenu {
  /** Nome do menu para o leitor de tela. */
  rotulo: string;
  /** Um componente pressionável da biblioteca, como o botão. */
  gatilho: ReactElement;
  posicao?: ComponentProps<typeof PainelFlutuante>['placement'];
  aoMudarAberto?: (aberto: boolean) => void;
  children: ReactNode;
}

/**
 * Menu de ações em material translúcido. Teclado: setas, Enter e Esc; seta para a direita abre
 * o submenu no primeiro item. No mouse, o submenu abre depois de o ponteiro parar sobre o item
 * e fica aberto enquanto o ponteiro segue na diagonal até ele.
 */
export function Menu({
  rotulo,
  gatilho,
  posicao = 'bottom start',
  aoMudarAberto,
  children,
}: PropsDoMenu) {
  return (
    <MenuTrigger onOpenChange={aoMudarAberto}>
      {gatilho}
      <PainelFlutuante placement={posicao} className={estilosDoFlutuante.deMenu}>
        <MenuDoReactAria aria-label={rotulo} className={estilos.menu}>
          {children}
        </MenuDoReactAria>
      </PainelFlutuante>
    </MenuTrigger>
  );
}

export interface PropsDoItemDeMenu extends Omit<MenuItemProps, 'children' | 'className'> {
  children: string;
  /** Ação que apaga ou encerra algo: texto na cor crítica. */
  destrutivo?: boolean;
  /** Texto de apoio abaixo do nome, como "Padrão da organização". */
  descricao?: string;
  /** O ícone antes do nome, como o de cada tipo em "Por tipo"; decorativo, o nome diz tudo. */
  icone?: LucideIcon;
}

/**
 * Item do menu. Numa seção que se escolhe, a marca de escolhido fica à esquerda, como nos menus do
 * macOS.
 */
export function ItemDeMenu({
  children,
  destrutivo = false,
  descricao,
  icone,
  ...resto
}: PropsDoItemDeMenu) {
  return (
    <MenuItem
      {...resto}
      textValue={children}
      data-destrutivo={destrutivo || undefined}
      className={estilos.item}
    >
      {({ hasSubmenu, selectionMode, isSelected }) => (
        <>
          {selectionMode !== 'none' && (
            <span className={estilos.marca} data-marcado={isSelected || undefined}>
              <Icone icone={Check} />
            </span>
          )}
          {icone && (
            <span className={estilos.icone}>
              <Icone icone={icone} />
            </span>
          )}
          {descricao ? (
            <span className={estilos.texto}>
              <Text slot="label">{children}</Text>
              <Text slot="description" className={estilos.descricao}>
                {descricao}
              </Text>
            </span>
          ) : (
            <span className={estilos.texto}>{children}</span>
          )}
          {hasSubmenu && (
            <span className={estilos.seta}>
              <Icone icone={ChevronRight} />
            </span>
          )}
        </>
      )}
    </MenuItem>
  );
}

export interface PropsDoSubmenu {
  rotulo: string;
  children: ReactNode;
}

/** Item que abre um submenu; o submenu recebe o nome do item. */
export function Submenu({ rotulo, children }: PropsDoSubmenu) {
  return (
    <SubmenuTrigger delay={tempos.menu.abrirSubmenu}>
      <ItemDeMenu>{rotulo}</ItemDeMenu>
      {/* Alinha o primeiro item do submenu ao item de origem (respiro de 4 px + borda). */}
      <PainelFlutuante offset={-2} crossOffset={-5} className={estilosDoFlutuante.deMenu}>
        <MenuDoReactAria className={estilos.menu}>{children}</MenuDoReactAria>
      </PainelFlutuante>
    </SubmenuTrigger>
  );
}

export interface PropsDaSecaoDeMenu<T extends object>
  extends Omit<MenuSectionProps<T>, 'className' | 'children' | 'items'> {
  children: ReactNode;
  /** O título à vista; sem ele, a seção tem só o nome para o leitor de tela (`aria-label`). */
  titulo?: string;
}

/** Um grupo de itens do menu, com o título à vista ou só o nome. */
export function SecaoDeMenu<T extends object>({
  titulo,
  children,
  ...resto
}: PropsDaSecaoDeMenu<T>) {
  return (
    <MenuSection {...resto}>
      {titulo && <Header className={estilos.tituloDaSecao}>{titulo}</Header>}
      {children}
    </MenuSection>
  );
}

export function Separador() {
  return <Separator className={estilos.separador} />;
}
