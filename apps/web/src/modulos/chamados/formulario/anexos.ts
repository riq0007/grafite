// Os anexos do formulário que se preenche (change chamados-da-ti, design, decisão 21): o endereço
// de cada arquivo, pelo lugar onde ele está, o limite de arquivos por campo, o do domínio, e as
// recusas, que dizem o nome do arquivo.
import { MAXIMO_DE_ANEXOS } from '@grafite/domain';
import type { AnexoCitado } from './estado.ts';

/**
 * O endereço do download: o enviado agora, ainda sem dono, pela rota que só o entrega a quem o
 * enviou; o do chamado, pelo número dele. O da prévia, só no navegador, não baixa.
 */
export function enderecoDoAnexo(
  id: string,
  anexo: AnexoCitado | undefined,
  numero?: number,
): string | null {
  const arquivo = encodeURIComponent(id);
  if (anexo?.onde === 'sem-dono') return `/api/chamados/anexos/${arquivo}`;
  if (anexo?.onde === 'no-chamado' && numero !== undefined) {
    return `/api/chamados/${numero}/anexos/${arquivo}`;
  }
  return null;
}

/** Os escolhidos que cabem no campo, na ordem da escolha, e os que ficam de fora. */
export function separarPeloLimite<T>(
  ocupados: number,
  escolhidos: readonly T[],
): { vao: T[]; ficam: T[] } {
  const cabem = Math.max(0, MAXIMO_DE_ANEXOS - ocupados);
  return { vao: escolhidos.slice(0, cabem), ficam: escolhidos.slice(cabem) };
}

const EM_LISTA = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/** A recusa dos escolhidos a mais, com o nome de cada um. */
export function recusaDoLimite(nomes: readonly string[]): string {
  const ficaram = nomes.length === 1 ? 'Ficou' : 'Ficaram';
  return `Anexe até ${MAXIMO_DE_ANEXOS} arquivos. ${ficaram} de fora: ${EM_LISTA.format(nomes)}.`;
}

/** A recusa de um arquivo, antes do envio ou pela API, começando pelo nome dele. */
export const recusaDoArquivo = (nome: string, motivo: string): string => `${nome}: ${motivo}`;
