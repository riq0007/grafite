// O prazo do servidor na chegada (spec chegada, "Carregamento com etapas reais"; change
// p3b-notificacoes-no-servidor, design, decisão 11): as etapas que dependem do servidor, somadas,
// não esperam mais de 5 s. A primeira a esperar marca o começo, e cada espera termina, no máximo,
// 5 s depois dessa marca; sem resposta nesse prazo, a casca abre, e o que faltou chega depois.

export const PRAZO_DO_SERVIDOR = 5000;

export interface PrazoDoServidor {
  /** Marca o começo da espera pelo servidor, se ele ainda não foi marcado. */
  comecar(): void;
  /** Espera a resposta até o fim do prazo, contado do começo. Não falha. */
  esperar(resposta: Promise<unknown>): Promise<void>;
}

export function criarPrazoDoServidor({
  agora = () => performance.now(),
  limite = PRAZO_DO_SERVIDOR,
}: {
  /** O relógio do prazo; os testes passam o deles. */
  agora?: () => number;
  limite?: number;
} = {}): PrazoDoServidor {
  let comeco: number | null = null;
  const comecar = () => {
    comeco ??= agora();
  };
  return {
    comecar,
    async esperar(resposta) {
      comecar();
      const falta = Math.max(0, (comeco as number) + limite - agora());
      let fim: ReturnType<typeof setTimeout> | undefined;
      const esgotou = new Promise<void>((resolver) => {
        fim = setTimeout(resolver, falta);
      });
      try {
        await Promise.race([resposta.then(nada, nada), esgotou]);
      } finally {
        clearTimeout(fim);
      }
    },
  };
}

const nada = () => {};
