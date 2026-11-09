// O console do comando (design do F2d, decisão 4): as perguntas da instalação e a confirmação
// digitada antes do que não tem volta, como atualizar ou restaurar a produção. No roteiro automático
// do CI, a confirmação vem por `--confirmar`, conferida como se tivesse sido digitada. Uma senha é
// digitada sem aparecer na tela.
import { createInterface } from 'node:readline/promises';

export interface Console {
  /** A resposta, ou o padrão quando a pessoa só tecla Enter. */
  perguntar(pergunta: string, padrao?: string): Promise<string>;
  /** A resposta digitada sem aparecer na tela, como uma senha. */
  perguntarSegredo(pergunta: string): Promise<string>;
  /** Passa só com o texto exato; senão, recusa sem fazer nada. */
  confirmarDigitado(pedido: string, esperado: string): Promise<void>;
  escrever(texto: string): void;
}

const CTRL_C = '\x03';
const APAGAR = ['\x7f', '\b'];

/** O texto digitado com as teclas de apagar aplicadas, sem os outros caracteres de controle. */
function aplicarEdicao(digitado: string): string {
  let texto = '';
  for (const caractere of digitado) {
    if (caractere === CTRL_C) throw new Error('Cancelado.');
    if (APAGAR.includes(caractere)) texto = [...texto].slice(0, -1).join('');
    else if (caractere >= ' ') texto += caractere;
  }
  return texto;
}

export function consoleDoTerminal({
  entrada = process.stdin,
  saida = process.stdout,
  confirmar,
}: {
  entrada?: NodeJS.ReadableStream;
  saida?: NodeJS.WritableStream;
  /** O valor de `--confirmar`, no lugar do que seria digitado. */
  confirmar?: string;
} = {}): Console {
  const linhas = createInterface({ input: entrada, terminal: false })[Symbol.asyncIterator]();
  const lerLinha = async () => {
    const { value, done } = await linhas.next();
    return done ? '' : String(value);
  };
  const escrever = (texto: string) => {
    saida.write(texto);
  };
  return {
    async perguntar(pergunta, padrao) {
      escrever(padrao === undefined ? `${pergunta}: ` : `${pergunta} [${padrao}]: `);
      const resposta = (await lerLinha()).trim();
      return resposta === '' && padrao !== undefined ? padrao : resposta;
    },

    async perguntarSegredo(pergunta) {
      escrever(`${pergunta}: `);
      // No terminal, o modo bruto tira o eco do que é digitado; o Ctrl+C encerra como sempre.
      const terminal = entrada as NodeJS.ReadStream;
      const bruto = terminal.isTTY === true && typeof terminal.setRawMode === 'function';
      const aoDigitar = (parte: Buffer | string) => {
        if (!String(parte).includes(CTRL_C)) return;
        terminal.setRawMode(false);
        escrever('\n');
        process.exit(130);
      };
      if (bruto) {
        terminal.setRawMode(true);
        terminal.on('data', aoDigitar);
      }
      try {
        return aplicarEdicao(await lerLinha()).trim();
      } finally {
        if (bruto) {
          terminal.off('data', aoDigitar);
          terminal.setRawMode(false);
          escrever('\n');
        }
      }
    },

    async confirmarDigitado(pedido, esperado) {
      let digitado = confirmar;
      if (digitado === undefined) {
        escrever(`${pedido} (${esperado}): `);
        digitado = (await lerLinha()).trim();
      }
      if (digitado !== esperado) {
        throw new Error(`O texto digitado não confere com ${esperado}. Nada foi feito.`);
      }
    },

    escrever: (texto) => escrever(`${texto}\n`),
  };
}
