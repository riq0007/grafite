// As datas dos campos (spec campos-personalizados): lidas em dd/mm/aaaa, em aaaa-mm-dd ou pelo
// número de série do Excel, de 1900 a 2200, e guardadas em aaaa-mm-dd, sem hora nem fuso.
import { aceito, type Leitura, recusado, vazio } from './tipos.ts';

const INVALIDA = 'Data inválida: use dd/mm/aaaa.';
const FORA = 'Use uma data entre 1900 e 2200.';

const dois = (numero: number) => String(numero).padStart(2, '0');

/** A data civil em aaaa-mm-dd, ou `null` se o dia não existe no mês. */
function dataCivil(ano: number, mes: number, dia: number): string | null {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${String(ano).padStart(4, '0')}-${dois(mes)}-${dois(dia)}`;
}

function dentroDoIntervalo(data: string): Leitura<string> {
  return data >= '1900-01-01' && data <= '2200-12-31' ? aceito(data) : recusado(FORA);
}

/**
 * O número de série do Excel: o dia 1 é 1º de janeiro de 1900, e o Excel conta um 29 de fevereiro
 * de 1900 que não existiu. A partir do 61, 1º de março de 1900, a conta é a dos dias desde
 * 30/12/1899; antes dele, o número é recusado, porque ninguém o usa para uma data de verdade.
 */
function dataDoExcel(serie: number): Leitura<string> {
  if (!Number.isFinite(serie) || serie < 61) return recusado(INVALIDA);
  const data = new Date(Date.UTC(1899, 11, 30) + Math.floor(serie) * 86_400_000);
  return dentroDoIntervalo(
    `${data.getUTCFullYear()}-${dois(data.getUTCMonth() + 1)}-${dois(data.getUTCDate())}`,
  );
}

export function lerData(entrada: unknown): Leitura<string> {
  if (vazio(entrada)) return aceito(null);
  if (typeof entrada === 'number') return dataDoExcel(entrada);
  if (entrada instanceof Date) {
    if (Number.isNaN(entrada.getTime())) return recusado(INVALIDA);
    return dentroDoIntervalo(
      `${entrada.getUTCFullYear()}-${dois(entrada.getUTCMonth() + 1)}-${dois(entrada.getUTCDate())}`,
    );
  }
  if (typeof entrada !== 'string') return recusado(INVALIDA);
  const texto = entrada.trim();
  const brasileira = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(texto);
  const [ano, mes, dia] = brasileira
    ? [brasileira[3], brasileira[2], brasileira[1]]
    : iso
      ? [iso[1], iso[2], iso[3]]
      : [];
  if (ano === undefined || mes === undefined || dia === undefined) return recusado(INVALIDA);
  const data = dataCivil(Number(ano), Number(mes), Number(dia));
  return data ? dentroDoIntervalo(data) : recusado(INVALIDA);
}

export function mostrarData(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}
