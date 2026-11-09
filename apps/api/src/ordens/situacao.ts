// A situação das OS (spec ordens-de-servico, "Situação e histórico da OS", "Fornecedor da OS" e
// "Mudança da situação das OS em lote"; change p4e-ordens-de-servico, design, decisões 4 e 6): a
// mudança de uma, com o fornecedor, a resolução, a reabertura e o encerramento, cada um numa
// transação com o histórico, a auditoria e o evento, e o lote, em que cada OS vai num ponto de
// retorno e a que não pode mudar fica como estava, com o motivo no retorno.
import { fornecedores, historicoDasOrdens, ordensDeServico, type Transacao } from '@grafite/db';
import {
  type AcaoNaOrdem,
  acaoDoLoteDasOrdens,
  mensagemDaRecusaNaOrdem,
  podeEm,
  type RecusaNaOrdem,
  recusaNaOrdem,
  type SituacaoDeAtendimento,
  type SituacaoDoLoteDasOrdens,
  situacaoDepoisDaAcao,
  textoDoLoteDasOrdens,
  validarEncerramentoDaOrdem,
  validarMudancaDaOrdem,
  validarReaberturaDaOrdem,
  validarResolucaoDaOrdem,
} from '@grafite/domain';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { dadosInvalidos } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import {
  type Contexto,
  conferirFornecedor,
  paraMudar,
  publicoDaOrdem,
  recusar,
  semPontas,
} from './abertura.ts';
import { type LinhaDaOrdem, lerOrdem, type OrdemLida } from './leitura.ts';
import { seguirNaSolicitacao } from './solicitacao.ts';

/** As ações que mudam a situação. */
type AcaoDeSituacao = Exclude<AcaoNaOrdem, { acao: 'lancar-peca' | 'corrigir' }>;

const ACAO_DA_AUDITORIA = {
  mudar: 'ordem.situacao',
  resolver: 'ordem.resolvida',
  reabrir: 'ordem.reaberta',
  encerrar: 'ordem.encerrada',
  'encerrar-sem-resolver': 'ordem.encerrada',
} as const;

/** O nome de um fornecedor, para a auditoria. */
async function nomeDoFornecedor(tx: Transacao, id: string | null): Promise<string | null> {
  if (id === null) return null;
  const [linha] = await tx
    .select({ nome: fornecedores.nome })
    .from(fornecedores)
    .where(eq(fornecedores.id, id));
  return linha?.nome ?? null;
}

const semVazios = (visao: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(visao).filter(([, valor]) => valor !== null));

/**
 * Aplica a ação, já conferida: a situação e o que ela guarda na OS, a linha do histórico, a
 * auditoria e o evento. A reabertura limpa a resolução da OS, que fica no histórico.
 */
async function aplicar(
  tx: Transacao,
  linha: LinhaDaOrdem,
  {
    acao,
    texto = null,
    fornecedor = null,
    contexto,
  }: {
    acao: AcaoDeSituacao;
    /** A observação, o que foi feito ou o motivo. */
    texto?: string | null;
    fornecedor?: { id: string; nome: string; os: string | null } | null;
    contexto: Contexto;
  },
) {
  const { requisicao, momento } = contexto;
  const { contaId } = sessaoDa(requisicao);
  const nova = situacaoDepoisDaAcao(acao);
  const guarda = {
    mudar: fornecedor ? { fornecedorId: fornecedor.id, osDoFornecedor: fornecedor.os } : {},
    resolver: { solucao: texto, resolvidaPor: contaId, resolvidaEm: momento },
    reabrir: { solucao: null, resolvidaPor: null, resolvidaEm: null },
    encerrar: { encerradaPor: contaId, encerradaEm: momento },
    'encerrar-sem-resolver': {
      motivoDoEncerramento: texto,
      encerradaPor: contaId,
      encerradaEm: momento,
    },
  }[acao.acao];
  await tx
    .update(ordensDeServico)
    .set({ situacao: nova, ...guarda })
    .where(eq(ordensDeServico.id, linha.id));
  await tx.insert(historicoDasOrdens).values({
    orgId: sql`app.current_org()`,
    ordemId: linha.id,
    situacao: nova,
    texto,
    fornecedorId: nova === 'aguardando-fornecedor' ? (fornecedor?.id ?? null) : null,
    mudadaPor: contaId,
    mudadaEm: momento,
  });

  const comFornecedor = fornecedor !== null;
  const antes = {
    situacao: linha.situacao,
    solucao: acao.acao === 'reabrir' ? linha.solucao : null,
    fornecedor: comFornecedor ? await nomeDoFornecedor(tx, linha.fornecedorId) : null,
    osDoFornecedor: comFornecedor ? linha.osDoFornecedor : null,
  };
  const depois = {
    situacao: nova,
    observacao: acao.acao === 'mudar' ? texto : null,
    solucao: acao.acao === 'resolver' ? texto : null,
    motivo: acao.acao === 'reabrir' || acao.acao === 'encerrar-sem-resolver' ? texto : null,
    fornecedor: fornecedor?.nome ?? null,
    osDoFornecedor: fornecedor?.os ?? null,
  };
  await registrarNaAuditoria(tx, {
    acao: ACAO_DA_AUDITORIA[acao.acao],
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'ordem', id: linha.id },
    antes: semVazios(antes),
    depois: semVazios(depois),
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDaOrdem(linha.localId) },
  });
  // A solicitação de origem segue a OS resolvida e a encerrada sem resolver.
  if (acao.acao === 'resolver' && texto !== null) {
    await seguirNaSolicitacao(tx, linha, { nova: 'concluida', oQueFoiFeito: texto }, contexto);
  }
  if (acao.acao === 'encerrar-sem-resolver' && texto !== null) {
    await seguirNaSolicitacao(tx, linha, { nova: 'cancelada', motivo: texto }, contexto);
  }
}

/** Passa a OS em aberto a Em atendimento, a Aguardando peça ou a Aguardando fornecedor. */
export async function mudarSituacao(
  tx: Transacao,
  numero: number,
  pedido: {
    situacao: SituacaoDeAtendimento;
    observacao: string | null;
    fornecedor: string | null;
    os: string | null;
  },
  contexto: Contexto,
): Promise<OrdemLida> {
  const { linha, leitor } = await paraMudar(tx, numero, contexto);
  const acao = { acao: 'mudar', nova: pedido.situacao } as const;
  recusar(linha, recusaNaOrdem(linha.situacao, acao));
  const observacao = semPontas(pedido.observacao);
  const os = semPontas(pedido.os);
  const erros = validarMudancaDaOrdem({
    situacao: pedido.situacao,
    observacao,
    fornecedor: { fornecedor: pedido.fornecedor, os },
  });
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);
  const fornecedor =
    pedido.situacao === 'aguardando-fornecedor'
      ? { ...(await conferirFornecedor(tx, pedido.fornecedor ?? '')), os }
      : null;
  await aplicar(tx, linha, { acao, texto: observacao, fornecedor, contexto });
  return lerOrdem(tx, leitor, linha.id);
}

/** Resolve a OS em aberto, com o que foi feito. */
export async function resolver(
  tx: Transacao,
  numero: number,
  pedido: { solucao: string | null },
  contexto: Contexto,
): Promise<OrdemLida> {
  const { linha, leitor } = await paraMudar(tx, numero, contexto);
  recusar(linha, recusaNaOrdem(linha.situacao, { acao: 'resolver' }));
  const solucao = semPontas(pedido.solucao);
  const erro = validarResolucaoDaOrdem(solucao);
  if (erro) throw dadosInvalidos({ solucao: erro });
  await aplicar(tx, linha, { acao: { acao: 'resolver' }, texto: solucao, contexto });
  return lerOrdem(tx, leitor, linha.id);
}

/** Reabre a OS resolvida, que volta a Em atendimento, com o motivo. */
export async function reabrir(
  tx: Transacao,
  numero: number,
  pedido: { motivo: string | null },
  contexto: Contexto,
): Promise<OrdemLida> {
  const { linha, leitor } = await paraMudar(tx, numero, contexto);
  recusar(linha, recusaNaOrdem(linha.situacao, { acao: 'reabrir' }));
  const motivo = semPontas(pedido.motivo);
  const erro = validarReaberturaDaOrdem(motivo);
  if (erro) throw dadosInvalidos({ motivo: erro });
  await aplicar(tx, linha, { acao: { acao: 'reabrir' }, texto: motivo, contexto });
  return lerOrdem(tx, leitor, linha.id);
}

/** Encerra a OS resolvida, ou a em aberto sem resolver, com o motivo. */
export async function encerrar(
  tx: Transacao,
  numero: number,
  pedido: { semResolver: boolean; motivo: string | null },
  contexto: Contexto,
): Promise<OrdemLida> {
  const { linha, leitor } = await paraMudar(tx, numero, contexto);
  const acao = pedido.semResolver
    ? ({ acao: 'encerrar-sem-resolver' } as const)
    : ({ acao: 'encerrar' } as const);
  recusar(linha, recusaNaOrdem(linha.situacao, acao));
  const motivo = pedido.semResolver ? semPontas(pedido.motivo) : null;
  if (pedido.semResolver) {
    const erro = validarEncerramentoDaOrdem(motivo);
    if (erro) throw dadosInvalidos({ motivo: erro });
  }
  await aplicar(tx, linha, { acao, texto: motivo, contexto });
  return lerOrdem(tx, leitor, linha.id);
}

/**
 * Muda a situação das OS dadas de uma vez (design, decisão 6). Cada uma vai num ponto de retorno,
 * na ordem dos números, para dois lotes ao mesmo tempo travarem na mesma ordem; a que não pode
 * mudar fica como estava, com o motivo no retorno. No lote, a Encerrada vale só para a Resolvida.
 */
export async function mudarEmLote(
  tx: Transacao,
  pedido: { numeros: number[]; situacao: SituacaoDoLoteDasOrdens },
  contexto: Contexto,
) {
  const { acesso } = sessaoDa(contexto.requisicao);
  const arvore = await lerArvore(tx);
  const numeros = [...new Set(pedido.numeros)].sort((a, b) => a - b);
  const linhas = await tx
    .select()
    .from(ordensDeServico)
    .where(inArray(ordensDeServico.numero, numeros))
    .orderBy(asc(ordensDeServico.numero))
    .for('update');
  const acao = acaoDoLoteDasOrdens(pedido.situacao);
  let mudaram = 0;
  const recusadas: { numero: number; recusa: RecusaNaOrdem }[] = [];
  for (const numero of numeros) {
    const linha = linhas.find((candidata) => candidata.numero === numero);
    const recusa: RecusaNaOrdem | null =
      !linha || !podeEm(acesso, 'ordens.ver', linha.localId, arvore)
        ? { motivo: 'nao-encontrada' }
        : !podeEm(acesso, 'ordens.atender', linha.localId, arvore)
          ? { motivo: 'nao-atende' }
          : recusaNaOrdem(linha.situacao, acao);
    if (recusa || !linha) {
      recusadas.push({ numero, recusa: recusa ?? { motivo: 'nao-encontrada' } });
      continue;
    }
    await tx.transaction((ponto) => aplicar(ponto, linha, { acao, contexto }));
    mudaram += 1;
  }
  return {
    mudaram,
    recusadas: recusadas.map(({ numero, recusa }) => ({
      numero,
      mensagem: mensagemDaRecusaNaOrdem(numero, recusa),
    })),
    texto: textoDoLoteDasOrdens({ mudaram, recusadas }),
  };
}
