import estilos from './Simbolo.module.css';

// Os símbolos da aba, em SVG próprio de duas camadas (o mockup da ideia 18): o segundo tom, que o
// alto contraste apaga, e o traço.
const SIMBOLOS = {
  ajuda: (
    <>
      <circle className={estilos.tom} cx="16" cy="16" r="11" />
      <circle className={estilos.traco} cx="16" cy="16" r="11" />
      <path className={estilos.traco} d="M12.6 12.8a3.6 3.6 0 0 1 6.8 1.5c0 2.4-3.4 2.9-3.4 5" />
      <circle className={estilos.ponto} cx="16" cy="22.4" r="1.4" />
    </>
  ),
  baixo: <path className={estilos.traco} d="M9 13l7 7 7-7" />,
} as const;

export type NomeDoSimbolo = keyof typeof SIMBOLOS;

export function Simbolo({ nome, className }: { nome: NomeDoSimbolo; className?: string }) {
  return (
    <svg
      className={className ? `${estilos.simbolo} ${className}` : estilos.simbolo}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      {SIMBOLOS[nome]}
    </svg>
  );
}
