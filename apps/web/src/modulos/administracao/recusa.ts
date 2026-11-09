// A recusa de uma operação da Administração (spec modulo-administracao, retorno das operações): o
// motivo da API junto ao campo, quando ela aponta um, ou junto à ação.
import type { FalhaDoPedido } from '../../api/pedir.ts';

export interface RecusaDoFormulario<TCampo extends string = string> {
  erro: string;
  /** O motivo de cada campo que a API recusou. */
  campos?: Partial<Record<TCampo, string>>;
}

export function recusaDe<TCampo extends string>(falha: FalhaDoPedido): RecusaDoFormulario<TCampo> {
  const campos = falha.problema?.campos as Partial<Record<TCampo, string>> | undefined;
  return campos ? { erro: falha.erro, campos } : { erro: falha.erro };
}
