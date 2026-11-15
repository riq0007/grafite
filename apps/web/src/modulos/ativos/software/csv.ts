// O CSV do "Exportar" do software (change software-por-pacote): a distribuição e a matriz gravam no
// navegador o que mostram. O separador é o ";" e o arquivo começa pelo BOM, que o Excel em
// português abre com os acentos certos. A célula que começa como fórmula ganha o apóstrofo, para a
// planilha não a executar.

export type CelulaDoCsv = string | number | null;

const FORMULA = /^[=+\-@]/;
const PRECISA_DE_ASPAS = /[";\r\n]/;

function celula(valor: CelulaDoCsv): string {
  const texto = valor === null ? '' : String(valor);
  const seguro = typeof valor === 'string' && FORMULA.test(texto) ? `'${texto}` : texto;
  return PRECISA_DE_ASPAS.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro;
}

/** As linhas em CSV, com o BOM, o ";" e o CRLF. */
export function paraCsv(linhas: readonly (readonly CelulaDoCsv[])[]): string {
  return `﻿${linhas.map((linha) => `${linha.map(celula).join(';')}\r\n`).join('')}`;
}

/** Grava o CSV no navegador, com o nome dado. */
export function gravarCsv(nome: string, linhas: readonly (readonly CelulaDoCsv[])[]): void {
  const endereco = URL.createObjectURL(
    new Blob([paraCsv(linhas)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = endereco;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(endereco);
}
