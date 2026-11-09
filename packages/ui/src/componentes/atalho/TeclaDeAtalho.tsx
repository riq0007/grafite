import estilos from './Atalho.module.css';
import { formatarAtalho, type Plataforma, plataformaAtual } from './atalho.ts';

export interface PropsDaTeclaDeAtalho {
  /** Teclas em ordem, com "mod" para Ctrl ou ⌘, conforme a plataforma. */
  teclas: string[];
  plataforma?: Plataforma;
  className?: string;
}

/** Combinação de teclas; o leitor de tela ouve o nome de cada uma ("Command", não "⌘"). */
export function TeclaDeAtalho({
  teclas,
  plataforma = plataformaAtual(),
  className,
}: PropsDaTeclaDeAtalho) {
  return (
    <kbd className={[estilos.atalho, className].filter(Boolean).join(' ')}>
      {formatarAtalho(teclas, plataforma).map((tecla) => (
        <kbd key={tecla.nome} className={estilos.tecla}>
          {tecla.simbolo === tecla.nome ? (
            tecla.simbolo
          ) : (
            <>
              <span aria-hidden="true">{tecla.simbolo}</span>
              <span className={estilos.somenteLeitor}>{tecla.nome}</span>
            </>
          )}
        </kbd>
      ))}
    </kbd>
  );
}
