// Os formatos das telas do software (change software-por-pacote): o momento curto das listas, a
// outra distribuição em que a máquina já aguarda o pacote, o tipo com o tamanho do pacote e a cor do
// ícone de cada um.
import { formatarTamanho } from '@grafite/ui';
import type { OutraDistribuicao, PacoteDeSoftware } from './consultas.ts';

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

/**
 * A outra distribuição em que a máquina já aguarda o pacote (design, decisões 10 e 11): o quando dela
 * e a hora do envio, no relógio de quem vê, como "na janela da noite, enviada às 09:02", "enviada
 * ontem às 18:40" ou "a partir de qui 19 nov às 08:00, enviada em 12 nov às 11:30".
 */
export function textoDaOutra(
  outra: OutraDistribuicao,
  agora: Date,
  formatos: FormatosDeData,
): string {
  const criadaEm = new Date(outra.criadaEm);
  const hora = formatos.formatarHora(criadaEm);
  const dia = formatos.grupoDoDia(criadaEm, agora);
  const enviada =
    dia === 'Hoje'
      ? `enviada às ${hora}`
      : dia === 'Ontem'
        ? `enviada ontem às ${hora}`
        : `enviada em ${momentoCurto(criadaEm, agora, formatos)} às ${hora}`;
  const { chave, aPartirDe } = outra.quando;
  if (chave === 'noite') return `na janela da noite, ${enviada}`;
  if (chave === 'dia' && aPartirDe) {
    const inicio = new Date(aPartirDe);
    return `a partir de ${formatos.formatarDia(inicio)} às ${formatos.formatarHora(inicio)}, ${enviada}`;
  }
  return enviada;
}

/** "MSI · 118 MB", ou só o tipo, sem arquivo. */
export function tipoETamanho(pacote: Pick<PacoteDeSoftware, 'tipo' | 'arquivo'>): string {
  return pacote.arquivo
    ? `${pacote.tipo.curto} · ${formatarTamanho(pacote.arquivo.tamanho)}`
    : pacote.tipo.longo;
}

/** "Driver HP Universal 7.3": o nome do pacote com a versão, quando o nome ainda não a traz. */
export const nomeComVersao = (pacote: { nome: string; versao: string | null }) =>
  pacote.versao && !pacote.nome.includes(pacote.versao)
    ? `${pacote.nome} ${pacote.versao}`
    : pacote.nome;

/** A cor da série do ícone do pacote, de 1 a 8, sempre a mesma para o mesmo nome. */
export function serieDoPacote(nome: string): number {
  let soma = 0;
  for (const letra of nome) soma = (soma * 31 + (letra.codePointAt(0) ?? 0)) % 9973;
  return (soma % 8) + 1;
}

/** "1 desatualizada", "17 desatualizadas". */
export const plural = (quantidade: number, singular: string, varios: string) =>
  `${quantidade} ${quantidade === 1 ? singular : varios}`;
