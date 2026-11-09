/** Copia o texto para a área de transferência; quem chama mostra se deu certo. */
export function copiarParaAreaDeTransferencia(texto: string): Promise<void> {
  return navigator.clipboard.writeText(texto);
}
