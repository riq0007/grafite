// Executor de um provedor de busca de módulo (design do F1b, decisão 3). Espera uma pausa na
// digitação, cancela a chamada anterior, desiste depois do limite e descarta a resposta de um
// texto que já mudou. Os tempos vêm de tempos.ts.
import { tempos } from '@grafite/ui';

export type EstadoDoProvedor<T> =
  | { tipo: 'ocioso' }
  | { tipo: 'buscando'; termo: string }
  | { tipo: 'pronto'; termo: string; resultados: T }
  | { tipo: 'erro'; termo: string; motivo: 'falha' | 'tempo' };

/** Com menos caracteres que isso, o provedor não é chamado. */
export const MINIMO_DE_CARACTERES = 2;

export interface ExecutorDoProvedor {
  /** Pede a busca de um texto; o anterior, esperando ou em curso, é cancelado. */
  pedir: (texto: string) => void;
  /** A busca fechou: cancela tudo, e nenhuma resposta que chegue depois muda o estado. */
  parar: () => void;
}

export function criarExecutor<T>(
  buscar: (termo: string, sinal: AbortSignal) => Promise<T>,
  { aoMudar }: { aoMudar: (estado: EstadoDoProvedor<T>) => void },
): ExecutorDoProvedor {
  let espera: ReturnType<typeof setTimeout> | undefined;
  let limite: ReturnType<typeof setTimeout> | undefined;
  /** A chamada em curso; uma resposta que não é dela chega tarde e não muda nada. */
  let emCurso: AbortController | undefined;

  const cancelar = () => {
    clearTimeout(espera);
    clearTimeout(limite);
    espera = undefined;
    limite = undefined;
    emCurso?.abort();
    emCurso = undefined;
  };

  const terminar = (controle: AbortController, estado: EstadoDoProvedor<T>) => {
    if (emCurso !== controle) return;
    clearTimeout(limite);
    limite = undefined;
    emCurso = undefined;
    aoMudar(estado);
  };

  function chamar(termo: string) {
    const controle = new AbortController();
    emCurso = controle;
    limite = setTimeout(() => {
      if (emCurso !== controle) return;
      cancelar();
      aoMudar({ tipo: 'erro', termo, motivo: 'tempo' });
    }, tempos.busca.limiteDoProvedor);
    buscar(termo, controle.signal).then(
      (resultados) => terminar(controle, { tipo: 'pronto', termo, resultados }),
      () => terminar(controle, { tipo: 'erro', termo, motivo: 'falha' }),
    );
  }

  return {
    pedir(texto) {
      cancelar();
      const termo = texto.trim();
      if (termo.length < MINIMO_DE_CARACTERES) {
        aoMudar({ tipo: 'ocioso' });
        return;
      }
      aoMudar({ tipo: 'buscando', termo });
      espera = setTimeout(() => {
        espera = undefined;
        chamar(termo);
      }, tempos.busca.pausaDoProvedor);
    },
    parar: cancelar,
  };
}
