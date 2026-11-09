import { useMemo } from 'react';
import { encode } from 'uqr';
import estilos from './CodigoQR.module.css';

export interface PropsDoCodigoQR {
  /** O texto que o código guarda, como a URI do app autenticador. */
  valor: string;
  /** O que o código contém, para o leitor de tela. A mesma informação fica em texto perto dele. */
  rotulo: string;
  /** Lado do quadrado, em px. */
  tamanho?: number;
  className?: string;
}

/** A margem branca em volta, em módulos, que os leitores de QR code precisam. */
const MARGEM = 4;

/** Cada módulo escuro como um quadrado de 1 × 1 num caminho só. */
function caminhoDosModulos(matriz: boolean[][]): string {
  return matriz
    .flatMap((linha, y) => linha.map((escuro, x) => (escuro ? `M${x} ${y}h1v1h-1z` : '')))
    .join('');
}

/** Código QR desenhado como vetor, nítido em qualquer escala. */
export function CodigoQR({ valor, rotulo, tamanho = 192, className }: PropsDoCodigoQR) {
  const { lado, caminho } = useMemo(() => {
    const { size, data } = encode(valor, { border: MARGEM, ecc: 'M' });
    return { lado: size, caminho: caminhoDosModulos(data) };
  }, [valor]);
  return (
    <svg
      role="img"
      aria-label={rotulo}
      viewBox={`0 0 ${lado} ${lado}`}
      width={tamanho}
      height={tamanho}
      shapeRendering="crispEdges"
      className={[estilos.codigo, className].filter(Boolean).join(' ')}
    >
      <rect width={lado} height={lado} className={estilos.fundo} />
      <path d={caminho} className={estilos.modulos} />
    </svg>
  );
}
