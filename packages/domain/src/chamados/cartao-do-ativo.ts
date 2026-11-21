// O cartão do ativo no campo de escrever da TI (spec modulo-chamados, "Campo de escrever"; spec
// chamados, "Cartão do ativo na mensagem"; change chat-com-chamados, design, decisão 10): o "/ativo"
// numa linha, que a web lê para pedir o cartão.

/** O "/ativo" achado no texto: o patrimônio escrito e o texto sem a linha dele. */
export interface ComandoDoAtivo {
  /** O patrimônio escrito depois do "/ativo"; `null`, o "/ativo" sozinho, com o ativo ligado. */
  patrimonio: string | null;
  /** O texto sem a linha do comando, para quando o cartão entra no campo. */
  semOComando: string;
  /**
   * O comando está na última linha, onde ainda se escreve: o "/ativo" sozinho nela ainda pode ganhar
   * o patrimônio, e o campo o lê quando a linha acaba.
   */
  naUltimaLinha: boolean;
}

// A linha só com o comando: o "/ativo", em maiúsculas ou minúsculas, e o patrimônio, que vai até o
// fim da linha, sem os espaços das pontas.
const COMANDO = /^[ \t]*\/ativo(?:[ \t]+(\S(?:.*\S)?))?[ \t]*$/i;

/**
 * O primeiro "/ativo" no começo de uma linha, sozinho ou seguido do patrimônio, como
 * "/ativo PAT-00137". A linha com outro texto depois do patrimônio é o patrimônio inteiro, e o
 * "/ativo" no meio de uma linha não é comando. Sem o comando, `null`.
 */
export function comandoDoAtivo(texto: string): ComandoDoAtivo | null {
  const linhas = texto.split(/\r?\n/);
  const indice = linhas.findIndex((linha) => COMANDO.test(linha));
  if (indice === -1) return null;
  const patrimonio = COMANDO.exec(linhas[indice] ?? '')?.[1] ?? null;
  const semOComando = linhas.filter((_, outra) => outra !== indice).join('\n');
  return { patrimonio, semOComando, naUltimaLinha: indice === linhas.length - 1 };
}
