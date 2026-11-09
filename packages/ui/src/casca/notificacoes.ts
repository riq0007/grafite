// Regras de apresentação das notificações (spec notificacoes): o número do sino e os grupos da
// central por dia, em pt-BR.

/** O sino mostra até 99; acima disso, "99+". O nome acessível diz sempre o número exato. */
export const MAXIMO_NO_SINO = 99;

export function textoDoSino(
  naoLidas: number,
  foco = false,
): { numero: string | null; nomeAcessivel: string } {
  const doFoco = foco ? ', Foco ligado' : '';
  if (naoLidas <= 0) {
    return { numero: null, nomeAcessivel: `Notificações, nenhuma não lida${doFoco}` };
  }
  return {
    numero: naoLidas > MAXIMO_NO_SINO ? `${MAXIMO_NO_SINO}+` : String(naoLidas),
    nomeAcessivel: `Notificações, ${naoLidas} ${naoLidas === 1 ? 'não lida' : 'não lidas'}${doFoco}`,
  };
}

/**
 * As notificações da mais recente para a mais antiga, em grupos: "Hoje", "Ontem" e a data. O rótulo
 * do dia vem do fuso em vigor (useDataHora).
 */
export function agruparPorDia<T extends { momento: Date }>(
  itens: readonly T[],
  agora: Date,
  grupoDoDia: (data: Date, agora: Date) => string,
): Array<{ rotulo: string; itens: T[] }> {
  const grupos: Array<{ rotulo: string; itens: T[] }> = [];
  const recentes = [...itens].sort((a, b) => b.momento.getTime() - a.momento.getTime());
  for (const item of recentes) {
    const rotulo = grupoDoDia(item.momento, agora);
    const ultimo = grupos.at(-1);
    if (ultimo?.rotulo === rotulo) ultimo.itens.push(item);
    else grupos.push({ rotulo, itens: [item] });
  }
  return grupos;
}
