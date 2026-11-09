// As ligações livres entre ativos, o "Ligado a" (spec ligacoes-de-ativos; design do P1d, decisão 3).
// Ligar e desfazer pedem `ativos.editar` nos locais dos dois ativos. As duas linhas são travadas na
// ordem dos ids, e as ligações de cada um são contadas depois disso: duas ligações ao mesmo tempo não
// passam do limite nem travam uma à outra. O par vai sempre em ordem, e o banco não deixa o mesmo par
// entrar duas vezes. Cada ativo ganha um registro na auditoria, com o outro, e o evento dele.
import { ativos, campos, camposDoTipo, ligacoesDeAtivos, type Transacao } from '@grafite/db';
import {
  type ArvoreDeLocais,
  alcance,
  type ConfiguracaoDoCampo,
  LIMITE_DE_LIGACOES,
  normalizarTexto,
  parDaLigacao,
  podeEm,
  RECUSAS_DA_LIGACAO,
  rotuloDoAtivo,
} from '@grafite/domain';
import { and, asc, count, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { exigirEm } from '../acesso/escopo.ts';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { saidaDoAtivo } from '../eventos/ativos.ts';
import { conflito, dadosInvalidos, naoEncontrado } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { rotuloNoBanco, semAcento } from './colunas.ts';
import type { LigacaoLivre, LigadosDoAtivo } from './esquemas.ts';
import { ativoLigado, consultarAtivos, type LinhaDoAtivo } from './leitura.ts';

const ativoNaoEncontrado = () => naoEncontrado('Ativo não encontrado.');
const ligacaoNaoEncontrada = () => naoEncontrado('Ligação não encontrada.');

interface QuemLiga {
  requisicao: FastifyRequest;
  sessao: SessaoDaRequisicao;
  arvore: ArvoreDeLocais;
  momento: Date;
}

/** Trava as linhas dos dois ativos, na ordem dos ids, e devolve as que existem. */
async function travarOsDois(tx: Transacao, par: readonly [string, string]) {
  for (const id of par) {
    await tx.select({ id: ativos.id }).from(ativos).where(eq(ativos.id, id)).for('update');
  }
  const linhas = await consultarAtivos(tx).where(or(...par.map((id) => eq(ativos.id, id))));
  return new Map(linhas.map((linha) => [linha.ativo.id, linha]));
}

const doAtivo = (ativoId: string) =>
  or(eq(ligacoesDeAtivos.ativoA, ativoId), eq(ligacoesDeAtivos.ativoB, ativoId));

async function quantasLigacoes(tx: Transacao, ativoId: string): Promise<number> {
  const [linha] = await tx
    .select({ total: count() })
    .from(ligacoesDeAtivos)
    .where(doAtivo(ativoId));
  return linha?.total ?? 0;
}

/** Um registro na auditoria de cada ativo, com o outro pelo nome, e o evento de cada um. */
async function auditarNosDois(
  tx: Transacao,
  acao: 'ativo.ligado' | 'ativo.desligado',
  { requisicao, sessao, momento }: QuemLiga,
  ligacaoId: string,
  [um, outro]: readonly [LinhaDoAtivo, LinhaDoAtivo],
) {
  for (const [ativo, doOutroLado] of [
    [um, outro],
    [outro, um],
  ] as const) {
    await registrarNaAuditoria(tx, {
      acao,
      ator: { tipo: 'conta', contaId: sessao.contaId },
      alvo: { tipo: 'ativo', id: ativo.ativo.id },
      dados: {
        ligacaoId,
        outro: {
          id: doOutroLado.ativo.id,
          rotulo: rotuloDoAtivo({
            nome: doOutroLado.ativo.nome,
            modelo: doOutroLado.modelo,
            tipo: doOutroLado.tipo,
          }),
        },
      },
      origem: origemDa(requisicao),
      momento,
      saida: saidaDoAtivo({ ativoId: ativo.ativo.id, locais: [ativo.ativo.localId] }),
    });
  }
}

/** Liga este ativo ao outro e devolve a ligação, com o outro lado. */
export async function ligarAtivos(
  tx: Transacao,
  quem: QuemLiga,
  { esteId, outroId }: { esteId: string; outroId: string },
): Promise<z.infer<typeof LigacaoLivre>> {
  const { requisicao, sessao, arvore, momento } = quem;
  const conferido = parDaLigacao(esteId, outroId);
  if (!conferido.ok) throw dadosInvalidos({ outroId: conferido.erro });
  const linhas = await travarOsDois(tx, conferido.par);
  const este = linhas.get(esteId);
  if (!este) throw ativoNaoEncontrado();
  exigirEm(requisicao, 'ativos.editar', este.ativo.localId, arvore);
  const outro = linhas.get(outroId);
  if (!outro) throw ativoNaoEncontrado();
  exigirEm(requisicao, 'ativos.editar', outro.ativo.localId, arvore);

  if (este.ativo.situacao !== 'ativo') throw conflito(RECUSAS_DA_LIGACAO.esteInativo);
  if (outro.ativo.situacao !== 'ativo') {
    throw conflito(RECUSAS_DA_LIGACAO.outroInativo, { outroId: RECUSAS_DA_LIGACAO.outroInativo });
  }
  const [ativoA, ativoB] = conferido.par;
  const doPar = and(eq(ligacoesDeAtivos.ativoA, ativoA), eq(ligacoesDeAtivos.ativoB, ativoB));
  const [repetida] = await tx
    .select({ id: ligacoesDeAtivos.id })
    .from(ligacoesDeAtivos)
    .where(doPar);
  if (repetida) throw conflito(RECUSAS_DA_LIGACAO.repetida);
  if ((await quantasLigacoes(tx, esteId)) >= LIMITE_DE_LIGACOES) {
    throw conflito(RECUSAS_DA_LIGACAO.limite);
  }
  if ((await quantasLigacoes(tx, outroId)) >= LIMITE_DE_LIGACOES) {
    throw conflito(RECUSAS_DA_LIGACAO.limiteDoOutro, { outroId: RECUSAS_DA_LIGACAO.limiteDoOutro });
  }

  let ligacaoId: string;
  try {
    const [gravada] = await tx
      .insert(ligacoesDeAtivos)
      .values({
        orgId: sql`app.current_org()`,
        ativoA,
        ativoB,
        criadoPor: sessao.contaId,
        criadoEm: momento,
      })
      .returning({ id: ligacoesDeAtivos.id });
    if (!gravada) throw new Error('A ligação não foi gravada.');
    ligacaoId = gravada.id;
  } catch (erro) {
    if (violouUnicidade(erro, 'ligacoes_de_ativos_par_unico')) {
      throw conflito(RECUSAS_DA_LIGACAO.repetida);
    }
    throw erro;
  }
  await auditarNosDois(tx, 'ativo.ligado', quem, ligacaoId, [este, outro]);
  return {
    id: ligacaoId,
    outro: ativoLigado(outro, sessao, arvore),
    permite: { desfazer: true },
  };
}

/** Desfaz uma ligação livre deste ativo; a linha sai, e o histórico fica na auditoria dos dois. */
export async function desfazerLigacao(
  tx: Transacao,
  quem: QuemLiga,
  { esteId, ligacaoId }: { esteId: string; ligacaoId: string },
) {
  const daLigacao = and(eq(ligacoesDeAtivos.id, ligacaoId), doAtivo(esteId));
  const [ligacao] = await tx.select().from(ligacoesDeAtivos).where(daLigacao);
  if (!ligacao) throw ligacaoNaoEncontrada();
  const linhas = await travarOsDois(tx, [ligacao.ativoA, ligacao.ativoB]);
  // Outra sessão pode ter desfeito a mesma ligação enquanto esta esperava a trava.
  const [aindaLigada] = await tx
    .select({ id: ligacoesDeAtivos.id })
    .from(ligacoesDeAtivos)
    .where(daLigacao);
  const este = linhas.get(esteId);
  const outro = linhas.get(ligacao.ativoA === esteId ? ligacao.ativoB : ligacao.ativoA);
  if (!aindaLigada || !este || !outro) throw ligacaoNaoEncontrada();
  exigirEm(quem.requisicao, 'ativos.editar', este.ativo.localId, quem.arvore);
  exigirEm(quem.requisicao, 'ativos.editar', outro.ativo.localId, quem.arvore);
  await tx.delete(ligacoesDeAtivos).where(eq(ligacoesDeAtivos.id, ligacaoId));
  await auditarNosDois(tx, 'ativo.desligado', quem, ligacaoId, [este, outro]);
}

/** Quantos ativos ligados cada grupo do lado de lá traz. */
const ATIVOS_POR_GRUPO = 100;

/** Os campos do tipo ativo, ativos, pelo rótulo: cada um é um grupo dos ligados. */
function camposDeAtivo(tx: Transacao) {
  return tx
    .select({
      id: campos.id,
      rotulo: campos.rotulo,
      restrito: campos.restrito,
      configuracao: campos.configuracao,
    })
    .from(campos)
    .where(and(eq(campos.tipo, 'ativo'), eq(campos.situacao, 'ativo')))
    .orderBy(asc(campos.rotuloNormalizado));
}

/**
 * Os ativos cujo tipo usa o campo e que apontam para o alvo, pelo índice GIN dos valores; num campo
 * restrito, só os que a conta vê com os restritos, pelo local deles.
 */
function apontamPeloCampo(
  tx: Transacao,
  campo: { id: string; restrito: boolean },
  alvoId: string,
  alcanceDosRestritos: ReturnType<typeof alcance>,
): SQL | undefined {
  const condicoes = [
    sql`${ativos.valores} @> ${JSON.stringify({ [campo.id]: alvoId })}::jsonb`,
    inArray(
      ativos.tipoId,
      tx
        .select({ tipoId: camposDoTipo.tipoId })
        .from(camposDoTipo)
        .where(eq(camposDoTipo.campoId, campo.id)),
    ),
  ];
  if (campo.restrito && alcanceDosRestritos !== 'organizacao') {
    condicoes.push(
      alcanceDosRestritos && alcanceDosRestritos.size > 0
        ? inArray(ativos.localId, [...alcanceDosRestritos])
        : sql`false`,
    );
  }
  return and(...condicoes);
}

/**
 * Quantos estão ligados ao ativo, como a aba Ligados os conta: os que apontam pelos campos, no
 * alcance dos restritos, e as ligações livres.
 */
export async function quantosLigados(
  tx: Transacao,
  { sessao, arvore }: { sessao: SessaoDaRequisicao; arvore: ArvoreDeLocais },
  alvoId: string,
): Promise<number> {
  const alcanceDosRestritos = alcance(sessao.acesso, 'ativos.restritos', arvore);
  let quantos = await quantasLigacoes(tx, alvoId);
  for (const campo of await camposDeAtivo(tx)) {
    const [contagem] = await tx
      .select({ total: count() })
      .from(ativos)
      .where(apontamPeloCampo(tx, campo, alvoId, alcanceDosRestritos));
    quantos += contagem?.total ?? 0;
  }
  return quantos;
}

/**
 * O que está ligado ao ativo (design do P1d, decisão 2): para cada campo do tipo ativo, ativo, os
 * ativos que apontam para este, com o total e até 100, pelo nome. E as ligações livres, pelo nome do
 * outro. O ativo fora do acesso vem só com o aviso.
 */
export async function ligadosDoAtivo(
  tx: Transacao,
  { sessao, arvore }: { sessao: SessaoDaRequisicao; arvore: ArvoreDeLocais },
  linha: LinhaDoAtivo,
): Promise<z.infer<typeof LigadosDoAtivo>> {
  const alvoId = linha.ativo.id;
  const alcanceDosRestritos = alcance(sessao.acesso, 'ativos.restritos', arvore);

  const porCampos: z.infer<typeof LigadosDoAtivo>['porCampos'] = [];
  for (const campo of await camposDeAtivo(tx)) {
    const condicao = apontamPeloCampo(tx, campo, alvoId, alcanceDosRestritos);
    const [contagem] = await tx.select({ total: count() }).from(ativos).where(condicao);
    const total = contagem?.total ?? 0;
    if (total === 0) continue;
    const linhas = await consultarAtivos(tx)
      .where(condicao)
      .orderBy(semAcento(rotuloNoBanco), asc(ativos.id))
      .limit(ATIVOS_POR_GRUPO);
    const ladoDeLa = (campo.configuracao as ConfiguracaoDoCampo).ladoDeLa ?? null;
    porCampos.push({
      campo: { id: campo.id, rotulo: campo.rotulo, ladoDeLa },
      total,
      ativos: linhas.map((ligado) => ativoLigado(ligado, sessao, arvore)),
    });
  }

  const editar = (localId: string | null) =>
    podeEm(sessao.acesso, 'ativos.editar', localId, arvore);
  const livres = await tx.select().from(ligacoesDeAtivos).where(doAtivo(alvoId));
  const outros = new Map(
    livres.length === 0
      ? []
      : (
          await consultarAtivos(tx).where(
            inArray(
              ativos.id,
              livres.map((livre) => (livre.ativoA === alvoId ? livre.ativoB : livre.ativoA)),
            ),
          )
        ).map((outro) => [outro.ativo.id, outro]),
  );
  const comOutro = livres.flatMap((livre) => {
    const outro = outros.get(livre.ativoA === alvoId ? livre.ativoB : livre.ativoA);
    return outro
      ? [
          {
            livre,
            outro,
            rotulo: rotuloDoAtivo({
              nome: outro.ativo.nome,
              modelo: outro.modelo,
              tipo: outro.tipo,
            }),
          },
        ]
      : [];
  });
  comOutro.sort((a, b) => normalizarTexto(a.rotulo).localeCompare(normalizarTexto(b.rotulo)));

  return {
    porCampos,
    livres: comOutro.map(({ livre, outro }) => ({
      id: livre.id,
      outro: ativoLigado(outro, sessao, arvore),
      permite: { desfazer: editar(linha.ativo.localId) && editar(outro.ativo.localId) },
    })),
    permite: { ligar: editar(linha.ativo.localId) && linha.ativo.situacao === 'ativo' },
  };
}
