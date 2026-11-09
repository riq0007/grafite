// A conta de uma pessoa como a administração a vê (spec administracao-de-pessoas): o usuário, a
// situação, a verificação em dois passos, o bloqueio da entrada e o que a conta da sessão pode
// fazer com ela. A própria conta se cuida na seção Conta dos Ajustes, e não por aqui.
import { contas, doisPassos, type Transacao, tentativasDeEntrada } from '@grafite/db';
import { pode } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { SessaoDaRequisicao } from './sessoes.ts';

export const ContaDaFicha = z
  .object({
    id: z.uuid(),
    /** Nulo na conta anonimizada. */
    usuario: z.string().nullable(),
    situacao: z.enum(['ativa', 'inativa', 'anonimizada']),
    /** A própria conta exige os dois passos (os perfis podem exigir também). */
    exigeDoisPassos: z.boolean(),
    doisPassos: z.enum(['ativa', 'desativada']),
    /** A senha ainda é a temporária: a primeira entrada pede a troca. */
    senhaTemporaria: z.boolean(),
    /** Até quando a entrada está bloqueada pelas tentativas erradas, ou nulo. */
    entradaBloqueadaAte: z.iso.datetime().nullable(),
    ultimaEntradaEm: z.iso.datetime().nullable(),
    permite: z.object({
      /** Mudar o usuário e a exigência dos dois passos. */
      editar: z.boolean(),
      redefinir: z.boolean(),
      removerDoisPassos: z.boolean(),
      desbloquear: z.boolean(),
      inativar: z.boolean(),
      reativar: z.boolean(),
      encerrarSessoes: z.boolean(),
    }),
  })
  .meta({ id: 'ContaDaFicha' });

export async function lerContaDaFicha(
  tx: Transacao,
  contaId: string,
  {
    sessao,
    pessoaAtiva,
    momento,
  }: { sessao: SessaoDaRequisicao; pessoaAtiva: boolean; momento: Date },
): Promise<z.infer<typeof ContaDaFicha>> {
  const [linha] = await tx
    .select({ conta: contas, doisPassosAtivadoEm: doisPassos.ativadoEm })
    .from(contas)
    .leftJoin(doisPassos, eq(doisPassos.contaId, contas.id))
    .where(eq(contas.id, contaId));
  if (!linha) throw new Error('A conta não existe.');
  const { conta } = linha;
  let bloqueadaAte: Date | null = null;
  if (conta.usuario !== null) {
    const [tentativa] = await tx
      .select({ ate: tentativasDeEntrada.bloqueadaAte })
      .from(tentativasDeEntrada)
      .where(eq(tentativasDeEntrada.usuario, conta.usuario));
    if (tentativa?.ate && tentativa.ate.getTime() > momento.getTime()) bloqueadaAte = tentativa.ate;
  }
  const doisPassosAtivos = linha.doisPassosAtivadoEm !== null;
  // contas.administrar vale só para a organização inteira: ter em algum escopo é tê-la nela.
  const administra =
    pode(sessao.acesso, 'contas.administrar') &&
    conta.id !== sessao.contaId &&
    conta.situacao !== 'anonimizada';
  return {
    id: conta.id,
    usuario: conta.usuario,
    situacao: conta.situacao,
    exigeDoisPassos: conta.exigeDoisPassos,
    doisPassos: doisPassosAtivos ? 'ativa' : 'desativada',
    senhaTemporaria: conta.senhaTemporaria,
    entradaBloqueadaAte: bloqueadaAte?.toISOString() ?? null,
    ultimaEntradaEm: conta.ultimaEntradaEm?.toISOString() ?? null,
    permite: {
      editar: administra,
      redefinir: administra,
      removerDoisPassos: administra && doisPassosAtivos,
      desbloquear: administra && bloqueadaAte !== null,
      inativar: administra && conta.situacao === 'ativa',
      reativar: administra && conta.situacao === 'inativa' && pessoaAtiva,
      encerrarSessoes: administra && conta.situacao === 'ativa',
    },
  };
}
