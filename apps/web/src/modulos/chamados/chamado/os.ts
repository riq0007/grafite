// O "Virar OS" com os campos da OS (change chamados-da-ti, design, "O Virar OS com os campos da OS
// (tarefa 5.31)"): o problema que a gaveta traz, para quem abre corrigir antes.
import { LIMITES_DA_ORDEM } from '@grafite/domain';

/**
 * O problema da OS: o título do chamado e, embaixo, uma linha por resposta do formulário, como no
 * resumo da abertura ("Cor do toner: Preto"). A resposta que não cabe no limite do problema fica de
 * fora, inteira, e as seguintes ainda entram, se couberem.
 */
export function problemaDaOs(
  titulo: string,
  respostas: readonly { nome: string; resposta: string }[],
  limite: number = LIMITES_DA_ORDEM.problema,
): string {
  let problema = titulo;
  for (const { nome, resposta } of respostas) {
    const linha = `\n${nome}: ${resposta}`;
    if (problema.length + linha.length <= limite) problema += linha;
  }
  return problema;
}
