// Quem participa do chamado pelo chat (spec chamados, "Notificações dos chamados"; change
// chat-com-chamados, design, decisões 4 e 13; tarefas 3.10 e 3.12): a conta da pessoa e, na origem
// `chat`, a de quem o abriu, quando usam o chat, com o módulo Chat ligado. As notificações das ações
// da TI, o "usa o chat" da ficha e o público do `chamados.mudaram` as leem.
import { contas, type Transacao } from '@grafite/db';
import {
  type ChamadoParaParticipar,
  type LocaisDoChamado,
  type PublicoDoEvento,
  participaDoChamado,
} from '@grafite/domain';
import { inArray, or, sql } from 'drizzle-orm';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import { usaOChatNaConsulta } from '../chat/quem-usa.ts';
import { publicoDoChamado } from './alcance.ts';

export interface ContaQueParticipa {
  id: string;
  pessoaId: string;
  usaOChat: boolean;
}

/**
 * As contas que participam de cada chamado da lista agora, numa consulta só; nenhuma com o Chat
 * desligado. O fechamento as lê para o lote inteiro.
 */
export async function contasQueParticipamDos<T extends ChamadoParaParticipar>(
  tx: Transacao,
  lista: readonly T[],
): Promise<Map<T, ContaQueParticipa[]>> {
  const porChamado = new Map<T, ContaQueParticipa[]>(lista.map((chamado) => [chamado, []]));
  if (lista.length === 0 || !(await ligadoNaTransacao(tx, 'chat'))) return porChamado;
  const pessoas = [...new Set(lista.map(({ pessoaId }) => pessoaId))];
  const abriram = [
    ...new Set(
      lista.flatMap(({ origem, abertoPor }) =>
        origem === 'chat' && abertoPor !== null ? [abertoPor] : [],
      ),
    ),
  ];
  const linhas = await tx
    .select({
      id: contas.id,
      pessoaId: contas.pessoaId,
      usaOChat: sql<boolean>`${usaOChatNaConsulta(contas.id)}`,
    })
    .from(contas)
    .where(
      or(
        inArray(contas.pessoaId, pessoas),
        abriram.length > 0 ? inArray(contas.id, abriram) : undefined,
      ),
    );
  for (const [chamado, participam] of porChamado) {
    participam.push(...linhas.filter((conta) => participaDoChamado(conta, chamado)));
  }
  return porChamado;
}

/** As contas que participam do chamado agora; nenhuma com o Chat desligado. */
export async function contasQueParticipam(
  tx: Transacao,
  chamado: ChamadoParaParticipar,
): Promise<ContaQueParticipa[]> {
  return (await contasQueParticipamDos(tx, [chamado])).get(chamado) ?? [];
}

/** O público com as contas de quem participa somadas, que leem o chamado sem as permissões dele. */
export const comQuemParticipa = (
  publico: PublicoDoEvento,
  participam: readonly ContaQueParticipa[],
): PublicoDoEvento =>
  participam.length === 0 ? publico : { ...publico, contas: participam.map(({ id }) => id) };

/**
 * O público do `chamados.mudaram` (design, decisão 4): quem vê o chamado nos locais dele, os de antes
 * e os de depois, e as contas de quem participa dele pelo chat.
 */
export async function publicoComQuemParticipa(
  tx: Transacao,
  chamado: ChamadoParaParticipar,
  ...locais: LocaisDoChamado[]
): Promise<PublicoDoEvento> {
  return comQuemParticipa(publicoDoChamado(...locais), await contasQueParticipam(tx, chamado));
}
