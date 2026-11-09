// A tendência (spec visualizacao-de-dados, "Tendência"; change visualizacoes-de-dados, design,
// decisão 6): a linha curta de uma série, com o último ponto marcado, o último valor e o período em
// texto, e a projeção tracejada.
import { caminhoDaTendencia, formatarNumero, type PontoDaTendencia } from './calculos.ts';
import type { Tinta } from './Medidor.tsx';
import estilos from './Tendencia.module.css';
import tintas from './tintas.module.css';

export interface PropsDaTendencia {
  /** O que a série mede, como "Rostos". */
  rotulo: string;
  pontos: PontoDaTendencia[];
  unidade?: string;
  /** O período em texto, como "30 dias". */
  periodo: string;
  projecao?: PontoDaTendencia;
  tinta?: Tinta;
  /** Sem o último valor ao lado, quando quem usa a tendência já mostra o número. */
  semNumero?: boolean;
}

const LARGURA = 120;
const ALTURA = 32;

export function Tendencia({
  rotulo,
  pontos,
  unidade,
  periodo,
  projecao,
  tinta = 'neutra',
  semNumero = false,
}: PropsDaTendencia) {
  if (pontos.length === 0) return <span className={estilos.semValor}>Sem dado</span>;
  const emOrdem = [...pontos].sort((a, b) => Date.parse(a.momento) - Date.parse(b.momento));
  const primeiro = emOrdem[0]?.valor ?? 0;
  const ultimo = emOrdem.at(-1)?.valor ?? 0;
  const caminho = caminhoDaTendencia(emOrdem, LARGURA, ALTURA, projecao);
  const nome = `${rotulo}: de ${formatarNumero(primeiro)} a ${formatarNumero(ultimo)} em ${periodo}`;
  return (
    <div className={`${estilos.tendencia} ${tintas.tintavel}`} data-tinta={tinta}>
      <svg
        role="img"
        aria-label={nome}
        className={estilos.grafico}
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        width={LARGURA}
        height={ALTURA}
      >
        <path className={estilos.linha} d={caminho.linha} />
        {caminho.projecao && (
          <path className={estilos.projecao} d={caminho.projecao} data-parte="projecao" />
        )}
        {caminho.ultimo && (
          <circle className={estilos.ponto} cx={caminho.ultimo.x} cy={caminho.ultimo.y} r={2.5} />
        )}
      </svg>
      {!semNumero && (
        <span className={estilos.valor} aria-hidden="true">
          <span>{formatarNumero(ultimo)}</span>
          {unidade && (
            <span className={estilos.unidade}>{unidade === '%' ? '%' : ` ${unidade}`}</span>
          )}
        </span>
      )}
      <span className={estilos.periodo} aria-hidden="true">
        {periodo}
      </span>
    </div>
  );
}
