// O canal dos eventos na web (design do F2c, decisão 12): a conexão de eventos publica cada evento
// recebido, e quem depende deles (as preferências, a casca e os módulos) ouve os tipos que lhe
// interessam. O evento traz só o tipo, o momento e o alvo, como a API o manda.
import type { TipoDeEvento } from '@grafite/domain';

export interface EventoRecebido {
  id: string;
  tipo: TipoDeEvento;
  momento: string;
  alvo: { tipo: string; id: string | null } | null;
}

export type OuvinteDeEventos = (evento: EventoRecebido) => void;

export interface CanalDeEventos {
  publicar(evento: EventoRecebido): void;
  /** Ouve um tipo de evento; devolve o que para de ouvir. */
  ouvir(tipo: TipoDeEvento, ouvinte: OuvinteDeEventos): () => void;
}

export function criarCanalDeEventos(): CanalDeEventos {
  const ouvintes = new Map<TipoDeEvento, Set<OuvinteDeEventos>>();
  return {
    publicar(evento) {
      for (const ouvinte of [...(ouvintes.get(evento.tipo) ?? [])]) {
        // Um ouvinte que falha não tira o evento dos outros.
        try {
          ouvinte(evento);
        } catch (erro) {
          console.error(erro);
        }
      }
    },
    ouvir(tipo, ouvinte) {
      const doTipo = ouvintes.get(tipo) ?? new Set();
      ouvintes.set(tipo, doTipo);
      doTipo.add(ouvinte);
      return () => {
        doTipo.delete(ouvinte);
      };
    },
  };
}
