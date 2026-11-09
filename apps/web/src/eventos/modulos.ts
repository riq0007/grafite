// Os eventos nos módulos (design do F2c, decisão 12): cada módulo declara, no registro, as consultas
// que cada tipo de evento atualiza. Quando o evento chega pelo canal, as chaves declaradas são
// invalidadas: as consultas ativas são relidas na hora, e as outras quando uma tela as usar de novo.
// Numa rajada de eventos, como a de uma importação (design do P1e, decisão 10), cada chave é relida
// uma vez por vez: o evento que chega durante a releitura marca a chave, e a próxima releitura começa
// quando a em andamento termina. Sem isso, cada evento cortaria a releitura anterior, e a lista aberta
// ficaria relendo sem nunca terminar.
import { TIPOS_DE_EVENTO } from '@grafite/domain';
import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { ModuloRegistrado } from '../modulos/tipos.ts';
import type { CanalDeEventos } from './canal.ts';

export interface OpcoesDosEventosDosModulos {
  registro: readonly Pick<ModuloRegistrado, 'id' | 'eventos'>[];
  canal: CanalDeEventos;
  consultas: QueryClient;
}

/** Passa a invalidar as consultas que os módulos declaram; devolve o que para. */
export function ligarEventosDosModulos({
  registro,
  canal,
  consultas,
}: OpcoesDosEventosDosModulos): () => void {
  /** As chaves sendo relidas. */
  const relendo = new Set<string>();
  /** As chaves que um evento marcou durante a releitura delas, para reler de novo depois. */
  const deNovo = new Map<string, QueryKey>();
  let parado = false;

  function reler(queryKey: QueryKey) {
    const chave = hashKey(queryKey);
    if (relendo.has(chave)) {
      deNovo.set(chave, queryKey);
      return;
    }
    relendo.add(chave);
    void consultas
      .invalidateQueries({ queryKey })
      .catch(() => {})
      .finally(() => {
        relendo.delete(chave);
        const marcada = deNovo.get(chave);
        deNovo.delete(chave);
        if (marcada && !parado) reler(marcada);
      });
  }

  const paradas = TIPOS_DE_EVENTO.map((tipo) =>
    canal.ouvir(tipo, (evento) => {
      for (const modulo of registro) {
        for (const queryKey of modulo.eventos?.[tipo]?.(evento) ?? []) reler(queryKey);
      }
    }),
  );
  return () => {
    parado = true;
    deNovo.clear();
    for (const parar of paradas) parar();
  };
}
