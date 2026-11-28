/**
 * A grade das opções do painel, linha a linha (a opção larga sozinha na primeira). As setas andam por
 * ela sem passar do fim, o Home e o End vão à primeira e à última, e o Tab dá a volta (m08).
 */
export type Grade = string[][];

export function proximaNaGrade(grade: Grade, atual: string, tecla: string): string | null {
  const plana = grade.flat();
  if (tecla === 'Home') return plana[0] ?? null;
  if (tecla === 'End') return plana.at(-1) ?? null;
  const linha = grade.findIndex((itens) => itens.includes(atual));
  if (linha < 0) return null;
  const itens = grade[linha] ?? [];
  const coluna = itens.indexOf(atual);
  const naLinha = (outra: number) => {
    const destino = grade[outra];
    return destino ? (destino[Math.min(coluna, destino.length - 1)] ?? null) : null;
  };
  switch (tecla) {
    case 'ArrowDown':
      return naLinha(linha + 1) ?? atual;
    case 'ArrowUp':
      return naLinha(linha - 1) ?? atual;
    case 'ArrowRight':
      return itens[coluna + 1] ?? atual;
    case 'ArrowLeft':
      return itens[coluna - 1] ?? atual;
    default:
      return null;
  }
}

export function seguinteNoTab(grade: Grade, atual: string, voltar: boolean): string | null {
  const plana = grade.flat();
  if (plana.length === 0) return null;
  const indice = plana.indexOf(atual);
  const passo = voltar ? -1 : 1;
  return plana[(indice + passo + plana.length) % plana.length] ?? null;
}
