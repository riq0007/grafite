// Os itens de menu que vêm dos dados (change visoes-no-dock, design, decisão 2): a casca carrega as
// consultas dos menus dinâmicos do registro da conta e monta de novo o menu de cada módulo a cada
// vez que os dados ou as preferências mudam. Só o dock usa: a busca continua com os menus fixos.
import type { PreferenciasDaInterface } from '@grafite/domain';
import { hashKey, useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ClienteDaApi } from '../api/cliente.ts';
import { useApi } from '../api/useApi.tsx';
import { itensPermitidos, type Pode } from '../modulos/registroDaConta.ts';
import type { ConsultaDoMenu, ModuloRegistrado } from '../modulos/tipos.ts';
import { usePreferencias } from '../preferencias/usePreferencias.tsx';

/** Só os dados de cada consulta, na ordem delas; fora do componente, para não refazer a cada vez. */
const soOsDados = (resultados: readonly { data: unknown }[]) =>
  resultados.map((resultado) => resultado.data);

export interface DadosDosMenus {
  /** O dado de uma consulta: nenhum enquanto ela carrega ou se ela falhou. */
  ler: <TDado>(consulta: ConsultaDoMenu<TDado>) => TDado | undefined;
  api: ClienteDaApi;
  preferencias: PreferenciasDaInterface;
  pode: Pode;
}

/**
 * O registro com o menu de cada módulo montado com os dados: o módulo põe os itens dos dados entre
 * os fixos, e os que a conta não pode usar somem, como os fixos.
 */
export function comOsMenusDinamicos(
  registro: readonly ModuloRegistrado[],
  { ler, api, preferencias, pode }: DadosDosMenus,
): ModuloRegistrado[] {
  return registro.map((modulo) => {
    const { menuDinamico } = modulo;
    if (!menuDinamico) return modulo;
    const menu = menuDinamico.montar({ menu: modulo.menu ?? [], ler, api, preferencias });
    return { ...modulo, menu: itensPermitidos(menu, pode) };
  });
}

/**
 * O registro da conta com os menus dinâmicos, para o dock. As consultas são as do TanStack Query, e
 * os eventos dos módulos as relêem, como nas telas.
 */
export function useMenusDinamicos(
  registro: readonly ModuloRegistrado[],
  pode: Pode,
): readonly ModuloRegistrado[] {
  const api = useApi();
  const { preferencias } = usePreferencias();
  const consultas = useMemo(
    () => registro.flatMap((modulo) => modulo.menuDinamico?.consultas(api) ?? []),
    [registro, api],
  );
  const dados = useQueries({
    queries: consultas,
    combine: soOsDados,
  });
  return useMemo(() => {
    const porChave = new Map(
      consultas.map((consulta, indice) => [hashKey(consulta.queryKey), dados[indice]]),
    );
    const ler = <TDado>(consulta: ConsultaDoMenu<TDado>) =>
      porChave.get(hashKey(consulta.queryKey)) as TDado | undefined;
    return comOsMenusDinamicos(registro, { ler, api, preferencias, pode });
  }, [registro, consultas, dados, api, preferencias, pode]);
}
