const KB = 1024;
const MB = KB * KB;

const emPtBr = (valor: number, casas: number) =>
  valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/**
 * O tamanho de um arquivo para quem lê, em pt-BR: os bytes, os KB inteiros e os MB com uma casa,
 * como "240 KB" e "1,2 MB". Perto de 1 MB, já em MB, para não mostrar "1.024 KB".
 */
export function formatarTamanho(bytes: number): string {
  if (bytes < KB) return bytes === 1 ? '1 byte' : `${emPtBr(bytes, 0)} bytes`;
  if (bytes < MB - KB / 2) return `${emPtBr(Math.round(bytes / KB), 0)} KB`;
  return `${emPtBr(bytes / MB, 1)} MB`;
}
