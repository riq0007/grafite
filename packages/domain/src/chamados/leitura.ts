// A leitura dos documentos dos chamados que chegam da tela: o formulário do tipo e as respostas.
// O que a tela não monta sai pela exceção `ForaDoFormato`, que vira a recusa geral do formulário.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O objeto do documento, sem a lista; o resto é `null`. */
export const objeto = (valor: unknown): Record<string, unknown> | null =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;

/** O documento que a tela não monta: o id, o tipo ou a resposta fora do que ela produz. */
export class ForaDoFormato extends Error {}

export const fora = (): never => {
  throw new ForaDoFormato();
};
