// O evento das pessoas (design do F2c, decisão 9): toda escrita de uma pessoa ou da conta dela grava
// pessoas.mudaram com a pessoa no alvo. Recebem o evento quem vê pessoas no escopo do local de
// trabalho dela, o de antes e o de depois da mudança, e a própria conta da pessoa, mesmo sem ver
// pessoas, para a casca mostrar, por exemplo, a foto nova no menu do usuário.
import { contas, pessoas, type Transacao } from '@grafite/db';
import { and, eq } from 'drizzle-orm';
import type { SaidaDoEvento } from '../auditoria.ts';

export interface PessoaDoEvento {
  pessoaId: string;
  /** O local de trabalho de antes e o de depois; `null` é a pessoa sem local. */
  locais: readonly (string | null)[];
  /** A conta da pessoa, se houver. */
  contaId?: string | null;
}

export function saidaDaPessoa({ pessoaId, locais, contaId }: PessoaDoEvento): SaidaDoEvento {
  return {
    alvo: { tipo: 'pessoa', id: pessoaId },
    publico: {
      permissao: 'pessoas.ver',
      locais: [...new Set(locais)],
      ...(contaId ? { contas: [contaId] } : {}),
    },
  };
}

/** O evento da pessoa de uma conta, lida na transação: a pessoa, o local de trabalho e a conta. */
export async function saidaDaConta(tx: Transacao, contaId: string): Promise<SaidaDoEvento> {
  const [linha] = await tx
    .select({ pessoaId: pessoas.id, localId: pessoas.localId })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(eq(contas.id, contaId));
  if (!linha) throw new Error(`A conta ${contaId} não foi encontrada para o evento.`);
  return saidaDaPessoa({ pessoaId: linha.pessoaId, locais: [linha.localId], contaId });
}
