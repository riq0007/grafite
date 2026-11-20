// O "#" da caixa do chat (spec modulo-chat, "Caixa de escrever do chat"; spec chat, "Chamado citado
// numa mensagem"): o "#" separado das outras palavras abre a lista dos chamados de que a conta
// participa, que a busca depois dele estreita pelo começo do número ou pelo título, e o escolhido
// entra no texto como "#1045 ".

/** O "#" antes do cursor, no começo do texto ou depois de um espaço, com o que vem depois dele. */
const NO_CURSOR = /(?:^|\s)#([^\s#]*)$/u;

/** O "#" que se escreve antes do cursor: onde ele começa e o que vem depois dele, sem espaço. */
export function citacaoNoCursor(
  texto: string,
  cursor: number,
): { inicio: number; busca: string } | null {
  const antes = texto.slice(0, cursor);
  const achado = NO_CURSOR.exec(antes);
  if (!achado) return null;
  const busca = achado[1] ?? '';
  return { inicio: antes.length - busca.length - 1, busca };
}

/** O texto para comparar, sem os acentos e as maiúsculas. */
const semAcentos = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Os chamados que a busca acha, na ordem da lista, até o máximo: com números, pelo começo do número;
 * com letras, pelo título, sem diferenciar os acentos e as maiúsculas; sem busca, todos.
 */
export function chamadosParaCitar<T extends { numero: number; titulo: string }>(
  chamados: readonly T[],
  busca: string,
  maximo = 8,
): T[] {
  const termo = semAcentos(busca);
  const acha = /^\d+$/.test(termo)
    ? (chamado: T) => String(chamado.numero).startsWith(termo)
    : (chamado: T) => semAcentos(chamado.titulo).includes(termo);
  return chamados.filter(acha).slice(0, maximo);
}

/**
 * O texto com o chamado no lugar do "#" escrito, de `inicio` ao cursor, e o cursor depois dele. O
 * espaço depois do número só entra quando o texto não tem um ali.
 */
export function citarNoTexto(
  texto: string,
  inicio: number,
  cursor: number,
  numero: number,
): { texto: string; cursor: number } {
  const depois = texto.slice(cursor);
  const citado = `#${numero}`;
  const comEspaco = /^\s/u.test(depois) ? citado : `${citado} `;
  return {
    texto: `${texto.slice(0, inicio)}${comEspaco}${depois}`,
    cursor: inicio + citado.length + 1,
  };
}
