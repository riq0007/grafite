import createClient from 'openapi-fetch';
import type { components, paths } from './esquema.ts';

export type { components, paths } from './esquema.ts';

/** O corpo de toda resposta de erro da API (problem+json), com os dados extras do problema. */
export type Problema = components['schemas']['Problema'];

export interface OpcoesDoClienteDaApi {
  /** O fetch do navegador; os testes passam um simulado. */
  fetch?: (pedido: Request) => Promise<Response>;
}

/** Cliente tipado da API, gerado do contrato OpenAPI (pnpm contrato:gerar). */
export function criarClienteDaApi(baseUrl: string, { fetch }: OpcoesDoClienteDaApi = {}) {
  return createClient<paths>({ baseUrl, ...(fetch ? { fetch } : {}) });
}
