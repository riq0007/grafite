// As máquinas no assistente da distribuição (spec distribuicao-de-software, "Assistente da
// distribuição"; spec inventario-pelo-agente, "Agente sem contato"; change software-por-pacote,
// design, decisões 9 e 10): o sem contato pelo prazo da organização, a classe de cada máquina, na
// ordem pulada, na fila e vai instalar, a conta do "Conferir" e o "Para quem".
import { compararVersoes, type SituacaoFrenteAoPacote, versaoCortada } from './versoes.ts';

const DIA = 86_400_000;

/**
 * O agente sem contato: o último contato passou do prazo da organização, em dias. Os dias contam
 * inteiros ("há 3 dias").
 */
export function semContato(
  ultimoContato: Date,
  momento: Date,
  prazoEmDias: number,
): { semContato: boolean; dias: number } {
  const passou = momento.getTime() - ultimoContato.getTime();
  return { semContato: passou > prazoEmDias * DIA, dias: Math.max(0, Math.floor(passou / DIA)) };
}

/** "Sem contato · há 3 dias". */
export function textoDoSemContato(dias: number): string {
  return `Sem contato · há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

export type ClasseNoAssistente = 'pulada' | 'na-fila' | 'vai-instalar';

/**
 * A classe da máquina no assistente, nesta precedência: pulada, já na versão-alvo, mesmo sem
 * contato; na fila, sem contato; e vai instalar. O pacote sem versão-alvo não pula ninguém.
 */
export function classeNoAssistente(maquina: {
  situacao: SituacaoFrenteAoPacote;
  semContato: boolean;
}): ClasseNoAssistente {
  if (maquina.situacao === 'na-versao') return 'pulada';
  return maquina.semContato ? 'na-fila' : 'vai-instalar';
}

export interface ContaDoAssistente {
  /** A classe de cada máquina, na ordem em que vieram. */
  classes: ClasseNoAssistente[];
  vaoInstalar: number;
  puladas: number;
  naFila: number;
  /** As que vão instalar sem ter o programa. */
  primeiraVez: number;
  /** As que vão instalar com o programa, pela versão de hoje cortada no tamanho da versão-alvo, da
   * mais nova para a mais velha; a sem versão no inventário vai no fim. */
  porVersao: { versao: string | null; quantas: number }[];
}

/** A conta do "Até agora" e do "Conferir" ("Atualizam da 7.2 · 5", "Instalam pela primeira vez"). */
export function contaDoAssistente(
  maquinas: readonly {
    situacao: SituacaoFrenteAoPacote;
    versao: string | null;
    semContato: boolean;
  }[],
  versaoAlvo: string | null,
): ContaDoAssistente {
  const classes = maquinas.map(classeNoAssistente);
  const grupos = new Map<string | null, number>();
  let primeiraVez = 0;
  maquinas.forEach((maquina, posicao) => {
    if (classes[posicao] !== 'vai-instalar') return;
    if (maquina.situacao === 'sem-o-programa') {
      primeiraVez++;
      return;
    }
    const versao = versaoCortada(maquina.versao, versaoAlvo);
    grupos.set(versao, (grupos.get(versao) ?? 0) + 1);
  });
  const porVersao = [...grupos].map(([versao, quantas]) => ({ versao, quantas }));
  porVersao.sort((a, b) => {
    if (a.versao === null) return 1;
    if (b.versao === null) return -1;
    return compararVersoes(b.versao, a.versao);
  });
  const contar = (classe: ClasseNoAssistente) => classes.filter((de) => de === classe).length;
  return {
    classes,
    vaoInstalar: contar('vai-instalar'),
    puladas: contar('pulada'),
    naFila: contar('na-fila'),
    primeiraVez,
    porVersao,
  };
}

/**
 * O "Para quem" da distribuição: o nome da máquina, quando é uma só; o local mais fundo que contém
 * todas, pelo caminho de cada uma desde a raiz; "N locais", quando não há esse local; e "N máquinas",
 * quando elas não têm local.
 */
export function paraQuem(
  maquinas: readonly { nome: string; locais: readonly { id: string; nome: string }[] }[],
): string {
  const [primeira, ...outras] = maquinas;
  if (!primeira) return '0 máquinas';
  if (outras.length === 0) return primeira.nome;
  let comum = primeira.locais.length;
  for (const maquina of outras) {
    let posicao = 0;
    while (posicao < comum && maquina.locais[posicao]?.id === primeira.locais[posicao]?.id)
      posicao++;
    comum = posicao;
  }
  const local = primeira.locais[comum - 1];
  if (local) return local.nome;
  const distintos = new Set(maquinas.flatMap(({ locais }) => locais.at(-1)?.id ?? []));
  return distintos.size > 1 ? `${distintos.size} locais` : `${maquinas.length} máquinas`;
}
