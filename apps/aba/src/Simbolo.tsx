import estilos from './Simbolo.module.css';

// Os símbolos da aba, em SVG próprio de duas camadas (o mockup da ideia 18): o segundo tom, que o
// alto contraste apaga, e o traço.
const BILHETE =
  'M10 6H22a5 5 0 0 1 5 5v1.5a3.5 3.5 0 0 0 0 7V21a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5v-1.5a3.5 3.5 0 0 0 0-7V11a5 5 0 0 1 5-5z';
const BALAO =
  'M9 5.5h14a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-6.2L12.4 27a1.1 1.1 0 0 1-1.9-.8V23.5H9a5 5 0 0 1-5-5v-8a5 5 0 0 1 5-5z';

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
  chamado: (
    <>
      <path className={estilos.tom} d={BILHETE} />
      <path className={estilos.traco} d={BILHETE} />
      <path className={estilos.traco} d="M16 12.5v7M12.5 16h7" />
    </>
  ),
  chat: (
    <>
      <path className={estilos.tom} d={BALAO} />
      <path className={estilos.traco} d={BALAO} />
      <circle className={estilos.ponto} cx="11" cy="15" r="1.7" />
      <circle className={estilos.ponto} cx="16" cy="15" r="1.7" />
      <circle className={estilos.ponto} cx="21" cy="15" r="1.7" />
    </>
  ),
  lista: (
    <>
      <rect className={estilos.tom} x="5" y="4.5" width="22" height="23" rx="6" />
      <rect className={estilos.traco} x="5" y="4.5" width="22" height="23" rx="6" />
      <path className={estilos.traco} d="M9.6 11.2l1.8 1.8 3.2-3.5M18 11.2h5" />
      <circle className={estilos.ponto} cx="11" cy="17.2" r="1.4" />
      <circle className={estilos.ponto} cx="11" cy="22.2" r="1.4" />
      <path className={estilos.traco} d="M15 17.2h8M15 22.2h5.5" />
    </>
  ),
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
