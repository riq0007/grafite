// A ficha da pessoa nas consultas: o tipo, como a API a devolve, e a chave dela, que as abas
// atualizam depois de cada operação.
import type { components } from '@grafite/api-client';

export type Ficha = components['schemas']['FichaDaPessoa'];

/** A chave da ficha da pessoa nas consultas. */
export const chaveDaFicha = (id: string) => ['pessoa', id] as const;
