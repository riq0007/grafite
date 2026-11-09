// Os backups do Control iD na API (spec backup-do-control-id; change p5a-backup-do-control-id,
// design, decisões 2, 5, 6 e 9): os controles com o backup ligado, o backup na fila pelo pedido de
// alguém e pela agenda, a expiração do pedido que o coletor não buscou ou não terminou, a leitura
// do histórico com o que a conta vê, a exclusão e o download. Cada mudança grava a auditoria e o
// evento `controlid.mudaram`, para quem vê os backups do local do controle.
import {
  ativos,
  backupsDoControlId,
  coletores,
  contas,
  modelos,
  pessoas,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  agendadoDevido,
  CATEGORIA_DAS_FOTOS,
  type CategoriaLida,
  contagensDoBackup,
  diasDosBackups,
  HORARIO_PADRAO_DO_BACKUP,
  MENSAGENS_DO_BACKUP,
  nomeDoArquivoDoBackup,
  type OrigemDoBackup,
  pedidoExpirado,
  podeEm,
  ROTULOS_DAS_CATEGORIAS,
  SITUACOES_DO_PEDIDO_ABERTO,
  type SituacaoDoBackup,
} from '@grafite/domain';
import { and, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { rotuloNoBanco } from '../ativos/colunas.ts';
import { type Ator, registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { alvosDaColeta } from '../coleta/alvos.ts';
import { decodificarCursor, pagina } from '../paginacao.ts';
import { conflito, naoEncontrado } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import type { BackupDoControlId, FiltrosDosBackups, ResumoDosBackups } from './esquemas.ts';

/** Um controle com o backup ligado no tipo, com a saúde do Control iD junto. */
export interface ControleComBackup {
  id: string;
  rotulo: string;
  patrimonio: string | null;
  localId: string | null;
  horario: string;
}

/** Quem lê os backups: o acesso da conta e a árvore dos locais. */
export interface LeitorDosBackups {
  acesso: Acesso;
  arvore: ArvoreDeLocais;
}

const doModelo = and(eq(modelos.orgId, ativos.orgId), eq(modelos.id, ativos.modeloId));
const doTipo = and(eq(tiposDeAtivo.orgId, ativos.orgId), eq(tiposDeAtivo.id, ativos.tipoId));

/** Os controles ativos dos tipos com o backup e a saúde do Control iD ligados. */
export async function controlesComBackup(
  tx: Transacao,
  { ativoIds }: { ativoIds?: readonly string[] } = {},
): Promise<ControleComBackup[]> {
  if (ativoIds && ativoIds.length === 0) return [];
  const linhas = await tx
    .select({
      id: ativos.id,
      rotulo: sql<string>`${rotuloNoBanco}`,
      patrimonio: ativos.patrimonio,
      localId: ativos.localId,
      horario: sql<
        string | null
      >`(${tiposDeAtivo.configuracaoDasCapacidades} -> 'controlid.backup' ->> 'horario')`,
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, doTipo)
    .leftJoin(modelos, doModelo)
    .where(
      and(
        eq(ativos.situacao, 'ativo'),
        sql`'controlid.backup' = any(${tiposDeAtivo.capacidades})`,
        sql`'controlid.saude' = any(${tiposDeAtivo.capacidades})`,
        ativoIds ? inArray(ativos.id, [...ativoIds]) : undefined,
      ),
    )
    .orderBy(ativos.id);
  return linhas.map((linha) => ({ ...linha, horario: linha.horario ?? HORARIO_PADRAO_DO_BACKUP }));
}

/** A chave da ordem da lista no cursor: o momento do pedido e o id. */
const CursorDosBackups = z.tuple([z.string(), z.uuid()]);

/** O público do evento dos backups: quem vê os backups do local do controle. */
export const publicoDoBackup = (localId: string | null) => ({
  permissao: 'controlid.ver' as const,
  locais: [localId],
});

/** O ator do que a agenda, a expiração e a retenção fazem sozinhas. */
export const ROTINA_DO_BACKUP: Ator = { tipo: 'sistema', descricao: 'Backup do Control iD' };

/** O pedido aberto do controle impediu outro. */
export const REPETIDO = Symbol('repetido');

/**
 * Põe o backup do controle na fila, ou o registra como Falha quando ele não tem IP ou nenhum coletor
 * o alcança. Com outro pedido aberto do mesmo controle, nada muda, e volta `REPETIDO`.
 */
export async function enfileirar(
  tx: Transacao,
  controle: ControleComBackup,
  {
    origem,
    ator,
    momento,
    origemDaRequisicao,
  }: {
    origem: OrigemDoBackup;
    ator: Ator;
    momento: Date;
    origemDaRequisicao?: ReturnType<typeof origemDa>;
  },
): Promise<{ id: string; situacao: SituacaoDoBackup } | typeof REPETIDO> {
  const [alvo] = await alvosDaColeta(tx, { ativoIds: [controle.id], coletas: ['controlid'] });
  const erro = !alvo
    ? MENSAGENS_DO_BACKUP.semIp
    : alvo.coletorId === null
      ? MENSAGENS_DO_BACKUP.semColetor
      : null;
  let criado: { id: string } | undefined;
  try {
    // Num ponto de retorno: o pedido repetido desfaz só a inclusão, e a transação segue.
    criado = await tx.transaction(async (ponto) => {
      const [linha] = await ponto
        .insert(backupsDoControlId)
        .values({
          orgId: sql`app.current_org()`,
          ativoId: controle.id,
          origem,
          situacao: erro ? 'falha' : 'na-fila',
          pedidoPor: ator.tipo === 'conta' ? ator.contaId : null,
          pedidoEm: momento,
          concluidoEm: erro ? momento : null,
          erro,
        })
        .returning({ id: backupsDoControlId.id });
      return linha;
    });
  } catch (falha) {
    if (violouUnicidade(falha, 'backups_do_control_id_aberto_unico')) return REPETIDO;
    throw falha;
  }
  if (!criado) throw new Error('O backup não entrou na fila.');
  await registrarNaAuditoria(tx, {
    acao: 'backup-do-control-id.pedido',
    ator,
    alvo: { tipo: 'backup-do-control-id', id: criado.id },
    depois: {
      controle: [controle.rotulo, controle.patrimonio].filter(Boolean).join(' · '),
      origem,
      ...(erro ? { erro } : {}),
    },
    ...(origemDaRequisicao ? { origem: origemDaRequisicao } : {}),
    momento,
    saida: { publico: publicoDoBackup(controle.localId) },
  });
  return { id: criado.id, situacao: erro ? 'falha' : 'na-fila' };
}

/** O "Fazer backup agora" da ficha: o controle que a conta vê, com `controlid.backup` no local. */
export async function pedirBackup(
  tx: Transacao,
  ativoId: string,
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
) {
  const { acesso, contaId } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const [controle] = await controlesComBackup(tx, { ativoIds: [ativoId] });
  if (!controle || !podeEm(acesso, 'controlid.ver', controle.localId, arvore)) {
    throw naoEncontrado('Controle não encontrado.');
  }
  exigirEm(requisicao, 'controlid.backup', controle.localId, arvore);
  const resultado = await enfileirar(tx, controle, {
    origem: 'manual',
    ator: { tipo: 'conta', contaId },
    momento,
    origemDaRequisicao: origemDa(requisicao),
  });
  if (resultado === REPETIDO) throw conflito(MENSAGENS_DO_BACKUP.repetido);
  return lerBackup(tx, { acesso, arvore }, resultado.id);
}

/** O "Backup de todos os controles": um pedido por controle em que a conta faz o backup. */
export async function pedirTodos(
  tx: Transacao,
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
) {
  const { acesso, contaId } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const controles = (await controlesComBackup(tx)).filter((controle) =>
    podeEm(acesso, 'controlid.backup', controle.localId, arvore),
  );
  const contagem = { pedidos: 0, jaNaFila: 0, falhas: 0 };
  for (const controle of controles) {
    const resultado = await enfileirar(tx, controle, {
      origem: 'manual',
      ator: { tipo: 'conta', contaId },
      momento,
      origemDaRequisicao: origemDa(requisicao),
    });
    if (resultado === REPETIDO) contagem.jaNaFila += 1;
    else if (resultado.situacao === 'falha') contagem.falhas += 1;
    else contagem.pedidos += 1;
  }
  return contagem;
}

/**
 * A rotina de 5 em 5 minutos (design, decisão 5): expira os pedidos que esperaram demais o coletor
 * e põe na fila o agendado do dia de cada controle cujo horário já passou.
 */
export async function agendarEExpirar(tx: Transacao, agora: Date) {
  const abertos = await tx
    .select({
      id: backupsDoControlId.id,
      situacao: backupsDoControlId.situacao,
      pedidoEm: backupsDoControlId.pedidoEm,
      iniciadoEm: backupsDoControlId.iniciadoEm,
      localId: ativos.localId,
    })
    .from(backupsDoControlId)
    .innerJoin(
      ativos,
      and(eq(ativos.orgId, backupsDoControlId.orgId), eq(ativos.id, backupsDoControlId.ativoId)),
    )
    .where(inArray(backupsDoControlId.situacao, [...SITUACOES_DO_PEDIDO_ABERTO]));
  let expirados = 0;
  for (const aberto of abertos) {
    const erro = pedidoExpirado(aberto, agora);
    if (!erro) continue;
    await concluirComFalha(tx, { id: aberto.id, localId: aberto.localId, erro, momento: agora });
    expirados += 1;
  }

  const controles = await controlesComBackup(tx);
  // O último agendado e o último de qualquer origem: o manual depois do horário vale como o do dia,
  // mesmo quando a retenção já apagou o agendado.
  const ultimos = new Map(
    (
      await tx
        .select({
          ativoId: backupsDoControlId.ativoId,
          agendado:
            sql<Date | null>`max(${backupsDoControlId.pedidoEm}) filter (where ${backupsDoControlId.origem} = 'agendado')`.mapWith(
              backupsDoControlId.pedidoEm,
            ),
          qualquer: sql<Date>`max(${backupsDoControlId.pedidoEm})`.mapWith(
            backupsDoControlId.pedidoEm,
          ),
        })
        .from(backupsDoControlId)
        .groupBy(backupsDoControlId.ativoId)
    ).map(({ ativoId, agendado, qualquer }) => [ativoId, { agendado, qualquer }]),
  );
  let agendados = 0;
  for (const controle of controles) {
    const doControle = ultimos.get(controle.id) ?? { agendado: null, qualquer: null };
    if (!agendadoDevido(controle.horario, agora, doControle)) continue;
    const resultado = await enfileirar(tx, controle, {
      origem: 'agendado',
      ator: ROTINA_DO_BACKUP,
      momento: agora,
    });
    if (resultado !== REPETIDO) agendados += 1;
  }
  return { expirados, agendados };
}

/** O pedido aberto termina como Falha, com o motivo, a auditoria e o evento. */
export async function concluirComFalha(
  tx: Transacao,
  {
    id,
    localId,
    erro,
    momento,
    ator = ROTINA_DO_BACKUP,
  }: { id: string; localId: string | null; erro: string; momento: Date; ator?: Ator },
) {
  const mudados = await tx
    .update(backupsDoControlId)
    .set({ situacao: 'falha', concluidoEm: momento, erro, arquivo: null })
    .where(
      and(
        eq(backupsDoControlId.id, id),
        inArray(backupsDoControlId.situacao, [...SITUACOES_DO_PEDIDO_ABERTO]),
      ),
    )
    .returning({ id: backupsDoControlId.id });
  if (mudados.length === 0) return false;
  await registrarNaAuditoria(tx, {
    acao: 'backup-do-control-id.concluido',
    ator,
    alvo: { tipo: 'backup-do-control-id', id },
    depois: { situacao: 'falha', erro },
    momento,
    saida: { publico: publicoDoBackup(localId) },
  });
  return true;
}

/** As colunas que a tela mostra de cada backup. */
const doBackup = {
  id: backupsDoControlId.id,
  ativoId: backupsDoControlId.ativoId,
  rotulo: sql<string>`${rotuloNoBanco}`,
  patrimonio: ativos.patrimonio,
  localId: ativos.localId,
  origem: backupsDoControlId.origem,
  situacao: backupsDoControlId.situacao,
  pedidoPor: pessoas.nome,
  pedidoEm: backupsDoControlId.pedidoEm,
  iniciadoEm: backupsDoControlId.iniciadoEm,
  concluidoEm: backupsDoControlId.concluidoEm,
  coletor: coletores.nome,
  arquivo: backupsDoControlId.arquivo,
  tamanho: backupsDoControlId.tamanho,
  registros: backupsDoControlId.registros,
  fotos: backupsDoControlId.fotos,
  serie: backupsDoControlId.serie,
  firmware: backupsDoControlId.firmware,
  modelo: backupsDoControlId.modelo,
  categorias: backupsDoControlId.categorias,
  erro: backupsDoControlId.erro,
};

function consultaDosBackups(tx: Transacao) {
  return tx
    .select(doBackup)
    .from(backupsDoControlId)
    .innerJoin(
      ativos,
      and(eq(ativos.orgId, backupsDoControlId.orgId), eq(ativos.id, backupsDoControlId.ativoId)),
    )
    .innerJoin(tiposDeAtivo, doTipo)
    .leftJoin(modelos, doModelo)
    .leftJoin(
      contas,
      and(eq(contas.orgId, backupsDoControlId.orgId), eq(contas.id, backupsDoControlId.pedidoPor)),
    )
    .leftJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .leftJoin(
      coletores,
      and(
        eq(coletores.orgId, backupsDoControlId.orgId),
        eq(coletores.id, backupsDoControlId.coletorId),
      ),
    );
}

type LinhaDoBackup = Awaited<ReturnType<typeof consultaDosBackups>>[number];

const comoTexto = (momento: Date | null) => (momento ? momento.toISOString() : null);

/** O backup como a tela o mostra, com o que a conta pode fazer com ele. */
function backupLido(
  linha: LinhaDoBackup,
  { acesso, arvore }: LeitorDosBackups,
): z.infer<typeof BackupDoControlId> {
  const aberto = (SITUACOES_DO_PEDIDO_ABERTO as readonly string[]).includes(linha.situacao);
  return {
    id: linha.id,
    controle: { id: linha.ativoId, rotulo: linha.rotulo, patrimonio: linha.patrimonio },
    origem: linha.origem,
    situacao: linha.situacao,
    pedidoPor: linha.pedidoPor ?? null,
    pedidoEm: linha.pedidoEm.toISOString(),
    iniciadoEm: comoTexto(linha.iniciadoEm),
    concluidoEm: comoTexto(linha.concluidoEm),
    coletor: linha.coletor ?? null,
    temArquivo: linha.arquivo !== null,
    tamanho: linha.tamanho,
    registros: linha.registros,
    fotos: linha.fotos,
    serie: linha.serie,
    firmware: linha.firmware,
    modelo: linha.modelo,
    categorias: (linha.categorias ?? []).map((categoria) => ({
      categoria: categoria.categoria,
      rotulo:
        ROTULOS_DAS_CATEGORIAS[categoria.categoria as keyof typeof ROTULOS_DAS_CATEGORIAS] ??
        categoria.categoria,
      situacao: categoria.situacao,
      quantidade: categoria.quantidade,
      erro: categoria.erro ?? null,
    })),
    erro: linha.erro,
    podeApagar: !aberto && podeEm(acesso, 'controlid.backup', linha.localId, arvore),
  };
}

/** Um backup que a conta vê, ou o 404. */
export async function lerBackup(tx: Transacao, leitor: LeitorDosBackups, id: string) {
  const [linha] = await consultaDosBackups(tx).where(eq(backupsDoControlId.id, id));
  if (!linha || !podeEm(leitor.acesso, 'controlid.ver', linha.localId, leitor.arvore)) {
    throw naoEncontrado('Backup não encontrado.');
  }
  return backupLido(linha, leitor);
}

/** A página dos backups dos controles que a conta vê, dos mais novos para os mais antigos. */
export async function lerPaginaDeBackups(
  tx: Transacao,
  leitor: LeitorDosBackups,
  filtros: z.infer<typeof FiltrosDosBackups>,
) {
  const depois = filtros.cursor ? decodificarCursor(filtros.cursor, CursorDosBackups) : null;
  const linhas = await consultaDosBackups(tx)
    .where(
      and(
        filtros.ativo ? eq(backupsDoControlId.ativoId, filtros.ativo) : undefined,
        filtros.situacao ? eq(backupsDoControlId.situacao, filtros.situacao) : undefined,
        depois
          ? or(
              lt(backupsDoControlId.pedidoEm, new Date(depois[0])),
              and(
                eq(backupsDoControlId.pedidoEm, new Date(depois[0])),
                lt(backupsDoControlId.id, depois[1]),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(backupsDoControlId.pedidoEm), desc(backupsDoControlId.id))
    // Os que a conta não vê são filtrados depois: lê com folga para a página encher.
    .limit(filtros.limite * 4 + 1);
  const vistos = linhas.filter((linha) =>
    podeEm(leitor.acesso, 'controlid.ver', linha.localId, leitor.arvore),
  );
  const { linhas: daPagina, proximo } = pagina(vistos, filtros.limite, (linha) => [
    linha.pedidoEm.toISOString(),
    linha.id,
  ]);
  const controles = await controlesComBackup(tx);
  return {
    itens: daPagina.map((linha) => backupLido(linha, leitor)),
    proximo,
    podeFazer: controles.some((controle) =>
      podeEm(leitor.acesso, 'controlid.backup', controle.localId, leitor.arvore),
    ),
  };
}

/** O histórico do controle na ficha: os backups, o horário e se a conta pode pedir. */
export async function backupsDoControle(tx: Transacao, leitor: LeitorDosBackups, ativoId: string) {
  const [controle] = await controlesComBackup(tx, { ativoIds: [ativoId] });
  if (!controle || !podeEm(leitor.acesso, 'controlid.ver', controle.localId, leitor.arvore)) {
    throw naoEncontrado('Controle não encontrado.');
  }
  const linhas = await consultaDosBackups(tx)
    .where(eq(backupsDoControlId.ativoId, ativoId))
    .orderBy(desc(backupsDoControlId.pedidoEm), desc(backupsDoControlId.id))
    .limit(60);
  return {
    itens: linhas.map((linha) => backupLido(linha, leitor)),
    podeFazer: podeEm(leitor.acesso, 'controlid.backup', controle.localId, leitor.arvore),
    horario: controle.horario,
  };
}

/** Apaga o backup que não está aberto, com `controlid.backup` no local; devolve a chave do ZIP. */
export async function apagarBackup(
  tx: Transacao,
  id: string,
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
): Promise<string | null> {
  const { acesso, contaId } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const backup = await lerBackup(tx, { acesso, arvore }, id);
  const [linha] = await tx
    .select({ localId: ativos.localId, arquivo: backupsDoControlId.arquivo })
    .from(backupsDoControlId)
    .innerJoin(
      ativos,
      and(eq(ativos.orgId, backupsDoControlId.orgId), eq(ativos.id, backupsDoControlId.ativoId)),
    )
    .where(eq(backupsDoControlId.id, id));
  exigirEm(requisicao, 'controlid.backup', linha?.localId ?? null, arvore);
  if ((SITUACOES_DO_PEDIDO_ABERTO as readonly string[]).includes(backup.situacao)) {
    throw conflito(MENSAGENS_DO_BACKUP.aberto);
  }
  await tx.delete(backupsDoControlId).where(eq(backupsDoControlId.id, id));
  await registrarNaAuditoria(tx, {
    acao: 'backup-do-control-id.apagado',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'backup-do-control-id', id },
    antes: {
      controle: [backup.controle.rotulo, backup.controle.patrimonio].filter(Boolean).join(' · '),
      situacao: backup.situacao,
      concluidoEm: backup.concluidoEm,
    },
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDoBackup(linha?.localId ?? null) },
  });
  return linha?.arquivo ?? null;
}

/** O ZIP de um backup que a conta vê: a chave, o nome do download e a auditoria. */
export async function arquivoParaBaixar(
  tx: Transacao,
  id: string,
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
): Promise<{ chave: string; nome: string }> {
  const { acesso, contaId } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const backup = await lerBackup(tx, { acesso, arvore }, id);
  const [linha] = await tx
    .select({ arquivo: backupsDoControlId.arquivo })
    .from(backupsDoControlId)
    .where(eq(backupsDoControlId.id, id));
  if (!linha?.arquivo || !backup.concluidoEm) throw naoEncontrado(MENSAGENS_DO_BACKUP.semArquivo);
  await registrarNaAuditoria(tx, {
    acao: 'backup-do-control-id.baixado',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'backup-do-control-id', id },
    dados: {
      controle: [backup.controle.rotulo, backup.controle.patrimonio].filter(Boolean).join(' · '),
    },
    origem: origemDa(requisicao),
    momento,
  });
  return {
    chave: linha.arquivo,
    nome: nomeDoArquivoDoBackup(
      { patrimonio: backup.controle.patrimonio, nome: backup.controle.rotulo },
      new Date(backup.concluidoEm),
    ),
  };
}

/** A chave do ZIP de um backup que a conta vê, para o conteúdo e as fotos. */
export async function chaveParaLer(tx: Transacao, leitor: LeitorDosBackups, id: string) {
  await lerBackup(tx, leitor, id);
  const [linha] = await tx
    .select({ arquivo: backupsDoControlId.arquivo })
    .from(backupsDoControlId)
    .where(eq(backupsDoControlId.id, id));
  if (!linha?.arquivo) throw naoEncontrado(MENSAGENS_DO_BACKUP.semArquivo);
  return linha.arquivo;
}

export { CATEGORIA_DAS_FOTOS };

/**
 * O resumo dos backups de cada controle que a conta vê (change suprimentos-rostos-e-backups,
 * design, decisão 6): os dias de São Paulo com a melhor situação, o último e o anterior bons, com os
 * usuários e os rostos, e a série dos rostos dos backups do período. Com o `ativo`, um controle só.
 */
export async function resumoDosBackups(
  tx: Transacao,
  { acesso, arvore }: LeitorDosBackups,
  { ativo, dias, agora }: { ativo?: string; dias: number; agora: Date },
): Promise<z.infer<typeof ResumoDosBackups>> {
  const controles = (await controlesComBackup(tx, ativo ? { ativoIds: [ativo] } : {})).filter(
    (controle) => podeEm(acesso, 'controlid.ver', controle.localId, arvore),
  );
  if (controles.length === 0) return { controles: [] };
  const ids = controles.map((controle) => controle.id);
  const desde = new Date(agora.getTime() - (dias + 1) * 24 * 60 * 60_000);
  const doPeriodo = await tx
    .select({
      ativoId: backupsDoControlId.ativoId,
      situacao: backupsDoControlId.situacao,
      concluidoEm: backupsDoControlId.concluidoEm,
      categorias: backupsDoControlId.categorias,
    })
    .from(backupsDoControlId)
    .where(
      and(inArray(backupsDoControlId.ativoId, ids), gte(backupsDoControlId.concluidoEm, desde)),
    )
    .orderBy(backupsDoControlId.concluidoEm);
  const { rows: bons } = await tx.execute<{
    ativo_id: string;
    situacao: 'sucesso' | 'parcial';
    concluido_em: Date | string;
    categorias: CategoriaLida[] | null;
    n: number;
  }>(sql`
    select ativo_id, situacao, concluido_em, categorias, n from (
      select ativo_id, situacao, concluido_em, categorias,
        row_number() over (partition by ativo_id order by concluido_em desc) as n
      from ${backupsDoControlId}
      where ativo_id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
        and situacao in ('sucesso', 'parcial') and concluido_em is not null
    ) as ordenados
    where n <= 2`);
  return {
    controles: controles.map((controle) => {
      const doControle = doPeriodo.filter((linha) => linha.ativoId === controle.id);
      const ultimo = bons.find((linha) => linha.ativo_id === controle.id && Number(linha.n) === 1);
      const anterior = bons.find(
        (linha) => linha.ativo_id === controle.id && Number(linha.n) === 2,
      );
      return {
        controle: { id: controle.id, rotulo: controle.rotulo, patrimonio: controle.patrimonio },
        dias: diasDosBackups(doControle, dias, agora),
        ultimo: ultimo
          ? {
              concluidoEm: new Date(ultimo.concluido_em).toISOString(),
              situacao: ultimo.situacao,
              ...contagensDoBackup(ultimo.categorias ?? []),
            }
          : null,
        anterior: anterior ? contagensDoBackup(anterior.categorias ?? []) : null,
        rostos: doControle.flatMap((linha) => {
          if (linha.situacao !== 'sucesso' && linha.situacao !== 'parcial') return [];
          const { rostos } = contagensDoBackup(linha.categorias ?? []);
          return rostos === null || !linha.concluidoEm
            ? []
            : [{ momento: linha.concluidoEm.toISOString(), valor: rostos }];
        }),
      };
    }),
  };
}
