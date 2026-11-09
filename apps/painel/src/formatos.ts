// Como a página escreve as datas, os tamanhos e os ambientes, em pt-BR, no fuso do navegador.
const MOMENTO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const GIGABYTES = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Um momento, como 28/10/2026, 05:00. */
export const formatarMomento = (iso: string) => MOMENTO.format(new Date(iso));

/** Os bytes em gigabytes, como 1.000 GB. */
export const formatarGigabytes = (bytes: number) => `${GIGABYTES.format(bytes / 1e9)} GB`;

/** O ambiente com o artigo, como os botões o dizem: "Ligar a produção". */
export const AMBIENTE_COM_ARTIGO = { producao: 'a produção', teste: 'o teste' } as const;
