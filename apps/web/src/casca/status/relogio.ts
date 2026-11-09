// Relógio da barra (design do F1a, decisão 10): atualizado na virada do minuto. O formato
// ("qui 24 set 14:32") vem do useDataHora(), no fuso escolhido.

const UM_MINUTO = 60_000;

/**
 * Avisa a cada virada do minuto. Cada aviso agenda o seguinte pela hora do sistema, então um aviso
 * atrasado (o computador dormiu, a aba ficou em segundo plano) não desalinha os próximos.
 * Devolve a função que para os avisos.
 */
export function vigiarOMinuto(aoVirar: () => void): () => void {
  let proximo: ReturnType<typeof setTimeout>;
  const agendar = () => {
    proximo = setTimeout(
      () => {
        aoVirar();
        agendar();
      },
      UM_MINUTO - (Date.now() % UM_MINUTO),
    );
  };
  agendar();
  return () => clearTimeout(proximo);
}
