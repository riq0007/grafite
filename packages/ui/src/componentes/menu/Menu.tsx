import { Check, ChevronRight, type LucideIcon } from 'lucide-react';
import {
  type ComponentProps,
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from 'react';
import {
  Header,
  Keyboard,
  MenuContext,
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
import { formatarAtalho, plataformaAtual } from '../atalho/atalho.ts';
import estilosDoFlutuante from '../flutuante/Flutuante.module.css';
import { PainelFlutuante } from '../flutuante/Flutuante.tsx';
import estilos from './Menu.module.css';

/** O menu em camada opaca: os submenus dele também são. */
const MenuOpaco = createContext(false);

const classeDoPainel = (opaco: boolean) =>
  [estilosDoFlutuante.deMenu, opaco && estilosDoFlutuante.opaco].filter(Boolean).join(' ');

/** O menu sem o nome do gatilho, que o React Aria liga a ele: vale o rótulo. */
function NomeDoRotulo({ children }: { children: ReactNode }) {
  const doGatilho = useContext(MenuContext);
  return (
    <MenuContext.Provider value={{ ...doGatilho, 'aria-labelledby': undefined }}>
      {children}
    </MenuContext.Provider>
  );
}

export interface PropsDoMenu {
  /** Nome do menu para o leitor de tela. */
  rotulo: string;
  /** Um componente pressionável da biblioteca, como o botão. */
  gatilho: ReactElement;
  posicao?: ComponentProps<typeof PainelFlutuante>['placement'];
  aoMudarAberto?: (aberto: boolean) => void;
  /**
   * Em camada opaca, o material sólido sem o vidro, como o menu da mensagem do chat, que abre sobre
   * o texto da conversa. Os submenus seguem o menu.
   */
  opaco?: boolean;
  /**
   * O leitor de tela ouve o menu pelo rótulo, e não pelo nome do gatilho, que o React Aria liga ao
   * menu: o "Mais" da mensagem do chat abre as "Ações da mensagem de Paulo Nunes".
   */
  nomePeloRotulo?: boolean;
  children: ReactNode;
}

/**
 * Menu de ações em material translúcido, ou opaco. Teclado: setas, Enter e Esc; seta para a direita abre
 * o submenu no primeiro item. No mouse, o submenu abre depois de o ponteiro parar sobre o item
 * e fica aberto enquanto o ponteiro segue na diagonal até ele.
 */
export function Menu({
  rotulo,
  gatilho,
  posicao = 'bottom start',
  aoMudarAberto,
  opaco = false,
  nomePeloRotulo = false,
  children,
}: PropsDoMenu) {
  const menu = (
    <MenuDoReactAria aria-label={rotulo} className={estilos.menu}>
      {children}
    </MenuDoReactAria>
  );
  return (
    <MenuTrigger onOpenChange={aoMudarAberto}>
      {gatilho}
      <PainelFlutuante placement={posicao} className={classeDoPainel(opaco)}>
        <MenuOpaco.Provider value={opaco}>
          {nomePeloRotulo ? <NomeDoRotulo>{menu}</NomeDoRotulo> : menu}
        </MenuOpaco.Provider>
      </PainelFlutuante>
    </MenuTrigger>
  );
}

export interface PropsDoMenuNaFolha {
  /** Nome do menu para o leitor de tela, como "Ações da mensagem". */
  rotulo: string;
  children: ReactNode;
}

/**
 * O menu solto numa folha de baixo, como o da mensagem do chat no celular (m09): os itens de 52 px,
 * no texto maior, com o ícone de 24 px. As setas andam pelos itens, como no menu que abre.
 */
export function MenuNaFolha({ rotulo, children }: PropsDoMenuNaFolha) {
  return (
    <MenuDoReactAria aria-label={rotulo} className={`${estilos.menu} ${estilos.menuNaFolha}`}>
      {children}
    </MenuDoReactAria>
  );
}

export interface PropsDoItemDeMenu extends Omit<MenuItemProps, 'children' | 'className'> {
  children: string;
  /** Ação que apaga ou encerra algo: texto na cor crítica. */
  destrutivo?: boolean;
  /**
   * Texto de apoio abaixo do nome, como "Padrão da organização", ou o que se lê com ele, como o
   * patrimônio de um ativo na mono.
   */
  descricao?: ReactNode;
  /** O ícone antes do nome, como o de cada tipo em "Por tipo"; decorativo, o nome diz tudo. */
  icone?: LucideIcon;
  /**
   * A ação que leva ao chamado, como "Transformar em chamado": o nome em peso forte e no azul do
   * chamado, sobre o fundo e a borda dele.
   */
  informativo?: boolean;
  /** O atalho de teclado da ação, no fim do item, como `['ctrl', 'shift', 'T']`. */
  atalho?: string[];
  /** Um texto curto no fim do item, como "+1 · ok · visto" no Reagir, que o nome já resume. */
  dica?: string;
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
  informativo = false,
  atalho,
  dica,
  ...resto
}: PropsDoItemDeMenu) {
  return (
    <MenuItem
      {...resto}
      textValue={children}
      data-destrutivo={destrutivo || undefined}
      data-informativo={informativo || undefined}
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
          {/* Com a descrição ou o atalho, o nome do item é só o rótulo, e o resto o descreve. */}
          <span className={estilos.texto}>
            {descricao || atalho ? (
              <Text slot="label" className={estilos.nome}>
                {children}
              </Text>
            ) : (
              children
            )}
            {descricao && (
              <Text slot="description" className={estilos.descricao}>
                {descricao}
              </Text>
            )}
          </span>
          {dica && (
            <span className={estilos.dica} aria-hidden="true">
              {dica}
            </span>
          )}
          {atalho && <AtalhoDoItem teclas={atalho} />}
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

/**
 * O atalho no fim do item, em texto, como nos menus do macOS: "Ctrl+Shift+T", ou "⌃⇧T" no Mac. O
 * leitor de tela ouve o nome de cada tecla ("Control", não "⌃"), como descrição do item.
 */
function AtalhoDoItem({ teclas }: { teclas: string[] }) {
  const plataforma = plataformaAtual();
  const formatadas = formatarAtalho(teclas, plataforma);
  return (
    <Keyboard className={estilos.atalho}>
      <span aria-hidden="true">
        {formatadas.map(({ simbolo }) => simbolo).join(plataforma === 'mac' ? '' : '+')}
      </span>
      <span className={estilos.paraOLeitor}>{formatadas.map(({ nome }) => nome).join('+')}</span>
    </Keyboard>
  );
}

export interface PropsDoSubmenu {
  rotulo: string;
  /** O ícone antes do nome, como nos outros itens. */
  icone?: LucideIcon;
  /** Um texto curto no fim do item, como "+1 · ok · visto" no Reagir. */
  dica?: string;
  children: ReactNode;
}

/** Item que abre um submenu; o submenu recebe o nome do item e a camada do menu. */
export function Submenu({ rotulo, icone, dica, children }: PropsDoSubmenu) {
  const opaco = useContext(MenuOpaco);
  return (
    <SubmenuTrigger delay={tempos.menu.abrirSubmenu}>
      <ItemDeMenu icone={icone} dica={dica}>
        {rotulo}
      </ItemDeMenu>
      {/* Alinha o primeiro item do submenu ao item de origem (respiro de 4 px + borda). */}
      <PainelFlutuante offset={-2} crossOffset={-5} className={classeDoPainel(opaco)}>
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
