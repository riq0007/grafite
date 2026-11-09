// Copiar as linhas de uma tabela (spec tabelas-configuraveis): a linha dos rótulos das colunas à
// vista e uma linha por registro, com os valores como a tabela os mostra, separados por tabulação,
// para colar numa planilha.
import { avisar, copiarParaAreaDeTransferencia } from '@grafite/ui';

/** Uma coluna à vista: o rótulo e o texto do valor num registro, `null` quando vazio ou oculto. */
export interface ColunaParaCopiar<T> {
  rotulo: string;
  texto: (registro: T) => string | null;
}

/** As tabulações e as quebras de linha de um valor viram espaços: ele fica na sua célula. */
const naCelula = (texto: string | null) => (texto ?? '').replace(/\r\n|[\t\r\n]/g, ' ');

export function linhasParaCopiar<T>(
  colunas: readonly ColunaParaCopiar<T>[],
  registros: readonly T[],
): string {
  return [
    colunas.map((coluna) => naCelula(coluna.rotulo)),
    ...registros.map((registro) => colunas.map((coluna) => naCelula(coluna.texto(registro)))),
  ]
    .map((linha) => linha.join('\t'))
    .join('\n');
}

/** Copia as linhas e diz quantas, como "1 linha copiada." e "3 linhas copiadas.". */
export async function copiarLinhas<T>(
  colunas: readonly ColunaParaCopiar<T>[],
  registros: readonly T[],
  copiar: (texto: string) => Promise<void> = copiarParaAreaDeTransferencia,
): Promise<void> {
  try {
    await copiar(linhasParaCopiar(colunas, registros));
  } catch {
    avisar({ situacao: 'atencao', titulo: 'Não foi possível copiar as linhas.' });
    return;
  }
  avisar({
    situacao: 'sucesso',
    titulo: registros.length === 1 ? '1 linha copiada.' : `${registros.length} linhas copiadas.`,
  });
}
