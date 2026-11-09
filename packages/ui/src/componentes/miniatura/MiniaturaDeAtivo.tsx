import { useState } from 'react';
import { iconeDoTipo } from '../../icones/ativos.ts';
import { TRACO_DOS_ICONES } from '../../icones/Icone.tsx';
import estilos from './MiniaturaDeAtivo.module.css';

export interface PropsDaMiniatura {
  /** Tipo do ativo: define a imagem genérica. */
  tipo: string;
  imagemDoAtivo?: string;
  imagemDoModelo?: string;
  /** Texto alternativo. Sem ele a miniatura é decorativa: o nome do ativo já está ao lado. */
  rotulo?: string;
  className?: string;
}

type Origem = 'ativo' | 'modelo' | 'generica';

/**
 * Quadrado do tamanho da densidade com a imagem do ativo, a do modelo ou a genérica do tipo,
 * nessa ordem. Imagem que não carrega dá lugar à próxima; nenhuma é distorcida.
 */
export function MiniaturaDeAtivo({
  tipo,
  imagemDoAtivo,
  imagemDoModelo,
  rotulo,
  className,
}: PropsDaMiniatura) {
  const fila: Array<{ origem: Origem; src: string }> = [];
  if (imagemDoAtivo) fila.push({ origem: 'ativo', src: imagemDoAtivo });
  if (imagemDoModelo) fila.push({ origem: 'modelo', src: imagemDoModelo });

  // As falhas valem para esta fila; se as imagens mudarem, a contagem recomeça.
  const chave = fila.map((item) => item.src).join('\n');
  const [falhas, setFalhas] = useState({ chave, quantas: 0 });
  const quantas = falhas.chave === chave ? falhas.quantas : 0;
  const atual = fila[quantas];
  const Generica = iconeDoTipo(tipo);

  return (
    <span
      data-origem={atual?.origem ?? 'generica'}
      className={[estilos.miniatura, className].filter(Boolean).join(' ')}
    >
      {atual ? (
        <img
          src={atual.src}
          alt={rotulo ?? ''}
          loading="lazy"
          decoding="async"
          className={estilos.imagem}
          onError={() => setFalhas({ chave, quantas: quantas + 1 })}
        />
      ) : (
        <Generica
          className={estilos.generica}
          strokeWidth={TRACO_DOS_ICONES}
          focusable="false"
          {...(rotulo ? { role: 'img', 'aria-label': rotulo } : { 'aria-hidden': true })}
        />
      )}
    </span>
  );
}
