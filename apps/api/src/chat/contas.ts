// As contas como o chat as mostra (spec chat, "Quem usa o chat"; change chat-com-chamados, design,
// decisões 3 e 15): o nome da pessoa, o "(TI)" de quem atende os chamados e a foto, só de quem usa
// o chat. Servem às listas, à escolha da direta, aos autores das mensagens e à conversa aberta.
import { contas, pessoas, type Transacao } from '@grafite/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { FotoDaPessoa } from '../arquivos/esquemas.ts';
import { daTiNaConsulta, usaOChatNaConsulta } from './quem-usa.ts';

export const ContaDoChat = z
  .object({
    conta: z.uuid(),
    /** O nome da pessoa, sem o "(TI)": a tela o põe pelo `daTi`. */
    nome: z.string(),
    /** Tem `chamados.atender` em algum local: leva o "(TI)" depois do nome. */
    daTi: z.boolean(),
    /** A foto da pessoa, só de quem usa o chat; sem ela, as iniciais. */
    foto: FotoDaPessoa.nullable(),
  })
  .meta({ id: 'ContaDoChat' });

export type ContaDoChat = z.infer<typeof ContaDoChat>;

/** As colunas da conta no chat, na consulta de `contas` com `pessoas`. */
export const colunasDaConta = {
  conta: contas.id,
  pessoaId: pessoas.id,
  nome: pessoas.nome,
  fotoId: pessoas.fotoId,
  daTi: sql<boolean>`${daTiNaConsulta(contas.id)}`,
  usaOChat: sql<boolean>`${usaOChatNaConsulta(contas.id)}`,
};

/** A conta como o banco a dá, com o que o chat mostra e o que decide. */
export interface ContaLida {
  conta: string;
  pessoaId: string;
  nome: string;
  fotoId: string | null;
  daTi: boolean;
  usaOChat: boolean;
}

/** A conta para a tela: a foto só de quem usa o chat. */
export const contaDoChat = (linha: ContaLida): ContaDoChat => ({
  conta: linha.conta,
  nome: linha.nome,
  daTi: linha.daTi,
  foto: linha.usaOChat && linha.fotoId ? { id: linha.fotoId } : null,
});

/** As contas dadas, pelo id, com o nome de agora. */
export async function lerContas(
  tx: Transacao,
  ids: readonly string[],
): Promise<Map<string, ContaLida>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const linhas = await tx
    .select(colunasDaConta)
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(inArray(contas.id, unicos));
  return new Map(linhas.map((linha) => [linha.conta, linha]));
}
