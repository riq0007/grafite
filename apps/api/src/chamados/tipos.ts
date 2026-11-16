// O tipo de chamado como a API o lê (spec tipos-de-chamado, "Tipo de chamado"; change
// chamados-da-ti, design, decisão 18): o formato da lista e das gravações, com quem atende por
// padrão, o tipo de ativo do equipamento, quantos campos tem o formulário, os abertos e os abertos
// nos últimos 365 dias de cada tipo; e o que a auditoria guarda dele. Os abertos contam os chamados
// de todos os locais: quem configura os tipos o faz na organização, e a contagem não mostra nenhum
// chamado.
import {
  chamados,
  contas,
  pessoas,
  type Transacao,
  tiposDeAtivo,
  tiposDeChamado,
} from '@grafite/db';
import {
  ICONES_DO_TIPO_DE_CHAMADO,
  MENSAGENS_DO_TIPO_DE_CHAMADO,
  MODOS_DO_PRAZO,
  SEM_NINGUEM,
  SITUACOES_DO_TIPO_DE_CHAMADO,
  SOLICITACOES_DO_TIPO_DE_CHAMADO,
  UNIDADES_DO_PRAZO,
} from '@grafite/domain';
import { and, asc, eq, gte, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { naoEncontrado } from '../problemas.ts';

/** O último ano da contagem: os 365 dias antes de agora. */
const UM_ANO_MS = 365 * 24 * 60 * 60 * 1000;

export const ValorDoPrazo = z.object({ valor: z.number(), unidade: z.enum(UNIDADES_DO_PRAZO) });

const Referencia = z.object({ id: z.uuid(), nome: z.string() });

export const TipoDeChamado = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    icone: z.enum(ICONES_DO_TIPO_DE_CHAMADO),
    /** A frase para o colaborador; só o Rascunho fica sem ela. */
    frase: z.string().nullable(),
    situacao: z.enum(SITUACOES_DO_TIPO_DE_CHAMADO),
    ordem: z.number(),
    prazo: z.object({
      modo: z.enum(MODOS_DO_PRAZO),
      resposta: ValorDoPrazo,
      resolucao: ValorDoPrazo,
    }),
    /** A conta de quem atende por padrão, com o nome da pessoa; nulo, o chamado cai na triagem. */
    atendePorPadrao: Referencia.nullable(),
    semNinguem: z.enum(SEM_NINGUEM),
    podeVirarOs: z.boolean(),
    geraSolicitacao: z.enum(SOLICITACOES_DO_TIPO_DE_CHAMADO),
    /** O tipo de ativo da solicitação de Equipamento, só com ela. */
    tipoDeAtivoDoEquipamento: Referencia.nullable(),
    pedeOAtivo: z.boolean(),
    apareceParaOColaborador: z.boolean(),
    soATiAbre: z.boolean(),
    /** Quantos campos o formulário tem. */
    campos: z.number(),
    /** O tipo de onde o Rascunho foi duplicado, que a lista marca "copiado daqui". */
    duplicadoDe: z.uuid().nullable(),
    /** Os chamados do tipo em aberto, de todos os locais. */
    abertos: z.number(),
    /** Os chamados do tipo abertos nos últimos 365 dias, também os já resolvidos. */
    noUltimoAno: z.number(),
  })
  .meta({ id: 'TipoDeChamado' });

export type TipoDeChamadoLido = z.infer<typeof TipoDeChamado>;

/** A ordem dos tipos, a mesma na lista, na trava da ordem e na auditoria. */
export const naOrdem = [asc(tiposDeChamado.ordem), asc(tiposDeChamado.nomeNormalizado)];

/** Os tipos na ordem, com as contagens de agora; com o id, só aquele. */
export async function lerTiposDeChamado(
  tx: Transacao,
  agora: Date,
  id?: string,
): Promise<TipoDeChamadoLido[]> {
  const desde = new Date(agora.getTime() - UM_ANO_MS);
  const contagens = await tx
    .select({
      tipoId: chamados.tipoId,
      abertos: sql<number>`count(*) filter (where ${ne(chamados.situacao, 'resolvido')})`.mapWith(
        Number,
      ),
      noUltimoAno: sql<number>`count(*) filter (where ${gte(chamados.abertoEm, desde)})`.mapWith(
        Number,
      ),
    })
    .from(chamados)
    .where(
      and(
        id ? eq(chamados.tipoId, id) : undefined,
        or(ne(chamados.situacao, 'resolvido'), gte(chamados.abertoEm, desde)),
      ),
    )
    .groupBy(chamados.tipoId);
  const doTipo = new Map(contagens.map(({ tipoId, ...contagem }) => [tipoId, contagem]));

  const linhas = await tx
    .select({
      tipo: tiposDeChamado,
      // A API grava sempre o formulário conferido, com os campos; o `coalesce` só guarda a resposta.
      campos:
        sql<number>`coalesce(jsonb_array_length(${tiposDeChamado.formulario} -> 'campos'), 0)`.mapWith(
          Number,
        ),
      quemAtende: pessoas.nome,
      tipoDeAtivo: tiposDeAtivo.nome,
    })
    .from(tiposDeChamado)
    .leftJoin(contas, eq(contas.id, tiposDeChamado.atendePorPadrao))
    .leftJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .leftJoin(tiposDeAtivo, eq(tiposDeAtivo.id, tiposDeChamado.tipoDeAtivoDoEquipamento))
    .where(id ? eq(tiposDeChamado.id, id) : undefined)
    .orderBy(...naOrdem);
  return linhas.map(({ tipo, campos, quemAtende, tipoDeAtivo }) => ({
    id: tipo.id,
    nome: tipo.nome,
    icone: tipo.icone,
    frase: tipo.frase,
    situacao: tipo.situacao,
    ordem: tipo.ordem,
    prazo: {
      modo: tipo.modo,
      resposta: { valor: tipo.respostaValor, unidade: tipo.respostaUnidade },
      resolucao: { valor: tipo.resolucaoValor, unidade: tipo.resolucaoUnidade },
    },
    atendePorPadrao:
      tipo.atendePorPadrao && quemAtende !== null
        ? { id: tipo.atendePorPadrao, nome: quemAtende }
        : null,
    semNinguem: tipo.semNinguem,
    podeVirarOs: tipo.podeVirarOs,
    geraSolicitacao: tipo.geraSolicitacao,
    tipoDeAtivoDoEquipamento:
      tipo.tipoDeAtivoDoEquipamento && tipoDeAtivo !== null
        ? { id: tipo.tipoDeAtivoDoEquipamento, nome: tipoDeAtivo }
        : null,
    pedeOAtivo: tipo.pedeOAtivo,
    apareceParaOColaborador: tipo.apareceParaOColaborador,
    soATiAbre: tipo.soATiAbre,
    campos,
    duplicadoDe: tipo.duplicadoDe,
    abertos: doTipo.get(tipo.id)?.abertos ?? 0,
    noUltimoAno: doTipo.get(tipo.id)?.noUltimoAno ?? 0,
  }));
}

/** Um tipo só, como a lista o mostra; fora da organização, o 404 com a frase do domínio. */
export async function lerTipoDeChamado(
  tx: Transacao,
  agora: Date,
  id: string,
): Promise<TipoDeChamadoLido> {
  const [tipo] = await lerTiposDeChamado(tx, agora, id);
  if (!tipo) throw naoEncontrado(MENSAGENS_DO_TIPO_DE_CHAMADO.naoEncontrado);
  return tipo;
}

/**
 * O que a auditoria guarda do tipo: os nomes de quem atende por padrão e do tipo de ativo do
 * equipamento no lugar dos ids, sem o formulário, que tem a ação própria, e sem as contagens.
 */
export function visaoDoTipoDeChamado(tipo: TipoDeChamadoLido) {
  return {
    nome: tipo.nome,
    icone: tipo.icone,
    frase: tipo.frase,
    situacao: tipo.situacao,
    ordem: tipo.ordem,
    prazo: tipo.prazo,
    atendePorPadrao: tipo.atendePorPadrao?.nome ?? null,
    semNinguem: tipo.semNinguem,
    podeVirarOs: tipo.podeVirarOs,
    geraSolicitacao: tipo.geraSolicitacao,
    tipoDeAtivoDoEquipamento: tipo.tipoDeAtivoDoEquipamento?.nome ?? null,
    pedeOAtivo: tipo.pedeOAtivo,
    apareceParaOColaborador: tipo.apareceParaOColaborador,
    soATiAbre: tipo.soATiAbre,
  };
}
