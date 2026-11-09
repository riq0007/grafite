// O último contato do coletor na tela (spec modulo-administracao, "Tela de coletores"): a idade, ou
// "Sem contato ainda". O coletor ativo sem contato há mais de 10 min fica na situação de atenção,
// com "Sem contato há 25 min", no texto e no ícone.
import { idadeRelativa, type Situacao } from '@grafite/ui';

/** Sem contato por mais que isso, o coletor ativo chama a atenção, em ms. */
const SEM_CONTATO_CHAMA_A_ATENCAO = 10 * 60_000;

export function contatoDoColetor(
  coletor: { situacao: 'ativo' | 'inativo'; ultimoContatoEm: string | null },
  agora: Date,
): { texto: string; situacao: Situacao | null } {
  if (!coletor.ultimoContatoEm) return { texto: 'Sem contato ainda', situacao: null };
  const momento = new Date(coletor.ultimoContatoEm);
  const idade = idadeRelativa(momento, agora);
  if (
    coletor.situacao === 'ativo' &&
    agora.getTime() - momento.getTime() > SEM_CONTATO_CHAMA_A_ATENCAO
  ) {
    return { texto: `Sem contato há ${idade}`, situacao: 'atencao' };
  }
  return { texto: idade === 'agora' ? 'Agora' : `Há ${idade}`, situacao: null };
}
