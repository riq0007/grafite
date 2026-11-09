import { ItemDeMenu, Separador, Submenu } from '../componentes/menu/Menu.tsx';
import type { ItemDoMenuDaCasca } from './tipos.ts';

/**
 * Itens de um menu da casca (dock ou barra): item que navega, submenu com os filhos e a linha
 * antes de um grupo. A ação fica em cada item, e vale também dentro dos submenus.
 */
export function itensDoMenu(
  itens: readonly ItemDoMenuDaCasca[],
  aoEscolher: (idDoItem: string) => void,
) {
  return itens.flatMap((item) => {
    const conteudo = item.filhos ? (
      <Submenu key={item.id} rotulo={item.rotulo}>
        {itensDoMenu(item.filhos, aoEscolher)}
      </Submenu>
    ) : (
      <ItemDeMenu
        key={item.id}
        id={item.id}
        icone={item.icone}
        onAction={() => aoEscolher(item.id)}
      >
        {item.rotulo}
      </ItemDeMenu>
    );
    return item.separadoAntes ? [<Separador key={`${item.id}/separador`} />, conteudo] : [conteudo];
  });
}
