// Os formatos das telas do software (change software-por-pacote): o momento curto das listas, o tipo
// com o tamanho do pacote e a cor do ícone de cada um.
import { formatarTamanho } from '@grafite/ui';
import type { PacoteDeSoftware } from './consultas.ts';

interface FormatosDeData {
  formatarHora: (data: Date) => string;
  formatarDia: (data: Date) => string;
  grupoDoDia: (data: Date, agora: Date) => string;
}

/** "hoje 09:02" ou "21 out", como as listas mostram o momento. */
export function momentoCurto(data: Date, agora: Date, formatos: FormatosDeData): string {
  if (formatos.grupoDoDia(data, agora) === 'Hoje') return `hoje ${formatos.formatarHora(data)}`;
  return formatos.formatarDia(data).split(' ').slice(1).join(' ');
}

/** "MSI · 118 MB", ou só o tipo, sem arquivo. */
export function tipoETamanho(pacote: Pick<PacoteDeSoftware, 'tipo' | 'arquivo'>): string {
  return pacote.arquivo
    ? `${pacote.tipo.curto} · ${formatarTamanho(pacote.arquivo.tamanho)}`
    : pacote.tipo.longo;
}

/** A cor da série do ícone do pacote, de 1 a 8, sempre a mesma para o mesmo nome. */
export function serieDoPacote(nome: string): number {
  let soma = 0;
  for (const letra of nome) soma = (soma * 31 + (letra.codePointAt(0) ?? 0)) % 9973;
  return (soma % 8) + 1;
}

/** "1 desatualizada", "17 desatualizadas". */
export const plural = (quantidade: number, singular: string, varios: string) =>
  `${quantidade} ${quantidade === 1 ? singular : varios}`;
