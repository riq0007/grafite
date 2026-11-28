import { type Ref, type RefObject, useRef } from 'react';
import estilos from './AbaFechada.module.css';
import encaixe from './Encaixe.module.css';
import type { AvisoDaResposta } from './estado.ts';
import { type FormaMedida, useEntradaDaForma, useLarguraAnimada } from './movimento.ts';
import type { FormaDaAba } from './nativo.ts';
import { Simbolo } from './Simbolo.tsx';

export const ROTULO_DA_ABA = 'Suporte da TI';

interface Props {
  forma: FormaDaAba;
  compacta: boolean;
  /** A resposta por ver: a aba alarga e diz o aviso em texto, com o ponto ao lado. */
  aviso?: AvisoDaResposta | null;
  /** O ponto pulsa uma vez na chegada, e não de novo quando a aba volta do painel. */
  pulsar?: boolean;
  /** A largura do painel que acabou de fechar: a aba anima dela para a sua. */
  deLargura?: number | null;
  /** A linha da apresentação que acabou: a aba volta dela em 220 ms. */
  deLinha?: FormaMedida | null;
  /** Sem a API, ou a pessoa recusada: o tom neutro, com "Sem conexão" escrito. */
  semConexao?: boolean;
  ref?: Ref<HTMLButtonElement>;
  aoAbrir?: () => void;
}

/**
 * A aba fechada (spec aba-dos-colaboradores, "Aba fechada" e "Aviso da resposta nova"): a pílula de
 * fábrica ou o entalhe preso à borda de cima, sem o logo, com os estados repouso, mouse em cima,
 * pressionada e foco. Com uma resposta por ver, ela alarga e diz o aviso; o ponto pulsa uma vez.
 */
export function AbaFechada({
  forma,
  compacta,
  aviso = null,
  pulsar = false,
  deLargura = null,
  deLinha = null,
  semConexao = false,
  ref,
  aoAbrir,
}: Props) {
  const propria = useRef<HTMLButtonElement | null>(null);
  const guardar = (elemento: HTMLButtonElement | null) => {
    propria.current = elemento;
    if (typeof ref === 'function') ref(elemento);
    else if (ref) (ref as RefObject<HTMLButtonElement | null>).current = elemento;
  };
  const textoDoAviso = aviso ? `${aviso.resumo}|${aviso.detalhe ?? ''}` : '';
  useLarguraAnimada(propria, textoDoAviso, `${forma} ${compacta}`, deLargura);
  useEntradaDaForma(propria, deLinha, 'abrir');

  const classes = [
    estilos.aba,
    estilos[forma],
    forma === 'entalhe' && encaixe.encaixe,
    compacta && forma === 'pilula' && estilos.compacta,
    aviso && !semConexao && estilos.comAviso,
    semConexao && estilos.semConexao,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={guardar}
      type="button"
      className={classes}
      data-forma={forma}
      aria-haspopup="dialog"
      aria-expanded={false}
      onClick={aoAbrir}
    >
      {semConexao ? (
        <>
          <span className={estilos.soParaOLeitor}>{ROTULO_DA_ABA}: </span>
          <span className={estilos.disco}>
            <Simbolo nome="semRede" />
          </span>
          Sem conexão
        </>
      ) : aviso ? (
        <>
          <span className={estilos.soParaOLeitor}>{ROTULO_DA_ABA}: </span>
          <span
            key={aviso.chegada}
            className={`${estilos.ponto} ${pulsar ? estilos.pulsando : ''}`}
          />
          <span key={textoDoAviso} className={estilos.aviso}>
            <span className={estilos.resumo}>{aviso.resumo}</span>
            {aviso.detalhe && <span className={estilos.detalhe}> · {aviso.detalhe}</span>}
          </span>
        </>
      ) : (
        <>
          <span className={estilos.disco}>
            <Simbolo nome="ajuda" />
          </span>
          {ROTULO_DA_ABA}
        </>
      )}
      <Simbolo nome="baixo" className={estilos.seta} />
    </button>
  );
}
