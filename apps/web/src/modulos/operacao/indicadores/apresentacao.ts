// Os textos das listas dos indicadores da operação (spec indicadores-da-operacao, "Tempo de
// resolução das OS", "OS repetidas" e "Páginas por toner"; change p4f-indicadores-da-operacao,
// design, decisão 10): o ativo, a espera da OS e as páginas do toner.
import { textoDaPorcentagem, textoDoTempo } from '@grafite/domain';

const INTEIRO = new Intl.NumberFormat('pt-BR');

/** O ativo como as listas o escrevem: "NB-0031 · Dell Latitude 5420", ou só o rótulo. */
export const ativoEmTexto = ({ patrimonio, nome }: { patrimonio: string | null; nome: string }) =>
  [patrimonio, nome].filter(Boolean).join(' · ');

/**
 * A espera da OS, como "4 dias esperando o fornecedor" ou "1 dia esperando a peça e 4 dias
 * esperando o fornecedor"; nula sem espera.
 */
export function textoDaEspera({
  esperaPelaPeca,
  esperaPeloFornecedor,
}: {
  esperaPelaPeca: number;
  esperaPeloFornecedor: number;
}): string | null {
  const partes = [
    esperaPelaPeca > 0 ? `${textoDoTempo(esperaPelaPeca)} esperando a peça` : null,
    esperaPeloFornecedor > 0
      ? `${textoDoTempo(esperaPeloFornecedor)} esperando o fornecedor`
      : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(' e ') : null;
}

/** As páginas do toner sobre o rendimento, como "1.850 de 3.000 páginas (61,7%)". */
export const textoDasPaginas = ({
  paginas,
  rendimento,
  porMil,
}: {
  paginas: number;
  rendimento: number;
  porMil: number;
}) =>
  `${INTEIRO.format(paginas)} de ${INTEIRO.format(rendimento)} páginas (${textoDaPorcentagem(porMil)})`;
