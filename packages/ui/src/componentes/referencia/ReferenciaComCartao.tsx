// A referência a um registro com o cartão do resumo (spec componentes-base, "Referência com cartão";
// change relacoes-vivas, design, decisão 2): o link para a ficha, com o nome em texto, e o cartão na
// camada flutuante com o ponteiro parado 500 ms sobre ele, ou com a seta para baixo no foco. O
// cartão fica aberto enquanto o ponteiro estiver sobre a referência ou sobre ele, e fecha com Esc,
// com o foco de volta na referência. No toque, que não tem ponteiro parado, é só o link.
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { tempos } from '../../tokens/tempos.ts';
import { PainelFlutuante } from '../flutuante/Flutuante.tsx';
import estilos from './ReferenciaComCartao.module.css';

export interface PropsDaReferenciaComCartao {
  /** O link para a ficha do registro, com o nome em texto, como o roteador da tela o desenha. */
  children: ReactElement;
  /** O nome do cartão para o leitor de tela, como "Resumo de Ana Souza". */
  titulo: string;
  /**
   * O conteúdo do cartão, desenhado só com ele aberto: é ele que busca o resumo, e a busca é
   * cancelada quando ele sai antes da resposta.
   */
  cartao: () => ReactNode;
}

/** Como o cartão abriu: pelo ponteiro, sem tirar o foco do lugar, ou pelo teclado, com o foco nele. */
type Abertura = 'ponteiro' | 'teclado';

const doMouse = (evento: PointerEvent) => evento.pointerType === 'mouse';

export function ReferenciaComCartao({ children, titulo, cartao }: PropsDaReferenciaComCartao) {
  const referencia = useRef<HTMLSpanElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState<Abertura | null>(null);
  const temporizador = useRef<number | undefined>(undefined);

  const parar = () => window.clearTimeout(temporizador.current);
  const depois = (ms: number, acao: () => void) => {
    parar();
    temporizador.current = window.setTimeout(acao, ms);
  };
  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  // Aberto pelo teclado, o foco vai ao cartão; o Tab segue para as ações.
  useEffect(() => {
    if (aberto === 'teclado') conteudo.current?.focus();
  }, [aberto]);

  const fechar = (devolverFoco: boolean) => {
    parar();
    setAberto(null);
    if (devolverFoco) referencia.current?.querySelector<HTMLElement>('a, [tabindex]')?.focus();
  };

  // O ponteiro: abre depois de parado; ao sair da referência e do cartão, fecha um pouco depois.
  const ponteiroEntrou = (evento: PointerEvent) => {
    if (!doMouse(evento)) return;
    if (aberto) parar();
    else depois(tempos.cartao.abrir, () => setAberto('ponteiro'));
  };
  const ponteiroSaiu = (evento: PointerEvent) => {
    if (!doMouse(evento)) return;
    if (aberto === 'ponteiro') depois(tempos.cartao.fechar, () => setAberto(null));
    else if (!aberto) parar();
  };

  const teclaNaReferencia = (evento: KeyboardEvent) => {
    // O Enter é do link: a linha da tabela em volta dele não abre.
    if (evento.key === 'Enter') evento.stopPropagation();
    // A seta e o Esc ficam com a referência: a prévia em volta não troca de registro nem fecha.
    if (evento.key === 'ArrowDown' && !aberto) {
      evento.preventDefault();
      evento.stopPropagation();
      parar();
      setAberto('teclado');
    } else if (evento.key === 'Escape' && aberto) {
      evento.preventDefault();
      evento.stopPropagation();
      fechar(false);
    }
  };

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: o link dentro é quem recebe o foco e o clique; a moldura só observa o ponteiro e a seta sobre ele. */}
      <span
        ref={referencia}
        className={estilos.referencia}
        onPointerEnter={ponteiroEntrou}
        onPointerLeave={ponteiroSaiu}
        onKeyDown={teclaNaReferencia}
        // O clique é do link: a linha da tabela em volta dele não abre nem entra na seleção.
        onClick={(evento) => evento.stopPropagation()}
      >
        {children}
      </span>
      <PainelFlutuante
        triggerRef={referencia}
        isOpen={aberto !== null}
        onOpenChange={(abrir) => {
          // O Esc com o foco no cartão devolve o foco à referência; o foco que saiu fica onde foi.
          if (!abrir) fechar(conteudo.current?.contains(document.activeElement) ?? false);
        }}
        isNonModal
        placement="bottom start"
        offset={6}
        className={estilos.painel}
      >
        <div
          ref={conteudo}
          role="dialog"
          aria-label={titulo}
          tabIndex={-1}
          className={estilos.conteudo}
          onPointerEnter={ponteiroEntrou}
          onPointerLeave={ponteiroSaiu}
        >
          {cartao()}
        </div>
      </PainelFlutuante>
    </>
  );
}
