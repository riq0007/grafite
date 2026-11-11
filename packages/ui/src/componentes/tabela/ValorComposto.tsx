import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import estilos from './ValorComposto.module.css';

export interface PropsDoValorComposto {
  /** O que nunca encolhe: os rótulos de situação, o número ou o medidor. */
  fixo: ReactNode;
  /** O texto que acompanha o fixo, como a idade da leitura: é o primeiro a ser cortado. */
  children?: ReactNode;
}

/** As partes dadas juntas, num fragmento ou numa lista, uma a uma; a nula e a falsa saem. */
const partesDe = (no: ReactNode): ReactNode[] =>
  Children.toArray(no).flatMap((parte) =>
    isValidElement<{ children?: ReactNode }>(parte) && parte.type === Fragment
      ? partesDe(parte.props.children)
      : [parte],
  );

/**
 * As partes com um espaço entre elas no texto. O respiro à vista é do estilo, e o texto precisa do
 * espaço dele: sem isso, o leitor de tela, a busca na página e quem lê o texto da célula recebem
 * "Reconhecidopor Ana Souza".
 */
const comEspacos = (partes: readonly ReactNode[]) =>
  partes.map((parte, indice) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: as partes não trocam de ordem entre os desenhos.
    <Fragment key={indice}>
      {indice > 0 && ' '}
      {parte}
    </Fragment>
  ));

/**
 * O valor de uma célula com mais de uma parte (spec componentes-base, "Célula numa linha só"): as
 * partes ficam lado a lado, numa linha só. Quando a coluna é estreita, o fixo fica inteiro, e o
 * resto encolhe e termina em reticências. No resumo da linha, que mostra o valor inteiro, as mesmas
 * partes quebram a linha (`ResumoDaLinha.module.css`). Fora das tabelas, onde a linha pode quebrar,
 * as telas montam as partes do jeito delas.
 */
export function ValorComposto({ fixo, children }: PropsDoValorComposto) {
  const resto = partesDe(children);
  return (
    <span className={estilos.composto} data-composto="">
      <span className={estilos.fixo} data-parte="fixo">
        {comEspacos(partesDe(fixo))}
      </span>
      {resto.length > 0 && (
        <>
          {' '}
          <span className={estilos.resto} data-parte="resto">
            {comEspacos(resto)}
          </span>
        </>
      )}
    </span>
  );
}
