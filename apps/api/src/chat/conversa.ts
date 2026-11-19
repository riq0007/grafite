// A conversa como a conta a vê (spec chat, "Conversas", "Conversa direta", "Equipes e canais" e
// "Mensagem"; change chat-com-chamados, design, decisões 1 e 3; tarefa 3.2): a linha da conversa,
// montada para o domínio com as contas da direta e os grupos como estão agora, e a `participacao`
// da conta. A conversa de que a conta não participa responde como inexistente.
import { contas, conversas, grupos, membrosDoGrupo, type Transacao } from '@grafite/db';
import {
  type ConversaParaParticipar,
  type GrupoDaConversa,
  type Participacao,
  participacao,
} from '@grafite/domain';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { naoEncontrado } from '../problemas.ts';
import { type ContaLida, lerContas } from './contas.ts';
import { usaOChatNaConsulta } from './quem-usa.ts';

export const conversaNaoEncontrada = () => naoEncontrado('Conversa não encontrada.');

export type LinhaDaConversa = typeof conversas.$inferSelect;

/** A conta que lê ou escreve, que usa o chat pela guarda da rota, com os grupos ativos de agora. */
export interface ContaQueLe {
  id: string;
  grupos: readonly string[];
}

/** A conversa da conta: a linha, a forma do domínio, a outra conta da direta e o que a conta pode. */
export interface ConversaDaConta {
  linha: LinhaDaConversa;
  conversa: ConversaParaParticipar;
  /** A outra conta da direta, com a foto; a equipe e o canal não têm. */
  outra: ContaLida | null;
  /** O grupo que escreve, com o nome, na equipe e no canal que têm um. */
  participacao: Participacao;
}

/**
 * Monta as conversas para o domínio, numa leitura das contas das diretas e noutra dos grupos. A
 * conta da direta que sumiu do banco não acontece: a chave estrangeira a segura.
 */
export async function conversasParaParticipar(
  tx: Transacao,
  linhas: readonly LinhaDaConversa[],
): Promise<Map<string, { conversa: ConversaParaParticipar; contas: Map<string, ContaLida> }>> {
  const contas = await lerContas(
    tx,
    linhas.flatMap((linha) =>
      linha.tipo === 'direta' ? [linha.contaA ?? '', linha.contaB ?? ''] : [],
    ),
  );
  const idsDosGrupos = [
    ...new Set(
      linhas.flatMap((linha) => [linha.grupoId, linha.escreveGrupoId]).filter((id) => id !== null),
    ),
  ];
  const lidos =
    idsDosGrupos.length > 0
      ? await tx
          .select({ id: grupos.id, nome: grupos.nome, situacao: grupos.situacao })
          .from(grupos)
          .where(inArray(grupos.id, idsDosGrupos))
      : [];
  const grupoDe = new Map<string, GrupoDaConversa>(
    lidos.map((grupo) => [
      grupo.id,
      { id: grupo.id, nome: grupo.nome, ativo: grupo.situacao === 'ativo' },
    ]),
  );
  const grupo = (id: string | null): GrupoDaConversa | null =>
    id === null ? null : (grupoDe.get(id) ?? { id, nome: '', ativo: false });

  const montadas = new Map<
    string,
    { conversa: ConversaParaParticipar; contas: Map<string, ContaLida> }
  >();
  for (const linha of linhas) {
    if (linha.tipo === 'direta') {
      const daDireta = (id: string | null) => {
        const conta = contas.get(id ?? '');
        return {
          id: id ?? '',
          nome: conta?.nome ?? '',
          usaOChat: conta?.usaOChat ?? false,
          daTi: conta?.daTi ?? false,
        };
      };
      montadas.set(linha.id, {
        conversa: { tipo: 'direta', contas: [daDireta(linha.contaA), daDireta(linha.contaB)] },
        contas,
      });
      continue;
    }
    const comum = {
      nome: linha.nome ?? '',
      escreve: grupo(linha.escreveGrupoId),
      arquivada: linha.arquivadaEm !== null,
    };
    montadas.set(linha.id, {
      conversa:
        linha.tipo === 'equipe'
          ? {
              tipo: 'equipe',
              grupo: grupo(linha.grupoId) ?? { id: '', nome: '', ativo: false },
              ...comum,
            }
          : { tipo: 'canal', ...comum },
      contas,
    });
  }
  return montadas;
}

/** A conversa montada para a conta, ou a recusa da conversa que não existe para ela. */
export async function conversaDaLinha(
  tx: Transacao,
  conta: ContaQueLe,
  linha: LinhaDaConversa | undefined,
): Promise<ConversaDaConta> {
  if (!linha) throw conversaNaoEncontrada();
  const montada = (await conversasParaParticipar(tx, [linha])).get(linha.id);
  if (!montada) throw conversaNaoEncontrada();
  const daConta = participacao(
    { id: conta.id, usaOChat: true, grupos: conta.grupos },
    montada.conversa,
  );
  if (!daConta.participa) throw conversaNaoEncontrada();
  const outraId =
    linha.tipo === 'direta' ? (linha.contaA === conta.id ? linha.contaB : linha.contaA) : null;
  return {
    linha,
    conversa: montada.conversa,
    outra: outraId === null ? null : (montada.contas.get(outraId) ?? null),
    participacao: daConta,
  };
}

/** A conversa pelo id, para a conta que lê. */
export async function lerConversaDaConta(
  tx: Transacao,
  conta: ContaQueLe,
  conversaId: string,
): Promise<ConversaDaConta> {
  const [linha] = await tx.select().from(conversas).where(eq(conversas.id, conversaId));
  return conversaDaLinha(tx, conta, linha);
}

/**
 * Trava a conversa para a mensagem, pelo `update` da última mensagem, antes da inclusão: o
 * `uuidv7()` da mensagem sai depois da trava e segue a ordem do commit dentro da conversa (design,
 * decisão 1). A hora não volta, se a mensagem que esperou a trava tiver a hora de antes.
 */
export async function travarParaAMensagem(
  tx: Transacao,
  conta: ContaQueLe,
  conversaId: string,
  momento: Date,
): Promise<ConversaDaConta> {
  const [linha] = await tx
    .update(conversas)
    .set({
      ultimaMensagemEm: sql`greatest(coalesce(${conversas.ultimaMensagemEm}, ${momento}), ${momento})`,
    })
    .where(eq(conversas.id, conversaId))
    .returning();
  return conversaDaLinha(tx, conta, linha);
}

/**
 * A direta das duas contas, que nasce com a primeira mensagem: o `insert ... on conflict do update`
 * cria a conversa ou trava a que já existe, e o par único segura a corrida das duas primeiras, em
 * que a que perde usa a conversa que ganhou. O par vai na ordem do banco, com os ids em minúsculas.
 */
export async function travarADireta(
  tx: Transacao,
  conta: ContaQueLe,
  outraId: string,
  momento: Date,
): Promise<ConversaDaConta> {
  const [contaA, contaB] = [conta.id.toLowerCase(), outraId.toLowerCase()].sort();
  const [linha] = await tx
    .insert(conversas)
    .values({
      orgId: sql`app.current_org()`,
      tipo: 'direta',
      contaA,
      contaB,
      ultimaMensagemEm: momento,
    })
    .onConflictDoUpdate({
      target: [conversas.orgId, conversas.contaA, conversas.contaB],
      targetWhere: sql`${conversas.tipo} = 'direta'`,
      set: {
        ultimaMensagemEm: sql`greatest(${conversas.ultimaMensagemEm}, excluded.ultima_mensagem_em)`,
      },
    })
    .returning();
  return conversaDaLinha(tx, conta, linha);
}

/** O público do `chat.mudou` da conversa (design, decisão 4): quem participa dela. */
export function publicoDaConversa(linha: LinhaDaConversa) {
  if (linha.tipo === 'direta') return { contas: [linha.contaA ?? '', linha.contaB ?? ''] };
  if (linha.tipo === 'equipe') {
    return { permissao: 'chat.usar' as const, grupos: [linha.grupoId ?? ''] };
  }
  return { permissao: 'chat.usar' as const };
}

/**
 * Os ids das contas que participam da conversa agora, como a `participacao` do domínio decide: na
 * direta, as duas que usam o chat; na equipe, as do grupo ativo, sem a saída, que usam o chat; no
 * canal, todas que usam o chat. A arquivada conta do mesmo jeito, para quem a lê; quem notifica a
 * deixa de fora antes.
 */
export async function idsDeQuemParticipa(
  tx: Transacao,
  conversa: ConversaParaParticipar,
): Promise<string[]> {
  if (conversa.tipo === 'direta') return conversa.contas.filter((c) => c.usaOChat).map((c) => c.id);
  if (conversa.tipo === 'equipe') {
    if (!conversa.grupo.ativo) return [];
    const membros = await tx
      .selectDistinct({ id: membrosDoGrupo.contaId })
      .from(membrosDoGrupo)
      .where(
        and(
          eq(membrosDoGrupo.grupoId, conversa.grupo.id),
          isNull(membrosDoGrupo.encerradaEm),
          usaOChatNaConsulta(membrosDoGrupo.contaId),
        ),
      );
    return membros.map(({ id }) => id);
  }
  const todas = await tx
    .select({ id: contas.id })
    .from(contas)
    .where(usaOChatNaConsulta(contas.id));
  return todas.map(({ id }) => id);
}
