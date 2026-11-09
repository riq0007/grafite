// As operações nos controles do Control iD (spec comparacao-e-restauracao-do-control-id; change
// p5b-comparacao-e-restauracao, design, decisões 1, 2 e 5): a restauração de um backup e a
// comparação dele com o controle, pedidas ao coletor como o backup. A restauração pede
// `controlid.restaurar` no local do controle de destino e o código do app da conta; a comparação
// pede `controlid.backup`. O controle sem IP ou fora do alcance de qualquer coletor fica com a
// Falha na hora. Cada mudança grava a auditoria e o evento `controlid.mudaram`.
import {
  backupsDoControlId,
  coletores,
  contas,
  doisPassos,
  operacoesDoControlId,
  pessoas,
  type Transacao,
} from '@grafite/db';
import {
  CATEGORIAS_DA_RESTAURACAO,
  MENSAGENS_DAS_OPERACOES,
  MENSAGENS_DO_BACKUP,
  pedidoExpirado,
  podeEm,
  ROTULOS_DAS_CATEGORIAS,
  resultadoDaOperacao,
  SITUACOES_DO_PEDIDO_ABERTO,
  type TipoDeOperacao,
} from '@grafite/domain';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { conferirCodigoDaConta } from '../acesso/dois-passos.ts';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { type Ator, registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { alvosDaColeta } from '../coleta/alvos.ts';
import { conflito, dadosInvalidos, naoEncontrado, ProblemaDaApi } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import {
  controlesComBackup,
  type LeitorDosBackups,
  lerBackup,
  publicoDoBackup,
  ROTINA_DO_BACKUP,
} from './backups.ts';

const rotuloDa = (categoria: string) =>
  ROTULOS_DAS_CATEGORIAS[categoria as keyof typeof ROTULOS_DAS_CATEGORIAS] ?? categoria;

/** O pedido de uma operação, como a tela o manda. */
export interface PedidoDeOperacao {
  tipo: TipoDeOperacao;
  /** O controle de destino. */
  ativo: string;
  /** As categorias da restauração; sem elas, todas. */
  categorias?: string[] | null;
  /** O código do app autenticador, na restauração. */
  codigo?: string | null;
}

const recusaDoCodigo = (detalhe: string) =>
  new ProblemaDaApi({
    codigo: 'codigo-do-app-recusado',
    status: 403,
    titulo: 'Confirmação recusada',
    detalhe,
    campos: { codigo: detalhe },
  });

/** Pede a restauração do backup num controle, ou a comparação dele com o controle. */
export async function pedirOperacao(
  tx: Transacao,
  backupId: string,
  pedido: PedidoDeOperacao,
  {
    requisicao,
    momento,
    chaveDoisPassos,
  }: { requisicao: FastifyRequest; momento: Date; chaveDoisPassos: Buffer },
) {
  const { acesso, contaId } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const leitor = { acesso, arvore };
  const backup = await lerBackup(tx, leitor, backupId);
  if (!backup.temArquivo) throw conflito(MENSAGENS_DO_BACKUP.semArquivo);
  const [destino] = await controlesComBackup(tx, { ativoIds: [pedido.ativo] });
  if (!destino || !podeEm(acesso, 'controlid.ver', destino.localId, arvore)) {
    throw dadosInvalidos({ ativo: 'Escolha um controle com o backup ligado.' });
  }
  const categorias =
    pedido.tipo === 'restauracao' && pedido.categorias && pedido.categorias.length > 0
      ? pedido.categorias.filter((categoria) =>
          (CATEGORIAS_DA_RESTAURACAO as readonly string[]).includes(categoria),
        )
      : null;
  const ator: Ator = { tipo: 'conta', contaId };
  const origem = origemDa(requisicao);

  if (pedido.tipo === 'restauracao') {
    exigirEm(requisicao, 'controlid.restaurar', destino.localId, arvore);
    const [verificacao] = await tx
      .select({ id: doisPassos.id })
      .from(doisPassos)
      .where(and(eq(doisPassos.contaId, contaId), isNotNull(doisPassos.ativadoEm)));
    if (!verificacao) throw recusaDoCodigo(MENSAGENS_DAS_OPERACOES.semDoisPassos);
    const codigo = (pedido.codigo ?? '').replace(/\s/g, '');
    // O código de recuperação nunca confirma uma restauração.
    const aceito =
      /^\d{6}$/.test(codigo) &&
      (
        await conferirCodigoDaConta(tx, {
          contaId,
          codigo,
          momento,
          chaveDoisPassos,
          ator,
          origem,
        })
      ).aceito;
    if (!aceito) throw recusaDoCodigo(MENSAGENS_DAS_OPERACOES.codigoIncorreto);
  } else {
    exigirEm(requisicao, 'controlid.backup', destino.localId, arvore);
  }

  // O modelo do controle de destino é o do último backup bom dele.
  const [ultimo] = await tx
    .select({ modelo: backupsDoControlId.modelo })
    .from(backupsDoControlId)
    .where(
      and(
        eq(backupsDoControlId.ativoId, destino.id),
        inArray(backupsDoControlId.situacao, ['sucesso', 'parcial']),
      ),
    )
    .orderBy(desc(backupsDoControlId.concluidoEm))
    .limit(1);
  const aviso =
    pedido.tipo === 'restauracao' &&
    backup.modelo &&
    ultimo?.modelo &&
    ultimo.modelo !== backup.modelo
      ? MENSAGENS_DAS_OPERACOES.modeloDiferente
      : null;

  const [alvo] = await alvosDaColeta(tx, { ativoIds: [destino.id], coletas: ['controlid'] });
  const erro = !alvo
    ? MENSAGENS_DO_BACKUP.semIp
    : alvo.coletorId === null
      ? MENSAGENS_DO_BACKUP.semColetor
      : null;
  let criada: { id: string } | undefined;
  try {
    criada = await tx.transaction(async (ponto) => {
      const [linha] = await ponto
        .insert(operacoesDoControlId)
        .values({
          orgId: sql`app.current_org()`,
          backupId,
          ativoId: destino.id,
          tipo: pedido.tipo,
          situacao: erro ? 'falha' : 'na-fila',
          categorias,
          pedidoPor: contaId,
          pedidoEm: momento,
          concluidoEm: erro ? momento : null,
          aviso,
          erro,
        })
        .returning({ id: operacoesDoControlId.id });
      return linha;
    });
  } catch (falha) {
    if (violouUnicidade(falha, 'operacoes_do_control_id_aberta_unica')) {
      throw conflito(MENSAGENS_DAS_OPERACOES.repetida);
    }
    throw falha;
  }
  if (!criada) throw new Error('A operação não entrou na fila.');
  await registrarNaAuditoria(tx, {
    acao: 'operacao-do-control-id.pedida',
    ator,
    alvo: { tipo: 'operacao-do-control-id', id: criada.id },
    depois: {
      tipo: pedido.tipo,
      backup: backup.id,
      controle: [destino.rotulo, destino.patrimonio].filter(Boolean).join(' · '),
      categorias: categorias ? categorias.map(rotuloDa) : 'Todas',
      ...(erro ? { erro } : {}),
    },
    origem,
    momento,
    saida: { publico: publicoDoBackup(destino.localId) },
  });
  return lerOperacao(tx, leitor, criada.id);
}

const daOperacao = {
  id: operacoesDoControlId.id,
  backupId: operacoesDoControlId.backupId,
  ativoId: operacoesDoControlId.ativoId,
  tipo: operacoesDoControlId.tipo,
  situacao: operacoesDoControlId.situacao,
  categorias: operacoesDoControlId.categorias,
  pedidoPor: pessoas.nome,
  pedidoEm: operacoesDoControlId.pedidoEm,
  iniciadoEm: operacoesDoControlId.iniciadoEm,
  concluidoEm: operacoesDoControlId.concluidoEm,
  coletor: coletores.nome,
  resultado: operacoesDoControlId.resultado,
  aviso: operacoesDoControlId.aviso,
  erro: operacoesDoControlId.erro,
};

function consultaDasOperacoes(tx: Transacao) {
  return tx
    .select(daOperacao)
    .from(operacoesDoControlId)
    .leftJoin(
      contas,
      and(
        eq(contas.orgId, operacoesDoControlId.orgId),
        eq(contas.id, operacoesDoControlId.pedidoPor),
      ),
    )
    .leftJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .leftJoin(
      coletores,
      and(
        eq(coletores.orgId, operacoesDoControlId.orgId),
        eq(coletores.id, operacoesDoControlId.coletorId),
      ),
    );
}

type LinhaDaOperacao = Awaited<ReturnType<typeof consultaDasOperacoes>>[number];

const texto = (momento: Date | null) => (momento ? momento.toISOString() : null);

function operacaoLida(linha: LinhaDaOperacao) {
  return {
    id: linha.id,
    backupId: linha.backupId,
    ativoId: linha.ativoId,
    tipo: linha.tipo,
    situacao: linha.situacao,
    categorias:
      (linha.categorias ?? null)?.map((categoria) => ({
        categoria,
        rotulo: rotuloDa(categoria),
      })) ?? null,
    pedidoPor: linha.pedidoPor ?? null,
    pedidoEm: linha.pedidoEm.toISOString(),
    iniciadoEm: texto(linha.iniciadoEm),
    concluidoEm: texto(linha.concluidoEm),
    coletor: linha.coletor ?? null,
    resultado: (linha.resultado ?? []).map((categoria) => ({
      ...(categoria as Record<string, unknown>),
      rotulo: rotuloDa(String((categoria as { categoria?: unknown }).categoria ?? '')),
    })) as Record<string, unknown>[],
    aviso: linha.aviso,
    erro: linha.erro,
  };
}

/** Uma operação de um controle que a conta vê, ou o 404. */
export async function lerOperacao(tx: Transacao, leitor: LeitorDosBackups, id: string) {
  const [linha] = await consultaDasOperacoes(tx).where(eq(operacoesDoControlId.id, id));
  if (!linha) throw naoEncontrado('Operação não encontrada.');
  const [controle] = await controlesComBackup(tx, { ativoIds: [linha.ativoId] });
  if (!podeEm(leitor.acesso, 'controlid.ver', controle?.localId ?? null, leitor.arvore)) {
    throw naoEncontrado('Operação não encontrada.');
  }
  return operacaoLida(linha);
}

/** As 10 operações mais recentes do controle. */
export async function operacoesDoControle(
  tx: Transacao,
  leitor: LeitorDosBackups,
  ativoId: string,
) {
  const [controle] = await controlesComBackup(tx, { ativoIds: [ativoId] });
  if (!controle || !podeEm(leitor.acesso, 'controlid.ver', controle.localId, leitor.arvore)) {
    throw naoEncontrado('Controle não encontrado.');
  }
  const linhas = await consultaDasOperacoes(tx)
    .where(eq(operacoesDoControlId.ativoId, ativoId))
    .orderBy(desc(operacoesDoControlId.pedidoEm))
    .limit(10);
  return {
    itens: linhas.map(operacaoLida),
    podeRestaurar: podeEm(leitor.acesso, 'controlid.restaurar', controle.localId, leitor.arvore),
    podeComparar: podeEm(leitor.acesso, 'controlid.backup', controle.localId, leitor.arvore),
  };
}

/** A operação aberta termina como Falha, com o motivo, a auditoria e o evento. */
export async function concluirOperacaoComFalha(
  tx: Transacao,
  {
    id,
    localId,
    erro,
    momento,
    ator = ROTINA_DO_BACKUP,
  }: { id: string; localId: string | null; erro: string; momento: Date; ator?: Ator },
) {
  const mudadas = await tx
    .update(operacoesDoControlId)
    .set({ situacao: 'falha', concluidoEm: momento, erro })
    .where(
      and(
        eq(operacoesDoControlId.id, id),
        inArray(operacoesDoControlId.situacao, [...SITUACOES_DO_PEDIDO_ABERTO]),
      ),
    )
    .returning({ id: operacoesDoControlId.id });
  if (mudadas.length === 0) return false;
  await registrarNaAuditoria(tx, {
    acao: 'operacao-do-control-id.concluida',
    ator,
    alvo: { tipo: 'operacao-do-control-id', id },
    depois: { situacao: 'falha', erro },
    momento,
    saida: { publico: publicoDoBackup(localId) },
  });
  return true;
}

/** O resultado que o coletor manda: as categorias, com a situação pelo domínio. */
export async function concluirOperacao(
  tx: Transacao,
  {
    id,
    localId,
    categorias,
    momento,
    ator,
  }: {
    id: string;
    localId: string | null;
    categorias: { categoria: string; situacao: 'ok' | 'erro' | 'pulado' }[];
    momento: Date;
    ator: Ator;
  },
) {
  const { situacao, erro } = resultadoDaOperacao(categorias);
  await tx
    .update(operacoesDoControlId)
    .set({ situacao, concluidoEm: momento, resultado: categorias, erro })
    .where(eq(operacoesDoControlId.id, id));
  await registrarNaAuditoria(tx, {
    acao: 'operacao-do-control-id.concluida',
    ator,
    alvo: { tipo: 'operacao-do-control-id', id },
    depois: { situacao, ...(erro ? { erro } : {}) },
    momento,
    saida: { publico: publicoDoBackup(localId) },
  });
  return { situacao };
}

/** Expira as operações que esperaram demais o coletor, como os backups (design, decisão 2). */
export async function expirarOperacoes(tx: Transacao, agora: Date) {
  const abertas = await tx
    .select({
      id: operacoesDoControlId.id,
      ativoId: operacoesDoControlId.ativoId,
      situacao: operacoesDoControlId.situacao,
      pedidoEm: operacoesDoControlId.pedidoEm,
      iniciadoEm: operacoesDoControlId.iniciadoEm,
    })
    .from(operacoesDoControlId)
    .where(inArray(operacoesDoControlId.situacao, [...SITUACOES_DO_PEDIDO_ABERTO]));
  let expiradas = 0;
  for (const aberta of abertas) {
    const erro = pedidoExpirado(aberta, agora);
    if (!erro) continue;
    const [controle] = await controlesComBackup(tx, { ativoIds: [aberta.ativoId] });
    await concluirOperacaoComFalha(tx, {
      id: aberta.id,
      localId: controle?.localId ?? null,
      erro: erro.replace('o backup', 'a operação'),
      momento: agora,
    });
    expiradas += 1;
  }
  return expiradas;
}
