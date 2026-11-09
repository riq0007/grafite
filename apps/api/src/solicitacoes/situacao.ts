// A situação das solicitações (spec solicitacoes, "Situação da solicitação", "Pedido ao fornecedor"
// e "Mudança da situação em lote"; change p4d-solicitacoes, design, decisão 5): a mudança de uma, o
// pedido ao fornecedor, a conclusão e o cancelamento, cada um numa transação com a auditoria e o
// evento, e o lote, em que cada solicitação vai num ponto de retorno e a que não pode mudar fica
// como estava, com o motivo no retorno.
import { fornecedores, itensDasSolicitacoes, solicitacoes, type Transacao } from '@grafite/db';
import {
  alcance,
  atendeASolicitacao,
  MENSAGEM_DO_FORNECEDOR_INATIVO,
  mensagemDaRecusa,
  type RecusaDaSituacao,
  recusaDaSituacao,
  type SituacaoDeDestino,
  textoDoLote,
  validarCancelamento,
  validarConclusao,
  validarPedidoAoFornecedor,
  veASolicitacao,
} from '@grafite/domain';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { conflito, dadosInvalidos } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import type { Solicitacao } from './esquemas.ts';
import { type LeitorDasSolicitacoes, type LinhaDaSolicitacao, lerSolicitacao } from './leitura.ts';
import {
  exigirAtender,
  exigirPendente,
  exigirQueNaoSigaAOrdem,
  ordensQueSeguem,
  publicoDosLocais,
  solicitacaoParaMudar,
} from './registro.ts';

type SolicitacaoLida = z.infer<typeof Solicitacao>;

interface Contexto {
  requisicao: FastifyRequest;
  momento: Date;
}

/** O texto aparado, e o vazio como nulo. */
const semPontas = (texto: string | null | undefined) => {
  const limpo = texto?.trim() ?? '';
  return limpo === '' ? null : limpo;
};

/** A solicitação que a conta vê e atende, travada para mudar. */
export async function paraMudar(tx: Transacao, numero: number, { requisicao }: Contexto) {
  const { acesso } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const leitor: LeitorDasSolicitacoes = { acesso, arvore };
  const linha = await solicitacaoParaMudar(tx, numero, leitor);
  exigirAtender(requisicao, linha, arvore);
  await exigirQueNaoSigaAOrdem(tx, linha);
  return { linha, leitor };
}

function recusar(linha: LinhaDaSolicitacao, recusa: RecusaDaSituacao | null) {
  if (recusa) throw conflito(mensagemDaRecusa(linha.numero, recusa));
}

/** A auditoria e o evento de uma mudança, para quem vê as solicitações dos locais dela. */
function auditar(
  tx: Transacao,
  linha: LinhaDaSolicitacao,
  {
    acao,
    antes,
    depois,
    contexto: { requisicao, momento },
  }: {
    acao:
      | 'solicitacao.situacao'
      | 'solicitacao.pedida'
      | 'solicitacao.concluida'
      | 'solicitacao.cancelada';
    antes: Record<string, unknown>;
    depois: Record<string, unknown>;
    contexto: Contexto;
  },
) {
  const { contaId } = sessaoDa(requisicao);
  const semVazios = (visao: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(visao).filter(([, valor]) => valor !== null));
  return registrarNaAuditoria(tx, {
    acao,
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'solicitacao', id: linha.id },
    antes: semVazios(antes),
    depois: semVazios(depois),
    origem: origemDa(requisicao),
    momento,
    saida: { publico: { permissao: 'solicitacoes.ver', locais: publicoDosLocais(linha) } },
  });
}

/** O nome de um fornecedor, para a auditoria. */
async function nomeDoFornecedor(tx: Transacao, id: string | null): Promise<string | null> {
  if (id === null) return null;
  const [linha] = await tx
    .select({ nome: fornecedores.nome })
    .from(fornecedores)
    .where(eq(fornecedores.id, id));
  return linha?.nome ?? null;
}

/**
 * Aplica a situação nova, já conferida, à solicitação. No toner concluído pelo lote, os itens
 * pendentes ficam entregues pelo fornecedor do pedido, sem movimentação no estoque.
 */
async function aplicar(
  tx: Transacao,
  linha: LinhaDaSolicitacao,
  {
    nova,
    oQueFoiFeito = null,
    motivo = null,
    contexto,
  }: {
    nova: SituacaoDeDestino;
    oQueFoiFeito?: string | null;
    motivo?: string | null;
    contexto: Contexto;
  },
) {
  const { contaId } = sessaoDa(contexto.requisicao);
  const { momento } = contexto;
  const encerra = nova === 'concluida' || nova === 'cancelada';
  let entreguePeloFornecedor: string | null = null;
  if (nova === 'concluida' && linha.tipo === 'toner') {
    entreguePeloFornecedor = await nomeDoFornecedor(tx, linha.fornecedorId);
    await tx
      .update(itensDasSolicitacoes)
      .set({
        origem: 'fornecedor',
        fornecedorId: linha.fornecedorId,
        entreguePor: contaId,
        entregueEm: momento,
      })
      .where(
        and(
          eq(itensDasSolicitacoes.solicitacaoId, linha.id),
          isNull(itensDasSolicitacoes.entregueEm),
        ),
      );
  }
  await tx
    .update(solicitacoes)
    .set({
      situacao: nova,
      ...(encerra ? { encerradaPor: contaId, encerradaEm: momento } : {}),
      ...(nova === 'concluida' ? { oQueFoiFeito } : {}),
      ...(nova === 'cancelada' ? { motivoDoCancelamento: motivo } : {}),
    })
    .where(eq(solicitacoes.id, linha.id));
  const acao =
    nova === 'concluida'
      ? 'solicitacao.concluida'
      : nova === 'cancelada'
        ? 'solicitacao.cancelada'
        : 'solicitacao.situacao';
  await auditar(tx, linha, {
    acao,
    antes: { situacao: linha.situacao },
    depois: {
      situacao: nova,
      oQueFoiFeito: nova === 'concluida' ? oQueFoiFeito : null,
      motivoDoCancelamento: nova === 'cancelada' ? motivo : null,
      entreguePeloFornecedor,
    },
    contexto,
  });
}

/** Passa a solicitação a Em atendimento ou a Aguardando entrega. */
export async function mudarSituacao(
  tx: Transacao,
  numero: number,
  nova: 'em-atendimento' | 'aguardando-entrega',
  contexto: Contexto,
): Promise<SolicitacaoLida> {
  const { linha, leitor } = await paraMudar(tx, numero, contexto);
  recusar(linha, recusaDaSituacao({ tipo: linha.tipo, atual: linha.situacao, nova }));
  await aplicar(tx, linha, { nova, contexto });
  return lerSolicitacao(tx, leitor, linha.id);
}

/** Conclui o conserto ou o equipamento, com o que foi feito. */
export async function concluir(
  tx: Transacao,
  numero: number,
  pedido: { oQueFoiFeito: string | null },
  contexto: Contexto,
): Promise<SolicitacaoLida> {
  const { linha, leitor } = await paraMudar(tx, numero, contexto);
  recusar(linha, recusaDaSituacao({ tipo: linha.tipo, atual: linha.situacao, nova: 'concluida' }));
  const erro = validarConclusao(pedido.oQueFoiFeito);
  if (erro) throw dadosInvalidos({ oQueFoiFeito: erro });
  await aplicar(tx, linha, {
    nova: 'concluida',
    oQueFoiFeito: semPontas(pedido.oQueFoiFeito),
    contexto,
  });
  return lerSolicitacao(tx, leitor, linha.id);
}

/** Cancela a solicitação pendente, com o motivo. */
export async function cancelar(
  tx: Transacao,
  numero: number,
  pedido: { motivo: string | null },
  contexto: Contexto,
): Promise<SolicitacaoLida> {
  const { linha, leitor } = await paraMudar(tx, numero, contexto);
  recusar(linha, recusaDaSituacao({ tipo: linha.tipo, atual: linha.situacao, nova: 'cancelada' }));
  const erro = validarCancelamento(pedido.motivo);
  if (erro) throw dadosInvalidos({ motivo: erro });
  await aplicar(tx, linha, { nova: 'cancelada', motivo: semPontas(pedido.motivo), contexto });
  return lerSolicitacao(tx, leitor, linha.id);
}

/**
 * Registra ou corrige o pedido ao fornecedor do toner e do equipamento pendentes: a solicitação
 * passa a Aguardando entrega. Sem nenhuma mudança, nada vai para a auditoria.
 */
export async function pedirAoFornecedor(
  tx: Transacao,
  numero: number,
  pedido: { fornecedor: string | null; os: string | null },
  contexto: Contexto,
): Promise<SolicitacaoLida> {
  const { linha, leitor } = await paraMudar(tx, numero, contexto);
  exigirPendente(linha);
  if (linha.tipo === 'conserto') recusar(linha, { motivo: 'aguardando-no-conserto' });
  const os = semPontas(pedido.os);
  const erros = validarPedidoAoFornecedor({ fornecedor: pedido.fornecedor, os });
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);
  const fornecedorId = pedido.fornecedor ?? '';
  const [fornecedor] = await tx
    .select({ nome: fornecedores.nome, situacao: fornecedores.situacao })
    .from(fornecedores)
    .where(eq(fornecedores.id, fornecedorId))
    .for('share');
  if (!fornecedor) throw dadosInvalidos({ fornecedor: 'Fornecedor não encontrado.' });
  if (fornecedor.situacao !== 'ativo') {
    throw conflito(MENSAGEM_DO_FORNECEDOR_INATIVO, { fornecedor: MENSAGEM_DO_FORNECEDOR_INATIVO });
  }
  const mudou =
    linha.fornecedorId !== fornecedorId ||
    linha.osDoFornecedor !== os ||
    linha.situacao !== 'aguardando-entrega';
  if (mudou) {
    await tx
      .update(solicitacoes)
      .set({ fornecedorId, osDoFornecedor: os, situacao: 'aguardando-entrega' })
      .where(eq(solicitacoes.id, linha.id));
    await auditar(tx, linha, {
      acao: 'solicitacao.pedida',
      antes: {
        situacao: linha.situacao,
        fornecedor: await nomeDoFornecedor(tx, linha.fornecedorId),
        osDoFornecedor: linha.osDoFornecedor,
      },
      depois: { situacao: 'aguardando-entrega', fornecedor: fornecedor.nome, osDoFornecedor: os },
      contexto,
    });
  }
  return lerSolicitacao(tx, leitor, linha.id);
}

/**
 * Muda a situação das solicitações dadas de uma vez (design, decisão 5). Cada uma vai num ponto de
 * retorno, na ordem dos números, para dois lotes ao mesmo tempo travarem na mesma ordem; a que não
 * pode mudar fica como estava, com o motivo no retorno.
 */
export async function mudarEmLote(
  tx: Transacao,
  pedido: { numeros: number[]; situacao: SituacaoDeDestino; motivo: string | null },
  contexto: Contexto,
) {
  const motivo = semPontas(pedido.motivo);
  if (pedido.situacao === 'cancelada') {
    const erro = validarCancelamento(motivo);
    if (erro) throw dadosInvalidos({ motivo: erro });
  }
  const { acesso } = sessaoDa(contexto.requisicao);
  const arvore = await lerArvore(tx);
  const ver = alcance(acesso, 'solicitacoes.ver', arvore);
  const atender = alcance(acesso, 'solicitacoes.atender', arvore);
  const numeros = [...new Set(pedido.numeros)].sort((a, b) => a - b);
  const linhas = await tx
    .select()
    .from(solicitacoes)
    .where(inArray(solicitacoes.numero, numeros))
    .orderBy(asc(solicitacoes.numero))
    .for('update');
  const seguem = await ordensQueSeguem(
    tx,
    linhas.map(({ id }) => id),
  );
  let mudaram = 0;
  const recusadas: { numero: number; recusa: RecusaDaSituacao }[] = [];
  for (const numero of numeros) {
    const linha = linhas.find((candidata) => candidata.numero === numero);
    const recusa: RecusaDaSituacao | null =
      !linha || !veASolicitacao(ver, linha)
        ? { motivo: 'nao-encontrada' }
        : !atendeASolicitacao(atender, linha)
          ? { motivo: 'nao-atende' }
          : recusaDaSituacao({
              tipo: linha.tipo,
              atual: linha.situacao,
              nova: pedido.situacao,
              noLote: true,
              comFornecedor: linha.fornecedorId !== null,
              segueAOrdem: seguem.get(linha.id) ?? null,
            });
    if (recusa || !linha) {
      recusadas.push({ numero, recusa: recusa ?? { motivo: 'nao-encontrada' } });
      continue;
    }
    await tx.transaction((ponto) =>
      aplicar(ponto, linha, { nova: pedido.situacao, motivo, contexto }),
    );
    mudaram += 1;
  }
  return {
    mudaram,
    recusadas: recusadas.map(({ numero, recusa }) => ({
      numero,
      mensagem: mensagemDaRecusa(numero, recusa),
    })),
    texto: textoDoLote({ mudaram, recusadas }),
  };
}
