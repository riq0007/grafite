// O cartucho (spec visualizacao-de-dados, "Cartucho"; change visualizacoes-de-dados, design, decisão 4):
// o nível de um suprimento na vertical, com a placa da tinta no topo, o corpo que enche de baixo para
// cima e o percentual e o nome embaixo. O que a impressora não mede nunca vira um percentual.
import type { IdDaTinta } from '../../tokens/gerador.ts';
import { RotuloDeSituacao } from '../situacao/RotuloDeSituacao.tsx';
import estilos from './Cartucho.module.css';
import { formatarNumero, posicaoNaRegua } from './calculos.ts';
import tintas from './tintas.module.css';

export type NivelDoCartucho =
  | { tipo: 'medido'; percentual: number }
  | { tipo: 'ha-suprimento' }
  | { tipo: 'sem-dado' }
  | { tipo: 'inconsistente'; valor: number | null };

export interface PropsDoCartucho {
  /** O nome do suprimento, como "Preto" ou "Cilindro". */
  nome: string;
  /** A tinta do cartucho; sem tinta, como no cilindro, a placa fica neutra. */
  tinta: IdDaTinta | null;
  nivel: NivelDoCartucho;
  /** A estimativa de quando acaba, já escrita como estimativa. */
  estimativa?: string;
  /** O limite que vale, em percentual, como o de uma regra de alerta. */
  limite?: number;
}

const LETRAS: Record<IdDaTinta, string> = { ciano: 'C', magenta: 'M', amarelo: 'Y', preto: 'K' };

/** O estado em texto, para o nome acessível de quem não é medido. */
function estadoEmTexto(nivel: Exclude<NivelDoCartucho, { tipo: 'medido' }>): string {
  switch (nivel.tipo) {
    case 'ha-suprimento':
      return 'há suprimento';
    case 'sem-dado':
      return 'sem dado';
    case 'inconsistente':
      return nivel.valor === null
        ? 'inconsistente'
        : `inconsistente, ${formatarNumero(nivel.valor, '%')}`;
  }
}

export function Cartucho({ nome, tinta, nivel, estimativa, limite }: PropsDoCartucho) {
  const medido = nivel.tipo === 'medido';
  const tanque = (
    <span className={estilos.tanque}>
      {medido && (
        <span
          className={estilos.nivel}
          data-parte="nivel"
          style={{ height: `${posicaoNaRegua(nivel.percentual, 100)}%` }}
        />
      )}
      {limite !== undefined && (
        <span
          className={estilos.limite}
          data-parte="limite"
          style={{ bottom: `${posicaoNaRegua(limite, 100)}%` }}
        />
      )}
    </span>
  );
  const placa = (
    <span className={estilos.placa} data-parte="placa" aria-hidden="true">
      {tinta ? LETRAS[tinta] : ''}
    </span>
  );
  return (
    <figure
      className={`${estilos.cartucho} ${tintas.tintavel}`}
      data-tinta={tinta ?? 'neutra'}
      data-hachurado={nivel.tipo === 'ha-suprimento' ? '' : undefined}
    >
      {medido ? (
        // biome-ignore lint/a11y/useSemanticElements: o cartucho desenha a placa da tinta e o corpo na vertical, que o <meter> nativo não tem.
        <span
          role="meter"
          aria-label={nome}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(0, nivel.percentual))}
          aria-valuetext={formatarNumero(nivel.percentual, '%')}
          className={estilos.corpo}
        >
          {placa}
          {tanque}
        </span>
      ) : (
        <span role="img" aria-label={`${nome}: ${estadoEmTexto(nivel)}`} className={estilos.corpo}>
          {placa}
          {tanque}
        </span>
      )}
      <figcaption className={estilos.legenda}>
        {medido && (
          <span className={estilos.numero} aria-hidden="true">
            {formatarNumero(nivel.percentual, '%')}
          </span>
        )}
        {nivel.tipo === 'ha-suprimento' && <span className={estilos.estado}>Há suprimento</span>}
        {nivel.tipo === 'sem-dado' && <span className={estilos.estado}>Sem dado</span>}
        {nivel.tipo === 'inconsistente' && (
          <>
            {nivel.valor !== null && (
              <span className={estilos.numero}>{formatarNumero(nivel.valor, '%')}</span>
            )}
            <RotuloDeSituacao situacao="atencao">Inconsistente</RotuloDeSituacao>
          </>
        )}
        <span className={estilos.nome}>{nome}</span>
        {estimativa && <span className={estilos.estimativa}>{estimativa}</span>}
      </figcaption>
    </figure>
  );
}
