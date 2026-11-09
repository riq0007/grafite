import type { ReactNode } from 'react';
import { Button } from 'react-aria-components';
import { Marca } from '../brand/Marca.tsx';
import { Avatar, type ImagensDoAvatar } from '../componentes/avatar/Avatar.tsx';
import { Menu, Submenu } from '../componentes/menu/Menu.tsx';
import estilos from './BarraSuperior.module.css';
import { itensDoMenu } from './itensDoMenu.tsx';
import type { ItemDoMenuDaCasca, MenuDaBarra } from './tipos.ts';

/** Menu do usuário, no fim da barra. */
export interface UsuarioDaBarra {
  /** Nome da pessoa da conta. Sem a sessão conhecida (servidor fora do ar), fica vazio, e o avatar é neutro. */
  nome?: string;
  /** As miniaturas da foto da pessoa da conta; sem foto, o avatar mostra as iniciais. */
  imagens?: ImagensDoAvatar;
  itens: readonly ItemDoMenuDaCasca[];
  aoEscolherItem: (idDoItem: string) => void;
}

export interface PropsDaBarraSuperior {
  /** Nome do módulo atual. */
  modulo: string;
  /** Menus que o módulo registra para a barra, como Visualizar e Ações. */
  menus?: readonly MenuDaBarra[];
  aoEscolherItem: (idDoMenu: string, idDoItem: string) => void;
  /**
   * Itens de status, à direita: rede, relógio e usuário, montados pelo app. No celular, só os
   * marcados com data-essencial ficam à vista.
   */
  status?: ReactNode;
  /** Menu do usuário, depois dos itens de status; fica à vista também no celular. */
  usuario?: UsuarioDaBarra;
  /** No celular: o nome do módulo vira um botão, que abre a árvore de menus num painel. */
  aoTocarNoNome?: () => void;
}

/**
 * Barra superior da casca: a marca, o módulo atual e os menus dele à esquerda; os itens de
 * status à direita. Abaixo de 1024 px de largura, os menus do módulo se reúnem num só, no nome
 * do módulo (container query: a barra ocupa a largura da janela).
 */
export function BarraSuperior({
  modulo,
  menus = [],
  aoEscolherItem,
  status,
  usuario,
  aoTocarNoNome,
}: PropsDaBarraSuperior) {
  const comMenus = menus.length > 0 && !aoTocarNoNome;
  return (
    <header className={estilos.barra}>
      <div className={estilos.inicio}>
        <span className={estilos.marca}>
          <Marca altura={14} />
        </span>
        {aoTocarNoNome ? (
          <Button className={`${estilos.gatilho} ${estilos.nome}`} onPress={aoTocarNoNome}>
            {modulo}
          </Button>
        ) : (
          <strong className={comMenus ? estilos.nomeLargo : estilos.nome}>{modulo}</strong>
        )}
        {comMenus && (
          <>
            <div className={estilos.menusLargos}>
              {menus.map((menu) => (
                <Menu
                  key={menu.id}
                  rotulo={menu.rotulo}
                  gatilho={<Button className={estilos.gatilho}>{menu.rotulo}</Button>}
                >
                  {itensDoMenu(menu.itens, (idDoItem) => aoEscolherItem(menu.id, idDoItem))}
                </Menu>
              ))}
            </div>
            <div className={estilos.menusReunidos}>
              <Menu
                rotulo={modulo}
                gatilho={<Button className={`${estilos.gatilho} ${estilos.nome}`}>{modulo}</Button>}
              >
                {menus.map((menu) => (
                  <Submenu key={menu.id} rotulo={menu.rotulo}>
                    {itensDoMenu(menu.itens, (idDoItem) => aoEscolherItem(menu.id, idDoItem))}
                  </Submenu>
                ))}
              </Menu>
            </div>
          </>
        )}
      </div>
      <div className={estilos.status}>
        {status}
        {usuario && (
          <span data-essencial="">
            <Menu
              rotulo={usuario.nome ?? 'Usuário'}
              gatilho={
                <Button
                  aria-label={usuario.nome ?? 'Usuário'}
                  className={`${estilos.gatilho} ${estilos.usuario}`}
                >
                  <Avatar
                    nome={usuario.nome}
                    imagens={usuario.imagens}
                    tamanho="barra"
                    decorativo
                  />
                </Button>
              }
            >
              {itensDoMenu(usuario.itens, usuario.aoEscolherItem)}
            </Menu>
          </span>
        )}
      </div>
    </header>
  );
}
