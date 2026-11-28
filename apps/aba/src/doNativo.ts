import type { UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

/**
 * O que o lado nativo dá na leitura e avisa depois, sem reiniciar. O aviso que chega antes da
 * leitura é o mais novo, e fica; sem resposta do lado nativo, vale o de fábrica.
 */
export function useDoNativo<T>(
  ler: () => Promise<T>,
  ouvir: (aoMudar: (valor: T) => void) => Promise<UnlistenFn>,
  deFabrica: T,
): T | null {
  const [valor, setValor] = useState<T | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: lê e ouve uma vez, ao montar.
  useEffect(() => {
    let ativo = true;
    let deixarDeOuvir: (() => void) | undefined;
    ouvir((novo) => {
      if (ativo) setValor(novo);
    })
      .then((parar) => {
        if (ativo) deixarDeOuvir = parar;
        else parar();
      })
      .catch(() => undefined);
    ler()
      .then((lido) => {
        if (ativo) setValor((atual) => atual ?? lido);
      })
      .catch(() => {
        if (ativo) setValor((atual) => atual ?? deFabrica);
      });
    return () => {
      ativo = false;
      deixarDeOuvir?.();
    };
  }, []);
  return valor;
}

/** Ouve um aviso do lado nativo sem carga, como o atalho. */
export function useAvisoDoNativo(
  ouvir: (aoChegar: () => void) => Promise<UnlistenFn>,
  aoChegar: () => void,
) {
  useEffect(() => {
    let ativo = true;
    let deixarDeOuvir: (() => void) | undefined;
    ouvir(() => {
      if (ativo) aoChegar();
    })
      .then((parar) => {
        if (ativo) deixarDeOuvir = parar;
        else parar();
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
      deixarDeOuvir?.();
    };
  }, [ouvir, aoChegar]);
}
