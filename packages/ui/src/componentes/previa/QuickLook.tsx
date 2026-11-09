import { X } from 'lucide-react';
import { isValidElement, type ReactNode, useCallback, useRef } from 'react';
import { VisuallyHidden } from 'react-aria';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { BotaoDeIcone } from '../../icones/Icone.tsx';
import { Botao } from '../botao/Botao.tsx';
import { Esqueleto } from '../exibicao/Esqueleto.tsx';
import { MiniaturaDeAtivo } from '../miniatura/MiniaturaDeAtivo.tsx';
import estilos from './QuickLook.module.css';

/** Um campo principal do registro, com rótulo e valor. */
export interface CampoDaPrevia {
  rotulo: string;
  valor: string;
  /** O valor desenhado, como uma referência com cartão; sem ele, o texto do valor. */
  conteudo?: ReactNode;
  /** Identificadores (patrimônio, série, IP, MAC) vão na fonte monoespaçada. */
  mono?: boolean;
}

/** Uma ação do registro. A principal, como "Abrir", também responde ao Enter. */
export interface AcaoDaPrevia {
  id: string;
  rotulo: string;
  principal?: boolean;
  aoEscolher: () => void;
}

/** A imagem do registro: a do ativo, a do modelo ou a genérica do tipo, nessa ordem. */
export interface VisualDoRegistro {
  tipo: string;
  imagemDoAtivo?: string;
  imagemDoModelo?: string;
}

export interface PropsDoQuickLook {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  /** O tipo ou o modelo, abaixo do título. */
  subtitulo?: string;
  /** Posição do registro na lista, a partir de 1. */
  posicao: number;
  total: number;
  /** A imagem do registro, ou outro visual no lugar dela, como o 3D do T1. */
  visual: VisualDoRegistro | ReactNode;
  campos?: readonly CampoDaPrevia[];
  estado?: 'carregando' | 'erro' | 'pronto';
  aoTentarDeNovo?: () => void;
  acoes?: readonly AcaoDaPrevia[];
  /** Sem ele, a seta que volta não faz nada: é o primeiro registro. */
  aoAnterior?: () => void;
  /** Sem ele, a seta que avança não faz nada: é o último registro. */
  aoSeguinte?: () => void;
}

const ehVisualDoRegistro = (visual: PropsDoQuickLook['visual']): visual is VisualDoRegistro =>
  typeof visual === 'object' && visual !== null && !isValidElement(visual) && 'tipo' in visual;

/**
 * Prévia de um registro sem sair da lista (spec quick-look): uma camada de superfície sólida,
 * sem véu, para a lista continuar à vista, com o foco preso enquanto está aberta.
 */
export function QuickLook(props: PropsDoQuickLook) {
  const {
    aberta,
    aoFechar,
    titulo,
    subtitulo,
    posicao,
    total,
    visual,
    campos = [],
    estado = 'pronto',
    aoTentarDeNovo,
    acoes = [],
  } = props;
  const teclado = useTecladoDaPrevia(props);
  return (
    <ModalOverlay
      isOpen={aberta}
      onOpenChange={(valor) => {
        if (!valor) aoFechar();
      }}
      isDismissable
      className={estilos.fundo}
    >
      <Modal className={estilos.painel}>
        <Dialog ref={teclado} aria-label={`Prévia: ${titulo}`} className={estilos.dialogo}>
          <div className={estilos.cabecalho}>
            <div className={estilos.titulos}>
              <Heading slot="title" className={estilos.titulo}>
                {titulo}
              </Heading>
              {subtitulo && <p className={estilos.subtitulo}>{subtitulo}</p>}
            </div>
            <span className={estilos.posicao}>
              {posicao} de {total}
            </span>
            <BotaoDeIcone icone={X} rotulo="Fechar" slot="close" comDica={false} />
          </div>
          <div className={estilos.corpo}>
            <div className={estilos.visual}>
              {ehVisualDoRegistro(visual) ? (
                <MiniaturaDeAtivo {...visual} rotulo={titulo} className={estilos.imagem} />
              ) : (
                visual
              )}
            </div>
            {estado === 'carregando' ? (
              <div aria-busy="true" className={estilos.campos}>
                <VisuallyHidden>Carregando os dados do registro…</VisuallyHidden>
                {[1, 2, 3, 4].map((linha) => (
                  <div key={linha} className={estilos.campo}>
                    <Esqueleto largura="40%" />
                    <Esqueleto largura="70%" />
                  </div>
                ))}
              </div>
            ) : estado === 'erro' ? (
              <div role="alert" className={estilos.erro}>
                <p className={estilos.textoDoErro}>Não foi possível carregar a prévia.</p>
                {aoTentarDeNovo && <Botao onPress={aoTentarDeNovo}>Tentar de novo</Botao>}
              </div>
            ) : (
              <dl className={estilos.campos}>
                {campos.map((campo) => (
                  <div key={campo.rotulo} className={estilos.campo}>
                    <dt className={estilos.rotulo}>{campo.rotulo}</dt>
                    <dd className={campo.mono ? `mono ${estilos.valor}` : estilos.valor}>
                      {campo.conteudo ?? campo.valor}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          {acoes.length > 0 && (
            <div className={estilos.acoes}>
              {acoes.map((acao) => (
                <Botao
                  key={acao.id}
                  nivel={acao.principal ? 'primario' : 'secundario'}
                  onPress={acao.aoEscolher}
                >
                  {acao.rotulo}
                </Botao>
              ))}
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** Controles que respondem ao próprio Enter e à própria barra de espaço. */
const CONTROLE = 'button, a[href], input, select, textarea, [role="button"]';

/**
 * O teclado da prévia, preso ao elemento do diálogo (o Dialog do React Aria não repassa o
 * onKeyDown): as setas trocam de registro, sem dar a volta; Enter aciona a ação principal; a barra
 * de espaço fecha. Num controle, Enter e espaço ficam com o controle.
 */
function useTecladoDaPrevia(props: PropsDoQuickLook) {
  const atuais = useRef(props);
  atuais.current = props;
  const desligar = useRef<() => void>(() => {});
  return useCallback((dialogo: HTMLElement | null) => {
    desligar.current();
    if (!dialogo) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      const { aoAnterior, aoSeguinte, aoFechar, acoes = [] } = atuais.current;
      const noControle = (evento.target as HTMLElement).closest(CONTROLE) !== null;
      // Num link, a seta para baixo é dele: abre o cartão da referência.
      const noLink = (evento.target as HTMLElement).closest('a[href]') !== null;
      if (evento.key === 'ArrowDown' && noLink) return;
      if (evento.key === 'ArrowUp' || evento.key === 'ArrowLeft') {
        evento.preventDefault();
        aoAnterior?.();
      } else if (evento.key === 'ArrowDown' || evento.key === 'ArrowRight') {
        evento.preventDefault();
        aoSeguinte?.();
      } else if (evento.key === 'Enter' && !noControle) {
        const principal = acoes.find((acao) => acao.principal);
        if (!principal) return;
        evento.preventDefault();
        principal.aoEscolher();
      } else if (evento.key === ' ' && !noControle) {
        evento.preventDefault();
        aoFechar();
      }
    };
    dialogo.addEventListener('keydown', aoTeclar);
    desligar.current = () => dialogo.removeEventListener('keydown', aoTeclar);
  }, []);
}
