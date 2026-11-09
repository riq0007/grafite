// A abertura e a correção das OS (spec ordens-de-servico, "Ordem de serviço" e "Quem vê e quem
// atende as OS"; change p4e-ordens-de-servico, design, decisões 2, 3 e 7), numa transação: os campos
// pelo domínio, o ativo ativo que a conta vê, `ordens.atender` no local dele, o número da
// organização, a OS com o local do ativo, a primeira linha do histórico, e a auditoria e o evento
// para quem vê as OS do local.
import {
  fornecedores,
  historicoDasOrdens,
  numeracaoDasOrdens,
  ordensDeServico,
  type Transacao,
} from '@grafite/db';
import {
  MENSAGEM_DO_ATIVO_INATIVO,
  MENSAGEM_DO_FORNECEDOR_INATIVO,
  mensagemDaRecusaNaOrdem,
  podeEm,
  type RecusaNaOrdem,
  recusaNaOrdem,
  validarAberturaDaOrdem,
  validarCorrecaoDaOrdem,
} from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { conflito, dadosInvalidos, naoEncontrado } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { conferirAtivo } from '../solicitacoes/registro.ts';
import { type LeitorDasOrdens, type LinhaDaOrdem, lerOrdem, type OrdemLida } from './leitura.ts';

export interface Contexto {
  requisicao: FastifyRequest;
  momento: Date;
}

/** O texto aparado, e o vazio como nulo. */
export const semPontas = (texto: string | null | undefined) => {
  const limpo = texto?.trim() ?? '';
  return limpo === '' ? null : limpo;
};

/** O próximo número da organização, na transação da abertura (design, decisão 2). */
async function proximoNumero(tx: Transacao): Promise<number> {
  const [linha] = await tx
    .insert(numeracaoDasOrdens)
    .values({ orgId: sql`app.current_org()`, ultimo: 1 })
    .onConflictDoUpdate({
      target: numeracaoDasOrdens.orgId,
      set: { ultimo: sql`${numeracaoDasOrdens.ultimo} + 1` },
    })
    .returning({ ultimo: numeracaoDasOrdens.ultimo });
  if (!linha) throw new Error('O número da OS não foi gerado.');
  return linha.ultimo;
}

/** O público do evento: quem vê as OS do local dela; a OS sem local, a organização inteira. */
export const publicoDaOrdem = (localId: string | null) => ({
  permissao: 'ordens.ver' as const,
  locais: [localId],
});

/** O que a auditoria guarda da OS: os nomes de agora, sem os ids, e sem o que é vazio. */
export function visaoDaOrdem(ordem: OrdemLida): Record<string, unknown> {
  const visao: Record<string, unknown> = {
    numero: ordem.numero,
    ativo: [ordem.ativo.rotulo, ordem.ativo.patrimonio].filter(Boolean).join(' · '),
    local: ordem.local?.caminho ?? null,
    solicitacao: ordem.solicitacao?.numero ?? null,
    problema: ordem.problema,
    fornecedor: ordem.fornecedor?.nome ?? null,
    osDoFornecedor: ordem.osDoFornecedor,
  };
  return Object.fromEntries(Object.entries(visao).filter(([, valor]) => valor !== null));
}

/** Abre a OS no ativo e a devolve lida. */
export async function abrir(
  tx: Transacao,
  pedido: { ativo: string | null; problema: string | null },
  { requisicao, momento }: Contexto,
  /** A solicitação de conserto de que a OS nasce, conferida por quem chama. */
  { solicitacaoId = null }: { solicitacaoId?: string | null } = {},
): Promise<OrdemLida> {
  const { acesso, contaId } = sessaoDa(requisicao);
  const problema = semPontas(pedido.problema);
  const erros = validarAberturaDaOrdem({ ativo: pedido.ativo, problema });
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);

  const arvore = await lerArvore(tx);
  const leitor: LeitorDasOrdens = { acesso, arvore };
  const conferencia = await conferirAtivo(tx, pedido.ativo ?? '', leitor);
  if ('recusa' in conferencia) {
    if (conferencia.recusa === 'inativo') {
      throw conflito(MENSAGEM_DO_ATIVO_INATIVO, { ativo: MENSAGEM_DO_ATIVO_INATIVO });
    }
    throw dadosInvalidos({ ativo: 'Ativo não encontrado.' });
  }
  const { ativo } = conferencia;
  exigirEm(requisicao, 'ordens.atender', ativo.localId, arvore);

  const numero = await proximoNumero(tx);
  const [aberta] = await tx
    .insert(ordensDeServico)
    .values({
      orgId: sql`app.current_org()`,
      numero,
      ativoId: ativo.id,
      localId: ativo.localId,
      solicitacaoId,
      problema: problema ?? '',
      situacao: 'aberta',
      abertaPor: contaId,
      abertaEm: momento,
    })
    .returning({ id: ordensDeServico.id });
  if (!aberta) throw new Error('A OS não foi aberta.');
  await tx.insert(historicoDasOrdens).values({
    orgId: sql`app.current_org()`,
    ordemId: aberta.id,
    situacao: 'aberta',
    mudadaPor: contaId,
    mudadaEm: momento,
  });

  const lida = await lerOrdem(tx, leitor, aberta.id);
  await registrarNaAuditoria(tx, {
    acao: 'ordem.aberta',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'ordem', id: aberta.id },
    depois: visaoDaOrdem(lida),
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDaOrdem(ativo.localId) },
  });
  return lida;
}

/**
 * A OS pelo número, travada para mudar até o fim da transação: a que não existe e a que a conta não
 * vê são a mesma recusa.
 */
export async function ordemParaMudar(
  tx: Transacao,
  numero: number,
  { acesso, arvore }: LeitorDasOrdens,
): Promise<LinhaDaOrdem> {
  const [linha] = await tx
    .select()
    .from(ordensDeServico)
    .where(eq(ordensDeServico.numero, numero))
    .for('update');
  if (!linha || !podeEm(acesso, 'ordens.ver', linha.localId, arvore)) {
    throw naoEncontrado('Ordem de serviço não encontrada.');
  }
  return linha;
}

/** A OS que a conta vê e atende, travada para mudar. */
export async function paraMudar(tx: Transacao, numero: number, { requisicao }: Contexto) {
  const { acesso } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const leitor: LeitorDasOrdens = { acesso, arvore };
  const linha = await ordemParaMudar(tx, numero, leitor);
  exigirEm(requisicao, 'ordens.atender', linha.localId, arvore);
  return { linha, leitor };
}

/** A recusa da ação que a situação da OS não permite, com a mensagem do domínio. */
export function recusar(linha: LinhaDaOrdem, recusa: RecusaNaOrdem | null) {
  if (recusa) throw conflito(mensagemDaRecusaNaOrdem(linha.numero, recusa));
}

/** O fornecedor ativo: o que não existe é recusado (400), e o inativo (409), no campo. */
export async function conferirFornecedor(
  tx: Transacao,
  id: string,
): Promise<{ id: string; nome: string }> {
  const [fornecedor] = await tx
    .select({ nome: fornecedores.nome, situacao: fornecedores.situacao })
    .from(fornecedores)
    .where(eq(fornecedores.id, id))
    .for('share');
  if (!fornecedor) throw dadosInvalidos({ fornecedor: 'Fornecedor não encontrado.' });
  if (fornecedor.situacao !== 'ativo') {
    throw conflito(MENSAGEM_DO_FORNECEDOR_INATIVO, { fornecedor: MENSAGEM_DO_FORNECEDOR_INATIVO });
  }
  return { id, nome: fornecedor.nome };
}

/**
 * Corrige o problema da OS em aberto e, na OS com o fornecedor, o fornecedor e a OS dele; sem
 * nenhuma mudança, nada vai para a auditoria.
 */
export async function corrigir(
  tx: Transacao,
  numero: number,
  pedido: { problema: string | null; fornecedor?: string | null; os?: string | null },
  contexto: Contexto,
): Promise<OrdemLida> {
  const { requisicao, momento } = contexto;
  const { contaId } = sessaoDa(requisicao);
  const { linha, leitor } = await paraMudar(tx, numero, contexto);
  recusar(linha, recusaNaOrdem(linha.situacao, { acao: 'corrigir' }));
  // O formulário só oferece o fornecedor na OS que tem um.
  const corrigeOFornecedor = pedido.fornecedor !== undefined || pedido.os !== undefined;
  if (corrigeOFornecedor && !linha.fornecedorId) {
    throw dadosInvalidos({ fornecedor: 'A OS não tem fornecedor.' });
  }
  const problema = semPontas(pedido.problema);
  const os = semPontas(pedido.os);
  const erros = validarCorrecaoDaOrdem({
    problema,
    ...(corrigeOFornecedor ? { fornecedor: { fornecedor: pedido.fornecedor ?? null, os } } : {}),
  });
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);
  const fornecedor = corrigeOFornecedor
    ? await conferirFornecedor(tx, pedido.fornecedor ?? '')
    : null;

  const mudou =
    problema !== linha.problema ||
    (fornecedor !== null && (fornecedor.id !== linha.fornecedorId || os !== linha.osDoFornecedor));
  if (!mudou) return lerOrdem(tx, leitor, linha.id);
  const antes = await lerOrdem(tx, leitor, linha.id);
  await tx
    .update(ordensDeServico)
    .set({
      problema: problema ?? linha.problema,
      ...(fornecedor ? { fornecedorId: fornecedor.id, osDoFornecedor: os } : {}),
    })
    .where(eq(ordensDeServico.id, linha.id));
  const depois = await lerOrdem(tx, leitor, linha.id);
  await registrarNaAuditoria(tx, {
    acao: 'ordem.corrigida',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'ordem', id: linha.id },
    antes: visaoDaOrdem(antes),
    depois: visaoDaOrdem(depois),
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDaOrdem(linha.localId) },
  });
  return depois;
}
