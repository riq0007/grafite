// O lugar onde se soltam arquivos, como a conversa do chat e a do chamado aberto (spec modulo-chat,
// "Caixa de escrever do chat"; spec modulo-chamados, "Campo de escrever"; change chat-com-chamados,
// design, decisão 15, "colar e soltar", tarefa 4.19): com arquivos sobre ele, "Solte para anexar"
// cobre o lugar, e soltá-los os entrega a quem os recebe dentro dele, como a caixa de escrever, que
// os anexa como o clipe. Sem quem receba, como na conversa sem a caixa, ou com ele ocupado, como
// durante o envio, o lugar recusa o arquivo, com o cursor de que não se solta. O que não é dele, como
// o diálogo aberto de dentro, que vai para o `body`, e o arrasto que nasce na página, fica para a
// guarda da casca (`ligarGuardaDoSoltar`). O `useDrop` do React Aria, e não o `DropZone`, que põe um
// botão escondido na ordem do Tab: quem usa o teclado anexa pelo clipe.
import { Paperclip } from 'lucide-react';
import {
  createContext,
  type DragEvent,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isFileDropItem, useDrop } from 'react-aria';
import { Icone } from '../../icones/Icone.tsx';
import estilos from './LugarDeSoltar.module.css';

/** Quem recebe os arquivos soltos, na ordem em que vieram. */
export type ReceberOsSoltos = (arquivos: File[]) => void;

interface RegistroDoLugar {
  registrar: (receber: ReceberOsSoltos | null) => void;
}

const RegistroDoLugar = createContext<RegistroDoLugar | null>(null);

/**
 * Quem recebe os arquivos soltos no lugar de soltar em volta, como a caixa de escrever; nulo, ninguém
 * recebe, como durante o envio. Um só recebe em cada lugar. Fora de um lugar de soltar, nada muda.
 */
export function useArquivosSoltos(receber: ReceberOsSoltos | null) {
  const registro = useContext(RegistroDoLugar);
  // O de agora, para o lugar não registrar de novo a cada renderização de quem recebe.
  const atual = useRef(receber);
  useLayoutEffect(() => {
    atual.current = receber;
  });
  const recebe = receber !== null;
  useLayoutEffect(() => {
    if (!registro || !recebe) return;
    registro.registrar((arquivos) => atual.current?.(arquivos));
    return () => registro.registrar(null);
  }, [registro, recebe]);
}

export interface PropsDoLugarDeSoltar {
  className?: string;
  children: ReactNode;
}

/**
 * Se o arrasto em curso nasceu na página, como o de uma imagem dela, que leva "Files" no Chromium. O
 * arquivo do computador entra na janela sem o `dragstart`. Acaba no `dragend` e, depois de todos
 * tratarem o soltar, no `drop`, para quando quem começou o arrasto saiu da página no meio dele.
 */
function useArrastoDaPagina() {
  const daPagina = useRef(false);
  useEffect(() => {
    const comecar = () => {
      daPagina.current = true;
    };
    const acabar = () => {
      daPagina.current = false;
    };
    const acabarDepois = () => {
      setTimeout(acabar);
    };
    window.addEventListener('dragstart', comecar, true);
    window.addEventListener('dragend', acabar, true);
    window.addEventListener('drop', acabarDepois, true);
    return () => {
      window.removeEventListener('dragstart', comecar, true);
      window.removeEventListener('dragend', acabar, true);
      window.removeEventListener('drop', acabarDepois, true);
    };
  }, []);
  return daPagina;
}

export function LugarDeSoltar({ className, children }: PropsDoLugarDeSoltar) {
  const lugar = useRef<HTMLDivElement>(null);
  const receptor = useRef<ReceberOsSoltos | null>(null);
  const [recebe, definirRecebe] = useState(false);
  const daPagina = useArrastoDaPagina();
  /**
   * Só o arrasto de arquivos do computador sobre o lugar: o texto arrastado segue para os campos de
   * dentro, como o navegador faz. O evento sobe pela árvore do React, e não pela da página, então o
   * do diálogo aberto de dentro, que vai para o `body`, também chega aqui: ele fica para a guarda.
   */
  const soComArquivos =
    <E extends DragEvent<HTMLDivElement>>(manipular: ((evento: E) => void) | undefined) =>
    (evento: E) => {
      if (
        evento.dataTransfer.types.includes('Files') &&
        !daPagina.current &&
        evento.currentTarget.contains(evento.target as Node)
      )
        manipular?.(evento);
    };
  const registro = useMemo<RegistroDoLugar>(
    () => ({
      registrar: (receber) => {
        receptor.current = receber;
        definirRecebe(receber !== null);
      },
    }),
    [],
  );
  // Sempre ligado, e recusando sem quem receba: desligado, o `useDrop` deixaria de ver o arrasto que
  // sai, e o aviso voltaria sozinho com a caixa que volta depois.
  const { dropProps, isDropTarget } = useDrop({
    ref: lugar,
    getDropOperation: () => (recebe ? 'copy' : 'cancel'),
    onDrop: async (evento) => {
      const arquivos = await Promise.all(
        evento.items.filter(isFileDropItem).map((item) => item.getFile()),
      );
      if (arquivos.length > 0) receptor.current?.(arquivos);
    },
  });
  // A caixa que sai no meio do arrasto tira o aviso; o arrasto segue recusado até sair.
  const soltando = recebe && isDropTarget;
  return (
    <RegistroDoLugar.Provider value={registro}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: o arrasto do mouse não é uma ação do lugar, que não ganha papel nem foco: o teclado anexa pelo clipe da caixa. */}
      <div
        ref={lugar}
        {...dropProps}
        onDragEnter={soComArquivos(dropProps.onDragEnter)}
        onDragOver={soComArquivos(dropProps.onDragOver)}
        onDragLeave={soComArquivos(dropProps.onDragLeave)}
        onDrop={soComArquivos(dropProps.onDrop)}
        className={[estilos.lugar, className].filter(Boolean).join(' ')}
        data-soltando={soltando || undefined}
      >
        {children}
        {soltando && (
          <div className={estilos.aviso}>
            <Icone icone={Paperclip} tamanho={24} />
            Solte para anexar
          </div>
        )}
      </div>
    </RegistroDoLugar.Provider>
  );
}
