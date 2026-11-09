// A contagem (spec visualizacao-de-dados, "Contagem"; change visualizacoes-de-dados, design, decisão
// 7): um número em numeral, com a unidade, o rótulo, a capacidade com a régua da ocupação e a
// variação em texto, sem cor, porque subir não é bom nem ruim por si.

import estilos from './Contagem.module.css';
import { formatarNumero } from './calculos.ts';
import { Medidor, type Tinta } from './Medidor.tsx';

export interface PropsDaContagem {
  rotulo: string;
  valor: number | null;
  unidade?: string;
  /** O máximo que cabe, como os rostos que o controle guarda. */
  capacidade?: number;
  /** A variação desde a leitura anterior, como "+3 desde o backup anterior". */
  variacao?: { valor: number; desde: string };
  semValor?: string;
  tinta?: Tinta;
}

function textoDaVariacao({ valor, desde }: { valor: number; desde: string }): string {
  if (valor === 0) return `Sem mudança desde ${desde}`;
  const sinal = valor > 0 ? '+' : '−';
  return `${sinal}${formatarNumero(Math.abs(valor))} desde ${desde}`;
}

export function Contagem({
  rotulo,
  valor,
  unidade,
  capacidade,
  variacao,
  semValor = 'Sem dado',
  tinta = 'neutra',
}: PropsDaContagem) {
  return (
    <div className={estilos.contagem}>
      <span className={estilos.rotulo}>{rotulo}</span>
      {valor === null ? (
        <span className={estilos.semValor}>{semValor}</span>
      ) : (
        <>
          <span className={estilos.linha}>
            <span className={estilos.numero}>{formatarNumero(valor)}</span>
            {capacidade !== undefined && (
              <span className={estilos.capacidade}>{`de ${formatarNumero(capacidade)}`}</span>
            )}
            {unidade && <span className={estilos.unidade}>{unidade}</span>}
          </span>
          {capacidade !== undefined && (
            <Medidor
              rotulo={`${rotulo}: ocupação`}
              valor={valor}
              maximo={capacidade}
              unidade={unidade ?? ''}
              tamanho="compacto"
              tinta={tinta}
              semNumero
            />
          )}
          {variacao && <span className={estilos.variacao}>{textoDaVariacao(variacao)}</span>}
        </>
      )}
    </div>
  );
}
