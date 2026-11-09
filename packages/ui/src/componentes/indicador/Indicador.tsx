import { type HTMLAttributes, type ReactNode, useId } from 'react';
import { RotuloDeSituacao, type Situacao } from '../situacao/RotuloDeSituacao.tsx';
import estilos from './Indicador.module.css';

export type SituacaoDoIndicador = 'dentro' | 'fora' | 'sem-dado';

const ROTULOS: Record<SituacaoDoIndicador, { situacao: Situacao; texto: string }> = {
  dentro: { situacao: 'sucesso', texto: 'Dentro da meta' },
  fora: { situacao: 'atencao', texto: 'Fora da meta' },
  'sem-dado': { situacao: 'neutra', texto: 'Sem dado' },
};

export interface PropsDoIndicador extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** O nome, que é o título da seção. */
  nome: string;
  /** Uma linha com o que o indicador mede. */
  mede: string;
  /** A base do cálculo, como "Mediana de 3 trocas". */
  base?: string;
  /** O valor em texto, como "1,5 dia". Sem ele, o indicador mostra `semValor`. */
  valor?: string;
  /** O motivo de não ter valor, como "Nenhum toner trocado nos últimos 30 dias.". */
  semValor?: string;
  /** O valor do período anterior em texto, como "2,3 dias" ou "sem dado". */
  anterior: string;
  /** A meta em texto, como "2 dias". */
  meta: string;
  situacao: SituacaoDoIndicador;
  /** O que fazer com o indicador fora da meta. */
  decisao: string;
  /** A ação de quem usa o indicador, como "Mudar a meta". */
  acao?: ReactNode;
  /** O detalhe, como a lista do que passou da meta. */
  children?: ReactNode;
}

/**
 * Um indicador com a meta e a decisão: o número só existe com a meta ao lado, a situação em texto e,
 * fora da meta, o que fazer. Sem valor, o motivo fica no lugar do número, e nunca um zero.
 */
export function Indicador({
  nome,
  mede,
  base,
  valor,
  semValor,
  anterior,
  meta,
  situacao,
  decisao,
  acao,
  children,
  className,
  ...resto
}: PropsDoIndicador) {
  const idDoTitulo = useId();
  const rotulo = ROTULOS[situacao];
  return (
    <section
      aria-labelledby={idDoTitulo}
      tabIndex={-1}
      className={[estilos.indicador, className].filter(Boolean).join(' ')}
      {...resto}
    >
      <header className={estilos.cabecalho}>
        <div className={estilos.titulos}>
          <h2 id={idDoTitulo} className={estilos.nome}>
            {nome}
          </h2>
          <p className={estilos.mede}>{mede}</p>
        </div>
        {acao}
      </header>
      <div className={estilos.numeros}>
        {valor !== undefined ? (
          <p className={estilos.valor} data-valor="">
            {valor}
          </p>
        ) : (
          <p className={estilos.semValor}>{semValor}</p>
        )}
        <div className={estilos.contexto}>
          <RotuloDeSituacao situacao={rotulo.situacao}>{rotulo.texto}</RotuloDeSituacao>
          <p>Meta: {meta}</p>
          <p>Antes: {anterior}</p>
          {base ? <p>{base}</p> : null}
        </div>
      </div>
      {situacao === 'fora' ? (
        <p className={estilos.decisao}>
          <strong>O que fazer:</strong> {decisao}
        </p>
      ) : null}
      {children}
    </section>
  );
}
