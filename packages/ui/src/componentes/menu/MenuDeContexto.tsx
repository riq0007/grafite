// O menu de contexto (spec componentes-base e tabelas-configuraveis): o mesmo menu, aberto no ponto
// do clique direito ou junto do elemento em foco, que fecha com Esc, com o clique fora e com a
// escolha de um item, e devolve o foco a quem o abriu. Os itens são os mesmos do menu com submenu:
// o item com `itens` abre a lista dele, com o mesmo teclado. A ação fica em cada item, como nos
// menus da casca, porque a do menu de fora não chega ao submenu.
//
// Além da lista de ações, o menu recebe os próprios itens do menu com submenu, como o da mensagem do
// chat (change chat-com-chamados, decisão 15): o ícone, o azul, o atalho, o item sem ação com o
// motivo e as reações marcadas. Com eles, a escolha de qualquer item, também no submenu, fecha o
// menu inteiro, como no menu que abre do botão, e o aviso da volta do foco deixa a ação que leva o
// foco a outro lugar agir depois de o menu sair.
//
// O botão direito fora do menu e o menu do navegador por cima dele são do registro do painel
// (`botaoDireito.ts`), como nos outros menus, listas e popovers do kit: aqui fica só a volta do
// foco, que não passa por cima do menu que o mesmo clique abriu, nem do campo onde ele caiu.
import { Fragment, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Menu as MenuDoReactAria, RootMenuTriggerStateContext } from 'react-aria-components';
import { createPortal } from 'react-dom';
import { useMenuTriggerState } from 'react-stately';
import { abriuOutroPainel, focoNumCampo, paineisAbertos } from '../flutuante/botaoDireito.ts';
import { PainelFlutuante } from '../flutuante/Flutuante.tsx';
import estilos from './Menu.module.css';
import { classeDoPainel, ItemDeMenu, MenuOpaco, Separador, Submenu } from './Menu.tsx';

/** Um item que age quando escolhido. */
export interface AcaoDoMenuDeContexto {
  id: string;
  rotulo: string;
  aoEscolher: () => void;
  /** Ação que apaga ou encerra algo: texto na cor crítica. */
  destrutivo?: boolean;
  /** Texto de apoio abaixo do nome, como "2 abertos". */
  descricao?: string;
  /** Uma linha antes do item, que o separa dos de cima, como as ações depois do "Abrir". */
  separadoAntes?: boolean;
}

/** Um item que abre um submenu, com o nome do item, como "Passar para…". */
export interface SubmenuDoMenuDeContexto {
  id: string;
  rotulo: string;
  itens: readonly AcaoDoMenuDeContexto[];
  /** Uma linha antes do item, que o separa dos de cima. */
  separadoAntes?: boolean;
}

export type ItemDoMenuDeContexto = AcaoDoMenuDeContexto | SubmenuDoMenuDeContexto;

export interface PropsDoMenuDeContexto {
  /** O nome do menu para o leitor de tela. */
  rotulo: string;
  /** Onde o menu abre, nas coordenadas da janela; nulo com o menu fechado. */
  posicao: { x: number; y: number } | null;
  /** As ações, cada uma com o nome e o que faz, como no quadro e na tabela. */
  itens?: readonly ItemDoMenuDeContexto[];
  /**
   * Os itens do menu com submenu (`ItemDeMenu`, `Submenu`, `SecaoDeMenu` e `Separador`), no lugar
   * das ações, como no menu da mensagem do chat. A ação fica em cada item, e a escolha em qualquer
   * nível fecha o menu inteiro.
   */
  children?: ReactNode;
  aoFechar: () => void;
  /** O elemento que recebe o foco de volta quando o menu fecha. */
  origem?: HTMLElement | null;
  /** Em camada opaca, como o menu da mensagem do chat, que abre sobre o texto da conversa. */
  opaco?: boolean;
  /**
   * O foco volta sem rolar a página, como na mensagem do chat, que, meio à vista, tiraria a conversa
   * do lugar.
   */
  semRolar?: boolean;
  /**
   * Depois de o foco voltar a quem abriu o menu, como o `aoSair` da folha: a ação que leva o foco a
   * outro lugar, como o diálogo e o campo de escrever, age aqui, e não na escolha, para a volta do
   * foco não passar por cima dela.
   */
  aoVoltarOFoco?: () => void;
}

/**
 * Com os itens do menu com submenu, o estado do menu que abre do botão, que os submenus seguem: a
 * escolha em qualquer nível fecha o menu inteiro por ele. Nasce a cada abertura, com o painel, e
 * nenhum submenu de uma abertura fica aberto na seguinte.
 */
function RaizDosItens({ aoFechar, children }: { aoFechar: () => void; children: ReactNode }) {
  const estado = useMenuTriggerState({
    isOpen: true,
    onOpenChange: (abrir) => {
      if (!abrir) aoFechar();
    },
  });
  return (
    <RootMenuTriggerStateContext.Provider value={estado}>
      {children}
    </RootMenuTriggerStateContext.Provider>
  );
}

export function MenuDeContexto({
  rotulo,
  posicao,
  itens = [],
  children,
  aoFechar,
  origem,
  opaco = false,
  semRolar = false,
  aoVoltarOFoco,
}: PropsDoMenuDeContexto) {
  // O ponto onde o menu abre: um elemento sem tamanho, fixo na janela, que o painel segue.
  const ponto = useRef<HTMLDivElement>(null);
  const comOsItens = children !== undefined;
  const aberto = posicao !== null && (comOsItens || itens.length > 0);
  // O menu fecha uma vez por abertura, mesmo quando a escolha e o painel avisam os dois.
  const fechou = useRef(false);
  useLayoutEffect(() => {
    if (posicao) fechou.current = false;
  }, [posicao]);
  // Cada abertura é um menu novo. O de uma tela que usa um só, como a tabela, fecha no aperto do
  // botão direito em outra linha e abre lá enquanto ainda sai: sem montar de novo, o React Aria não
  // leva o foco a ele, e a tela inerte o tira da linha.
  const [abertura, definirAbertura] = useState({ aberto, vez: 0 });
  if (aberto !== abertura.aberto) {
    definirAbertura({ aberto, vez: aberto ? abertura.vez + 1 : abertura.vez });
  }
  const fechar = () => {
    if (fechou.current) return;
    fechou.current = true;
    const antes = paineisAbertos();
    aoFechar();
    requestAnimationFrame(() => {
      // Outro painel abriu, como o menu de outra linha pelo botão direito fora deste, ou o foco foi a
      // um campo em que se digita, como a caixa onde o botão direito caiu: o foco fica onde está.
      if (!abriuOutroPainel(antes) && !focoNumCampo()) {
        origem?.focus(semRolar ? { preventScroll: true } : undefined);
      }
      aoVoltarOFoco?.();
    });
  };
  // O menu fecha antes da ação, para a ação achar o foco já de volta em quem o abriu.
  const acao = ({ id, rotulo: nome, aoEscolher, destrutivo, descricao }: AcaoDoMenuDeContexto) => (
    <ItemDeMenu
      key={id}
      id={id}
      destrutivo={destrutivo}
      descricao={descricao}
      onAction={() => {
        fechar();
        aoEscolher();
      }}
    >
      {nome}
    </ItemDeMenu>
  );
  return (
    <>
      {createPortal(
        <div
          ref={ponto}
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: posicao?.x ?? 0,
            top: posicao?.y ?? 0,
            width: 0,
            height: 0,
          }}
        />,
        document.body,
      )}
      <PainelFlutuante
        key={abertura.vez}
        triggerRef={ponto}
        isOpen={aberto}
        onOpenChange={(abrir) => {
          if (!abrir) fechar();
        }}
        aria-label={rotulo}
        placement="bottom start"
        offset={0}
        className={classeDoPainel(opaco)}
      >
        <MenuOpaco.Provider value={opaco}>
          {comOsItens ? (
            <RaizDosItens aoFechar={fechar}>
              <MenuDoReactAria aria-label={rotulo} autoFocus="first" className={estilos.menu}>
                {children}
              </MenuDoReactAria>
            </RaizDosItens>
          ) : (
            <MenuDoReactAria
              aria-label={rotulo}
              autoFocus="first"
              className={estilos.menu}
              onClose={fechar}
            >
              {itens.map((item) => (
                <Fragment key={item.id}>
                  {item.separadoAntes && <Separador />}
                  {'itens' in item ? (
                    <Submenu rotulo={item.rotulo}>{item.itens.map(acao)}</Submenu>
                  ) : (
                    acao(item)
                  )}
                </Fragment>
              ))}
            </MenuDoReactAria>
          )}
        </MenuOpaco.Provider>
      </PainelFlutuante>
    </>
  );
}
