// O medidor (spec visualizacao-de-dados, "Medidor"; change visualizacoes-de-dados, design, decisão 3):
// a régua de um valor de 0 ao máximo, com as marcas, o nível na tinta, o cursor do limite e o número.
import type { IdDaTinta } from '../../tokens/gerador.ts';
import { formatarNumero, posicaoNaRegua } from './calculos.ts';
import estilos from './Medidor.module.css';
import tintas from './tintas.module.css';

/** A tinta de um instrumento: a de um suprimento, uma série de dados ou a neutra. */
export type Tinta = IdDaTinta | 'neutra' | `serie-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export interface PropsDoMedidor {
  /** O nome acessível, como "Toner preto". */
  rotulo: string;
  /** O valor; vazio mostra `semValor`, sem a régua. */
  valor: number | null;
  maximo?: number;
  unidade?: string;
  /** As marcas, em percentual do máximo. */
  marcas?: number[];
  /** O limite que vale, como o de uma regra de alerta, com o texto dele. */
  limite?: { valor: number; rotulo: string };
  tinta?: Tinta;
  semValor?: string;
  tamanho?: 'compacto' | 'normal' | 'grande';
  /** Sem o número ao lado, quando quem usa o medidor já mostra o valor. */
  semNumero?: boolean;
}

const MARCAS = [25, 50, 75];

export function Medidor({
  rotulo,
  valor,
  maximo = 100,
  unidade = '%',
  marcas = MARCAS,
  limite,
  tinta = 'neutra',
  semValor = 'Sem dado',
  tamanho = 'normal',
  semNumero = false,
}: PropsDoMedidor) {
  if (valor === null) return <span className={estilos.semValor}>{semValor}</span>;
  const texto = formatarNumero(valor, unidade);
  return (
    <div
      className={`${estilos.medidor} ${tintas.tintavel}`}
      data-tinta={tinta}
      data-tamanho={tamanho}
      data-limite={limite ? '' : undefined}
    >
      <div className={estilos.linha}>
        {/* biome-ignore lint/a11y/useSemanticElements: a régua desenha as marcas e o cursor do limite, que o <meter> nativo não tem. */}
        <div
          role="meter"
          aria-label={rotulo}
          aria-valuemin={0}
          aria-valuemax={maximo}
          aria-valuenow={Math.min(maximo, Math.max(0, valor))}
          aria-valuetext={texto}
          className={estilos.regua}
        >
          <div className={estilos.trilha}>
            <div
              className={estilos.nivel}
              data-parte="nivel"
              style={{ width: `${posicaoNaRegua(valor, maximo)}%` }}
            />
            {marcas.map((marca) => (
              <span
                key={marca}
                className={estilos.marca}
                data-parte="marca"
                style={{ left: `${marca}%` }}
              />
            ))}
          </div>
          {limite && (
            <span
              className={estilos.limite}
              data-parte="limite"
              style={{ left: `${posicaoNaRegua(limite.valor, maximo)}%` }}
            />
          )}
        </div>
        {!semNumero && (
          <span className={estilos.numero} aria-hidden="true">
            {formatarNumero(valor)}
            <span className={estilos.unidade}>{unidade === '%' ? '%' : ` ${unidade}`}</span>
          </span>
        )}
      </div>
      {limite && (
        <span className={estilos.textoDoLimite}>
          <span aria-hidden="true">▲ </span>
          <span>{limite.rotulo}</span>
        </span>
      )}
    </div>
  );
}
