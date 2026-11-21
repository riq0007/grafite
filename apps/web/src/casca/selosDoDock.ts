// Os selos do dock e da barra de abas (change chat-com-chamados, design, decisão 12), como o total
// do chat: a casca carrega as consultas dos selos do registro da conta pelo TanStack Query, como as
// dos menus dinâmicos, e os eventos dos módulos as relêem.
import type { ModuloDaCasca, SeloDoModulo } from '@grafite/ui';
import { hashKey, useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from '../api/useApi.tsx';
import type { ConsultaDoMenu, ModuloRegistrado } from '../modulos/tipos.ts';

/** Só os dados de cada consulta, na ordem delas; fora do componente, para não refazer a cada vez. */
const soOsDados = (resultados: readonly { data: unknown }[]) =>
  resultados.map((resultado) => resultado.data);

/** O selo de cada módulo do registro da conta que tem um agora, pelo id do módulo. */
export function useSelosDoDock(
  registro: readonly ModuloRegistrado[],
): ReadonlyMap<string, SeloDoModulo> {
  const api = useApi();
  const consultas = useMemo(
    () => registro.flatMap((modulo) => modulo.selo?.consultas(api) ?? []),
    [registro, api],
  );
  const dados = useQueries({ queries: consultas, combine: soOsDados });
  return useMemo(() => {
    const porChave = new Map(
      consultas.map((consulta, indice) => [hashKey(consulta.queryKey), dados[indice]]),
    );
    const ler = <TDado>(consulta: ConsultaDoMenu<TDado>) =>
      porChave.get(hashKey(consulta.queryKey)) as TDado | undefined;
    return new Map(
      registro.flatMap((modulo) => {
        const selo = modulo.selo?.montar({ ler, api });
        return selo ? [[modulo.id, selo] as const] : [];
      }),
    );
  }, [registro, consultas, dados, api]);
}

/** Os módulos da casca com o selo de cada um, quando há. */
export const comOsSelos = (
  modulos: readonly ModuloDaCasca[],
  selos: ReadonlyMap<string, SeloDoModulo>,
): ModuloDaCasca[] =>
  modulos.map((modulo) => {
    const selo = selos.get(modulo.id);
    return selo ? { ...modulo, selo } : modulo;
  });
