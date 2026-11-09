// A OS pela solicitação de conserto (spec ordens-de-servico, "OS pela solicitação de conserto";
// solicitacoes, "Conserto com a ordem de serviço"; change p4e-ordens-de-servico, design, decisões 3 e
// 4): a abertura pela solicitação, que passa a Em atendimento, e a conclusão e o cancelamento que a
// OS faz nela, pelo caminho próprio, que não pergunta se ela segue a OS. A solicitação é travada
// depois da OS, sempre nessa ordem; a abertura trava só a solicitação, porque a OS não existe ainda.
import { ordensDeServico, solicitacoes, type Transacao } from '@grafite/db';
import {
  MENSAGEM_DA_ORDEM_SO_DO_CONSERTO,
  mensagemDaSolicitacaoComOrdem,
  situacaoPendente,
} from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { conflito } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import {
  exigirAtender,
  exigirPendente,
  publicoDosLocais,
  solicitacaoParaMudar,
} from '../solicitacoes/registro.ts';
import { abrir, type Contexto } from './abertura.ts';
import type { LinhaDaOrdem, OrdemLida } from './leitura.ts';

/** A auditoria e o evento da mudança da solicitação, com a OS que ela segue. */
function auditarNaSolicitacao(
  tx: Transacao,
  linha: typeof solicitacoes.$inferSelect,
  {
    acao,
    depois,
    ordem,
    contexto: { requisicao, momento },
  }: {
    acao: 'solicitacao.situacao' | 'solicitacao.concluida' | 'solicitacao.cancelada';
    depois: Record<string, unknown>;
    ordem: number;
    contexto: Contexto;
  },
) {
  const { contaId } = sessaoDa(requisicao);
  return registrarNaAuditoria(tx, {
    acao,
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'solicitacao', id: linha.id },
    antes: { situacao: linha.situacao },
    depois: { ...depois, ordem },
    origem: origemDa(requisicao),
    momento,
    saida: { publico: { permissao: 'solicitacoes.ver', locais: publicoDosLocais(linha) } },
  });
}

/**
 * Abre a OS do conserto pendente, com o ativo e o defeito, e passa a solicitação a Em atendimento.
 * Pede `solicitacoes.atender` nos locais da solicitação e `ordens.atender` no local do ativo.
 */
export async function abrirPelaSolicitacao(
  tx: Transacao,
  numero: number,
  contexto: Contexto,
): Promise<OrdemLida> {
  const { requisicao } = contexto;
  const { acesso } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const linha = await solicitacaoParaMudar(tx, numero, { acesso, arvore });
  exigirAtender(requisicao, linha, arvore);
  if (linha.tipo !== 'conserto') throw conflito(MENSAGEM_DA_ORDEM_SO_DO_CONSERTO);
  exigirPendente(linha);
  const [existente] = await tx
    .select({ numero: ordensDeServico.numero })
    .from(ordensDeServico)
    .where(eq(ordensDeServico.solicitacaoId, linha.id));
  if (existente) throw conflito(mensagemDaSolicitacaoComOrdem(linha.numero, existente.numero));

  const ordem = await abrir(tx, { ativo: linha.ativoId, problema: linha.defeito }, contexto, {
    solicitacaoId: linha.id,
  });
  await tx
    .update(solicitacoes)
    .set({ situacao: 'em-atendimento' })
    .where(eq(solicitacoes.id, linha.id));
  await auditarNaSolicitacao(tx, linha, {
    acao: 'solicitacao.situacao',
    depois: { situacao: 'em-atendimento' },
    ordem: ordem.numero,
    contexto,
  });
  return ordem;
}

/**
 * A solicitação de origem segue a OS: a resolvida conclui a solicitação pendente, com o que foi
 * feito, e a encerrada sem resolver a cancela, com o motivo. A concluída e a cancelada não mudam
 * mais, também com a OS reaberta.
 */
export async function seguirNaSolicitacao(
  tx: Transacao,
  ordem: LinhaDaOrdem,
  mudanca: { nova: 'concluida'; oQueFoiFeito: string } | { nova: 'cancelada'; motivo: string },
  contexto: Contexto,
) {
  if (ordem.solicitacaoId === null) return;
  const [linha] = await tx
    .select()
    .from(solicitacoes)
    .where(eq(solicitacoes.id, ordem.solicitacaoId))
    .for('update');
  if (!linha || !situacaoPendente(linha.situacao)) return;
  const { contaId } = sessaoDa(contexto.requisicao);
  const textos =
    mudanca.nova === 'concluida'
      ? { oQueFoiFeito: mudanca.oQueFoiFeito }
      : { motivoDoCancelamento: mudanca.motivo };
  await tx
    .update(solicitacoes)
    .set({
      situacao: mudanca.nova,
      encerradaPor: contaId,
      encerradaEm: contexto.momento,
      ...textos,
    })
    .where(eq(solicitacoes.id, linha.id));
  await auditarNaSolicitacao(tx, linha, {
    acao: mudanca.nova === 'concluida' ? 'solicitacao.concluida' : 'solicitacao.cancelada',
    depois: { situacao: mudanca.nova, ...textos },
    ordem: ordem.numero,
    contexto,
  });
}
