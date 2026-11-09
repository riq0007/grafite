// As ocorrências abertas dos módulos, para "O que resolver agora" (design do F1c, decisão 5): cada
// fonte do registro é buscada ao abrir a tela, com o seu estado, e buscada de novo quando avisa
// que mudou ou quando o usuário tenta de novo. Sair da tela cancela tudo.
import type {
  EstadoDaFonteDeOcorrencias as EstadoDaFonte,
  FonteDeOcorrenciasNaTela,
} from '@grafite/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContextoDaFonte, FonteDeOcorrencias, ModuloRegistrado } from '../tipos.ts';

/** Do módulo, só o que a tela inicial usa. */
export type ModuloComOcorrencias = Pick<ModuloRegistrado, 'id' | 'nome' | 'ocorrencias'>;

const CARREGANDO: EstadoDaFonte = { tipo: 'carregando' };

export function useOcorrencias(
  registro: readonly ModuloComOcorrencias[],
  contexto: ContextoDaFonte,
): {
  fontes: FonteDeOcorrenciasNaTela[];
  /** Busca de novo a fonte que falhou. */
  tentarDeNovo: (idDaFonte: string) => void;
} {
  const fontes = useMemo(
    () =>
      registro.flatMap((modulo) =>
        modulo.ocorrencias
          ? [{ id: modulo.id, modulo: modulo.nome, fonte: modulo.ocorrencias }]
          : [],
      ),
    [registro],
  );
  const [estados, definirEstados] = useState<Record<string, EstadoDaFonte>>({});
  /** A busca em curso de cada fonte; a resposta de uma busca cancelada não muda nada. */
  const emCurso = useRef(new Map<string, AbortController>());

  const buscar = useCallback(
    (id: string, fonte: FonteDeOcorrencias, { recomecar }: { recomecar: boolean }) => {
      emCurso.current.get(id)?.abort();
      const controle = new AbortController();
      emCurso.current.set(id, controle);
      const definir = (estado: EstadoDaFonte) =>
        definirEstados((atuais) => ({ ...atuais, [id]: estado }));
      // Um aviso de mudança mantém a lista à vista até a nova chegar; tentar de novo recomeça.
      if (recomecar) definir(CARREGANDO);
      const terminar = (estado: EstadoDaFonte) => {
        if (controle.signal.aborted) return;
        emCurso.current.delete(id);
        definir(estado);
      };
      fonte.buscar(controle.signal, contexto).then(
        (ocorrencias) => terminar({ tipo: 'pronta', ocorrencias }),
        () => terminar({ tipo: 'erro' }),
      );
    },
    [contexto],
  );

  useEffect(() => {
    for (const { id, fonte } of fontes) buscar(id, fonte, { recomecar: true });
    const pararDeOuvir = fontes.flatMap(({ id, fonte }) =>
      fonte.assinar ? [fonte.assinar(() => buscar(id, fonte, { recomecar: false }), contexto)] : [],
    );
    const buscas = emCurso.current;
    return () => {
      for (const parar of pararDeOuvir) parar();
      for (const controle of buscas.values()) controle.abort();
      buscas.clear();
    };
  }, [fontes, buscar, contexto]);

  const tentarDeNovo = useCallback(
    (idDaFonte: string) => {
      const encontrada = fontes.find((candidata) => candidata.id === idDaFonte);
      if (encontrada) buscar(encontrada.id, encontrada.fonte, { recomecar: true });
    },
    [fontes, buscar],
  );

  return {
    fontes: fontes.map(({ id, modulo }) => ({ id, modulo, estado: estados[id] ?? CARREGANDO })),
    tentarDeNovo,
  };
}
