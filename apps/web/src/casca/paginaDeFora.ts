// A página de fora da casca, como a do app do chat (change chat-com-chamados, design, decisão 12):
// a troca pela outra página do build, que a casca não carrega pelo roteador.

/** Troca a página pela de fora da casca, sem deixar a de agora no histórico. */
export function trocarPelaPaginaDeFora(endereco: string): void {
  window.location.replace(endereco);
}
