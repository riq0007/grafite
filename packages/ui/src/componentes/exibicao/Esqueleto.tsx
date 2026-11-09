import estilos from './Exibicao.module.css';

export interface PropsDoEsqueleto {
  largura?: string;
  altura?: string;
  forma?: 'linha' | 'bloco' | 'circulo';
  className?: string;
}

/**
 * Forma provisória do conteúdo enquanto ele carrega. É só desenho: a área que carrega deve ter
 * aria-busy e um texto de estado para o leitor de tela.
 */
export function Esqueleto({
  largura = '100%',
  altura,
  forma = 'linha',
  className,
}: PropsDoEsqueleto) {
  return (
    <span
      aria-hidden="true"
      data-forma={forma}
      className={[estilos.esqueleto, className].filter(Boolean).join(' ')}
      style={{ width: largura, height: altura }}
    />
  );
}
