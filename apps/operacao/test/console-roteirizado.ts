// Um console com as respostas que a pessoa daria, em ordem, para os testes do comando de operação.
// Anota as perguntas e o que foi escrito; uma pergunta sem resposta falha o teste.
import type { Console } from '../src/windows/console.ts';

export function consoleRoteirizado(...respostas: string[]) {
  const perguntas: string[] = [];
  const escritos: string[] = [];
  const proxima = (pergunta: string) => {
    perguntas.push(pergunta);
    const resposta = respostas.shift();
    if (resposta === undefined) throw new Error(`O roteiro não tem resposta para: ${pergunta}`);
    return resposta;
  };
  const console: Console = {
    async perguntar(pergunta, padrao) {
      const resposta = proxima(pergunta).trim();
      return resposta === '' && padrao !== undefined ? padrao : resposta;
    },
    async perguntarSegredo(pergunta) {
      return proxima(pergunta);
    },
    async confirmarDigitado(pedido, esperado) {
      if (proxima(pedido) !== esperado) {
        throw new Error(`O texto digitado não confere com ${esperado}. Nada foi feito.`);
      }
    },
    escrever(texto) {
      escritos.push(texto);
    },
  };
  return { console, perguntas, escritos, sobra: () => respostas.length };
}
