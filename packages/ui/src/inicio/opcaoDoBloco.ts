// A forma de uma opção de bloco do Início (spec tela-inicial, "Opções dos blocos"; change
// opcoes-dos-blocos-do-inicio, design, decisão 1). O módulo a declara no registro, o Início guarda
// a escolha da conta e entrega ao bloco o valor que vale, e a gaveta "Opções…" desenha um controle
// por forma.

/**
 * Uma opção que um bloco do Início declara. A chave vai gravada nas preferências: letras
 * minúsculas, números e hífen, até 30.
 */
export type OpcaoDoBloco =
  | {
      chave: string;
      rotulo: string;
      /** Um ou mais valores de uma lista fixa. */
      forma: 'escolhas';
      opcoes: readonly { id: string; rotulo: string }[];
      padrao: readonly string[];
      /** Quantos ficam escolhidos, pelo menos; sem ele, nenhum. */
      minimo?: number;
    }
  | {
      chave: string;
      rotulo: string;
      /** Um número inteiro, do mínimo ao máximo. */
      forma: 'numero';
      minimo: number;
      maximo: number;
      padrao: number;
      /** De quanto em quanto o controle anda; sem ele, de 1 em 1. */
      passo?: number;
      unidade?: string;
    }
  | {
      chave: string;
      rotulo: string;
      /** Locais da árvore da organização, com os de dentro; nenhum quer dizer todos. */
      forma: 'locais';
    };

/** O valor de uma opção: as escolhas e os locais numa lista, ou o número. */
export type ValorDaOpcaoDoBloco = readonly string[] | number;

/** O valor que vale de cada opção de um bloco, pela chave. */
export type ValoresDasOpcoesDoBloco = Readonly<Record<string, ValorDaOpcaoDoBloco>>;
