// A busca por palavras nas listas: cada palavra, já normalizada, casa em qualquer posição do texto
// de busca, com o `%`, o `_` e a barra escapados para o LIKE.

/** O padrão do LIKE que acha a palavra em qualquer posição. */
export const contendo = (palavra: string) => `%${palavra.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
