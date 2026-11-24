// Quem participa do chamado pelo chat (spec chamados, "Notificações dos chamados"; change
// chat-com-chamados, design, decisões 4 e 13; tarefas 3.10 e 3.12): a conta da pessoa e, na origem
// `chat`, a de quem o abriu, quando usam o chat, com o módulo Chat ligado. As notificações das ações
// da TI, o "usa o chat" da ficha e o público do `chamados.mudaram` as leem.
import { contas, type Transacao } from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  type ChamadoParaAtenderPeloChat,
  type ChamadoParaParticipar,
  type ContaQueAtendePeloChat,
  esperaAConta,
  type LocaisDoChamado,
  type PublicoDoEvento,
  participaDoChamado,
} from '@grafite/domain';
import { inArray, or, sql } from 'drizzle-orm';
import { carregarAcesso } from '../acesso/acesso.ts';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import { usaOChatNaConsulta } from '../chat/quem-usa.ts';
import { publicoDoChamado } from './alcance.ts';

export interface ContaQueParticipa {
  id: string;
  pessoaId: string;
  usaOChat: boolean;
}

/** A conta da sessão como a participação no chamado a lê: quem lê pelo chat usa o chat. */
export const daConta = (conta: { id: string; pessoaId: string }): ContaQueParticipa => ({
  id: conta.id,
  pessoaId: conta.pessoaId,
  usaOChat: true,
});

/**
 * A conta da sessão com o alcance de `chamados.atender` dela, lido uma vez por pedido, para saber em
 * que chamados ela atende pelo chat e participa pela TI.
 */
export const comOAlcanceDeAtender = (
  conta: { id: string; pessoaId: string; acesso: Acesso },
  arvore: ArvoreDeLocais,
): ContaQueAtendePeloChat => ({
  ...daConta(conta),
  alcance: alcance(conta.acesso, 'chamados.atender', arvore),
});

/**
 * As contas que participam do chamado e esperam a TI, fora quem participa pela TI (design, decisão
 * 4): quem o abriu pelo chat no nome de outra pessoa e atende os locais dele recebe as notificações
 * da TI, como quem atende, e não as de quem participa. O lado sai dos acessos dela, e não dos de
 * quem age; a pessoa do chamado sempre espera, sem ler os acessos.
 */
export async function semQuemParticipaPelaTi(
  tx: Transacao,
  chamado: ChamadoParaAtenderPeloChat,
  participam: readonly ContaQueParticipa[],
  arvore: ArvoreDeLocais,
): Promise<ContaQueParticipa[]> {
  const esperam: ContaQueParticipa[] = [];
  for (const conta of participam) {
    const espera =
      conta.pessoaId === chamado.pessoaId ||
      esperaAConta(
        {
          ...conta,
          alcance: alcance(await carregarAcesso(tx, conta.id), 'chamados.atender', arvore),
        },
        chamado,
      );
    if (espera) esperam.push(conta);
  }
  return esperam;
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

/**
 * A pessoa usa o chat pela conta dela, com o módulo ligado: a mensagem da TI chega a ela. É quem
 * participaria do chamado da origem `ti` (a ficha e o andamento do chat).
 */
export async function pessoaUsaOChat(tx: Transacao, pessoaId: string): Promise<boolean> {
  return (await contasQueParticipam(tx, { pessoaId, origem: 'ti', abertoPor: null })).length > 0;
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
