// O resumo da linha (spec tabelas-configuraveis): o relógio que espera o mouse parar 1,5 s sobre
// uma linha e as colunas que estão fora da área visível. O relógio se testa com o tempo falso; as
// colunas se medem pelo cabeçalho.

/** Quanto o mouse fica parado sobre a linha para o resumo aparecer, em ms (Apêndice B). */
export const ESPERA_DO_RESUMO = 1500;

export interface RelogioDoResumo {
  /** O mouse se moveu sobre a linha dada, ou fora de qualquer linha (`null`). */
  mover: (chave: string | null) => void;
  /** A saída da tabela, a rolagem ou uma tecla: cancela a espera e fecha o resumo. */
  cancelar: () => void;
}

/**
 * A contagem recomeça a cada movimento; com o resumo à vista, o movimento na mesma linha o mantém,
 * e o movimento para outra linha o fecha e recomeça a contagem nela.
 */
export function relogioDoResumo({
  espera = ESPERA_DO_RESUMO,
  aoMostrar,
  aoEsconder,
}: {
  espera?: number;
  aoMostrar: (chave: string) => void;
  aoEsconder: () => void;
}): RelogioDoResumo {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let aVista: string | null = null;
  const esconder = () => {
    if (aVista === null) return;
    aVista = null;
    aoEsconder();
  };
  return {
    mover(chave) {
      clearTimeout(temporizador);
      if (aVista !== null && chave === aVista) return;
      esconder();
      if (chave === null) return;
      temporizador = setTimeout(() => {
        aVista = chave;
        aoMostrar(chave);
      }, espera);
    },
    cancelar() {
      clearTimeout(temporizador);
      esconder();
    },
  };
}

const RECORTA = new Set(['auto', 'scroll', 'hidden', 'clip']);

/** A faixa horizontal do conteúdo de um elemento, sem a borda e a barra de rolagem. */
function faixaDe(elemento: HTMLElement) {
  const esquerda = elemento.getBoundingClientRect().left + elemento.clientLeft;
  return { esquerda, direita: esquerda + elemento.clientWidth };
}

/**
 * As colunas dadas que estão fora da área visível da rolagem, cortadas ou além dela, na ordem dada.
 * A área é a da rolagem, recortada pela grade quando é ela que rola (a tabela virtualizada) e pela
 * janela. A coluna sem cabeçalho desenhado conta como fora: a tabela virtualizada só desenha as
 * colunas perto da área visível.
 */
export function colunasForaDaArea(rolagem: HTMLElement, chaves: readonly string[]): string[] {
  const grade = rolagem.querySelector<HTMLElement>('[role="grid"], [role="treegrid"]');
  const recortes = [rolagem];
  if (grade && RECORTA.has(getComputedStyle(grade).overflowX)) recortes.push(grade);
  const faixas = recortes.map(faixaDe);
  const esquerda = Math.max(0, ...faixas.map((faixa) => faixa.esquerda));
  const direita = Math.min(window.innerWidth, ...faixas.map((faixa) => faixa.direita));
  const cabecalhos = new Map(
    [...rolagem.querySelectorAll<HTMLElement>('[role="columnheader"][data-key]')].map(
      (cabecalho) => [cabecalho.dataset.key, cabecalho],
    ),
  );
  return chaves.filter((chave) => {
    const cabecalho = cabecalhos.get(chave);
    if (!cabecalho) return true;
    const caixa = cabecalho.getBoundingClientRect();
    return caixa.left < esquerda - 1 || caixa.right > direita + 1;
  });
}
