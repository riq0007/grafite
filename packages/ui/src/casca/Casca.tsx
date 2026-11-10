import { type CSSProperties, type ReactNode, useId, useLayoutEffect, useState } from 'react';
import { casca as medidasDaCasca } from '../tokens/escalas.ts';
import { BarraDeAbas } from './BarraDeAbas.tsx';
import { BarraSuperior, type PropsDaBarraSuperior } from './BarraSuperior.tsx';
import estilos from './Casca.module.css';
import { Dock, type PropsDoDock } from './Dock.tsx';
import { useEstadoDaChegada } from './montagem.ts';
import { PainelDeBaixo } from './PainelDeBaixo.tsx';
import { type Postura, usePostura } from './postura.ts';
import type { ItemDoMenuDaCasca } from './tipos.ts';

export interface PropsDaCasca {
  barra: PropsDaBarraSuperior;
  dock: PropsDoDock;
  /** Força uma postura; sem ela, vale a do aparelho (ponteiro e largura da janela). */
  postura?: Postura;
  /** Conteúdo do módulo atual, dentro da janela. */
  children: ReactNode;
}

/**
 * Casca inteira: link "Ir para o conteúdo", barra superior, a janela de conteúdo e o dock.
 * A janela ocupa o espaço entre a barra e o dock; com o ocultar automático, o dock passa por
 * cima dela quando aparece, como no macOS.
 */
export function Casca({ barra, dock, postura: posturaForcada, children }: PropsDaCasca) {
  const idDoConteudo = useId();
  const posturaDoAparelho = usePostura();
  const postura = posturaForcada ?? posturaDoAparelho;
  const dockNaPostura = ajustarDock(dock, postura);
  const celular = postura === 'celular';
  const [arvoreAberta, definirArvoreAberta] = useState(false);
  const arvore = arvoreDoModulo(barra, dock);
  // Até a chegada mostrar a casca, ela espera por baixo, sem receber foco nem ser lida: no
  // carregamento, nas boas-vindas e, depois da entrada, até aparecer.
  const chegada = useEstadoDaChegada();
  const esperando = chegada === 'carregando' || chegada === 'boas-vindas' || chegada === 'entrada';

  // No <html>, para as camadas em portal (menus) também seguirem a postura.
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    raiz.setAttribute('data-postura', postura);
    return () => raiz.removeAttribute('data-postura');
  }, [postura]);

  return (
    <div
      className={estilos.casca}
      inert={esperando || undefined}
      data-postura={postura}
      data-dock={celular ? undefined : dockNaPostura.posicao}
      data-dock-ocultar={dockNaPostura.ocultar ? '' : undefined}
      style={{ '--tamanho-item-dock': `${dockNaPostura.tamanho}px` } as CSSProperties}
    >
      <a
        className={estilos.pular}
        href={`#${idDoConteudo}`}
        onClick={(evento) => {
          // Leva o foco sem mexer no endereço, que é do roteador, à área que rola, para o teclado
          // rolar o conteúdo; sem ela, à janela.
          evento.preventDefault();
          const janela = document.getElementById(idDoConteudo);
          const area = janela?.querySelector<HTMLElement>(':scope > [data-rolagem-da-janela]');
          (area ?? janela)?.focus();
        }}
      >
        Ir para o conteúdo
      </a>
      <div className={estilos.topo} data-montagem="barra">
        <BarraSuperior
          {...barra}
          // Sem menus no módulo, não há árvore para abrir: o nome fica só como texto.
          aoTocarNoNome={
            celular && arvore.itens.length > 0 ? () => definirArvoreAberta(true) : undefined
          }
        />
      </div>
      <div className={estilos.area}>
        <JanelaDeConteudo id={idDoConteudo}>{children}</JanelaDeConteudo>
      </div>
      {celular ? (
        <>
          <BarraDeAbas
            modulos={modulosDoCelular(dock)}
            atual={dock.atual}
            aoAbrirModulo={dock.aoAbrirModulo}
          />
          <PainelDeBaixo
            titulo={barra.modulo}
            aberto={arvoreAberta}
            aoMudarAberto={definirArvoreAberta}
            itens={arvore.itens}
            aoEscolher={arvore.escolher}
          />
        </>
      ) : (
        <Dock {...dockNaPostura} />
      )}
    </div>
  );
}

/**
 * O dock na postura: no tablet fica embaixo (a preferência salva não muda), com alvos de toque de
 * pelo menos 44 px e sem ampliação.
 */
function ajustarDock(dock: PropsDoDock, postura: Postura): PropsDoDock {
  if (postura !== 'tablet') return dock;
  return {
    ...dock,
    posicao: 'embaixo',
    tamanho: Math.max(dock.tamanho, medidasDaCasca.alvoDeToque),
    ampliar: false,
  };
}

/** Ids das folhas de uma árvore de menu (os itens que navegam). */
/**
 * Os módulos do celular: os do dock, os que a conta tirou dele e Ajustes. A barra de abas os
 * ordena pela prioridade de cada um, e o tirado do dock chega com a de ficar em "Mais".
 */
const modulosDoCelular = (dock: PropsDoDock) => [
  ...dock.modulos,
  ...(dock.modulosNoMais ?? []),
  ...(dock.modulosDoFim ?? []),
];

function folhas(itens: readonly ItemDoMenuDaCasca[]): string[] {
  return itens.flatMap((item) => (item.filhos ? folhas(item.filhos) : [item.id]));
}

/**
 * No celular, a árvore do módulo atual e os menus da barra num só painel: os menus da barra
 * entram como submenus. A escolha vai a quem registrou o item (o dock ou a barra).
 */
function arvoreDoModulo(barra: PropsDaBarraSuperior, dock: PropsDoDock) {
  const modulo = modulosDoCelular(dock).find((candidato) => candidato.id === dock.atual);
  const menus = barra.menus ?? [];
  const itens: ItemDoMenuDaCasca[] = [
    ...(modulo?.menu ?? []),
    ...menus.map((menu) => ({ id: `barra/${menu.id}`, rotulo: menu.rotulo, filhos: menu.itens })),
  ];
  const menuDoItem = new Map(
    menus.flatMap((menu) => folhas(menu.itens).map((id) => [id, menu.id] as const)),
  );
  const escolher = (idDoItem: string) => {
    const menu = menuDoItem.get(idDoItem);
    if (menu) barra.aoEscolherItem(menu, idDoItem);
    else if (dock.atual) dock.aoEscolherItem(dock.atual, idDoItem);
  };
  return { itens, escolher };
}

/**
 * A janela única do módulo: superfície sólida, sem arrastar nem botões de janela. O conteúdo vai
 * numa `RolagemDaJanela`, como a das abas da janela, que rola abaixo da barra delas.
 */
export function JanelaDeConteudo({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <main id={id} tabIndex={-1} className={estilos.janela} data-montagem="janela">
      {children}
    </main>
  );
}

/**
 * Título do conteúdo da janela. Recebe foco (sem entrar na ordem do Tab), para o app levá-lo a
 * ele depois de cada navegação, e o leitor de tela anunciar onde o usuário chegou. Com
 * `ocultarComAbas`, ele sai da vista quando a barra das abas aparece, porque a primeira aba já mostra
 * o nome, e continua para o leitor de tela e para o foco.
 */
export function TituloDaJanela({
  children,
  ocultarComAbas,
}: {
  children: ReactNode;
  ocultarComAbas?: boolean;
}) {
  return (
    <h1
      tabIndex={-1}
      className={estilos.titulo}
      data-titulo-da-janela=""
      data-ocultar-com-abas={ocultarComAbas || undefined}
    >
      {children}
    </h1>
  );
}
