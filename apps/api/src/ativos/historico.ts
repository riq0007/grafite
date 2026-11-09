// O histórico do ativo (spec cadastro-de-ativos, "Histórico do ativo"; design do P1d, decisão 6):
// os registros da auditoria do ativo, do mais novo para o mais antigo, pelo índice do alvo, para quem
// vê o ativo, sem precisar de `auditoria.ver`. As mudanças vêm das visões de antes e de depois que a
// gravação guardou, pelo domínio. Sem `ativos.restritos` no local do ativo, a mudança de um campo
// restrito sai do registro, pelos rótulos que o registro guarda e, nos registros de antes do P1d,
// pelos rótulos restritos de hoje e pelos antigos deles; a edição que fica sem nada sai da página, e
// o cursor continua.
import { ativos, auditoria, campos, contas, pessoas, type Transacao } from '@grafite/db';
import {
  type ArvoreDeLocais,
  type MudancasDoAtivo,
  mudancasDoAtivo,
  podeEm,
  rotuloDaAcao,
  rotuloDoAtivo,
  type VisaoDoAtivoNaAuditoria,
} from '@grafite/domain';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import { decodificarCursor, pagina } from '../paginacao.ts';
import type { HistoricoDoAtivo } from './esquemas.ts';
import { ATIVO_FORA_DO_ACESSO, consultarAtivos, type LinhaDoAtivo } from './leitura.ts';

/** As ações que o histórico do ativo mostra. */
const ACOES_DO_HISTORICO = [
  'ativo.criado',
  'ativo.alterado',
  'ativo.inativado',
  'ativo.reativado',
  'imagem-do-ativo.trocada',
  'imagem-do-ativo.removida',
  'ativo.ligado',
  'ativo.desligado',
] as const;

/** As ações que guardam as visões de antes e de depois do ativo. */
const COM_VISOES = new Set<string>([
  'ativo.criado',
  'ativo.alterado',
  'ativo.inativado',
  'ativo.reativado',
]);

/** A chave da ordem: o momento com a precisão do banco e o id, que desempata. */
const ChaveDoRegistro = z.tuple([z.string(), z.uuid()]);

const SEM_MUDANCAS: MudancasDoAtivo = { mudancas: [], travas: { ligadas: [], desligadas: [] } };

/** Os rótulos dos campos restritos de hoje e os antigos deles, da auditoria do catálogo. */
async function rotulosRestritos(tx: Transacao): Promise<Set<string>> {
  const restritos = await tx
    .select({ id: campos.id, rotulo: campos.rotulo })
    .from(campos)
    .where(eq(campos.restrito, true));
  const rotulos = new Set(restritos.map((campo) => campo.rotulo));
  if (restritos.length === 0) return rotulos;
  const doCatalogo = await tx
    .select({ antes: auditoria.antes, depois: auditoria.depois })
    .from(auditoria)
    .where(
      and(
        eq(auditoria.alvoTipo, 'campo'),
        inArray(
          auditoria.alvoId,
          restritos.map((campo) => campo.id),
        ),
      ),
    );
  for (const { antes, depois } of doCatalogo) {
    for (const visao of [antes, depois]) {
      const rotulo = (visao as { rotulo?: unknown } | null)?.rotulo;
      if (typeof rotulo === 'string') rotulos.add(rotulo);
    }
  }
  return rotulos;
}

/** O outro ativo de cada ligação da página, pelo nome atual, ou fora do acesso, sem o id. */
async function outrosDasLigacoes(
  tx: Transacao,
  ids: readonly string[],
  { sessao, arvore }: { sessao: SessaoDaRequisicao; arvore: ArvoreDeLocais },
): Promise<Map<string, { id: string | null; rotulo: string }>> {
  if (ids.length === 0) return new Map();
  const linhas = await consultarAtivos(tx).where(inArray(ativos.id, [...new Set(ids)]));
  return new Map(
    linhas.map((linha) => [
      linha.ativo.id,
      podeEm(sessao.acesso, 'ativos.ver', linha.ativo.localId, arvore)
        ? {
            id: linha.ativo.id,
            rotulo: rotuloDoAtivo({
              nome: linha.ativo.nome,
              modelo: linha.modelo,
              tipo: linha.tipo,
            }),
          }
        : { id: null, rotulo: ATIVO_FORA_DO_ACESSO },
    ]),
  );
}

const idDoOutro = (dados: unknown) => {
  const id = (dados as { outro?: { id?: unknown } } | null)?.outro?.id;
  return typeof id === 'string' ? id : null;
};

/** Uma página do histórico do ativo, com as mudanças que a conta pode ver. */
export async function historicoDoAtivo(
  tx: Transacao,
  { sessao, arvore }: { sessao: SessaoDaRequisicao; arvore: ArvoreDeLocais },
  linha: LinhaDoAtivo,
  { cursor, limite }: { cursor?: string; limite: number },
): Promise<z.infer<typeof HistoricoDoAtivo>> {
  const verRestritos = podeEm(sessao.acesso, 'ativos.restritos', linha.ativo.localId, arvore);
  const restritos = verRestritos ? new Set<string>() : await rotulosRestritos(tx);
  const depoisDe = cursor ? decodificarCursor(cursor, ChaveDoRegistro) : null;
  const linhas = await tx
    .select({
      id: auditoria.id,
      momento: auditoria.momento,
      momentoExato: sql<string>`to_char(${auditoria.momento} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      acao: auditoria.acao,
      atorTipo: auditoria.atorTipo,
      atorDescricao: auditoria.atorDescricao,
      atorNome: pessoas.nome,
      antes: auditoria.antes,
      depois: auditoria.depois,
      dados: auditoria.dados,
    })
    .from(auditoria)
    .leftJoin(contas, and(eq(contas.orgId, auditoria.orgId), eq(contas.id, auditoria.atorContaId)))
    .leftJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(
      and(
        eq(auditoria.alvoTipo, 'ativo'),
        eq(auditoria.alvoId, linha.ativo.id),
        inArray(auditoria.acao, [...ACOES_DO_HISTORICO]),
        depoisDe
          ? sql`(${auditoria.momento}, ${auditoria.id}) < (${depoisDe[0]}::timestamptz, ${depoisDe[1]}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(auditoria.momento), desc(auditoria.id))
    .limit(limite + 1);
  // O cursor sai da última linha lida, e não da última mostrada: a página pode vir menor.
  const { linhas: daPagina, proximo } = pagina(linhas, limite, (registro) => [
    registro.momentoExato,
    registro.id,
  ]);
  const outros = await outrosDasLigacoes(
    tx,
    daPagina.flatMap((registro) => idDoOutro(registro.dados) ?? []),
    { sessao, arvore },
  );

  const itens = daPagina.flatMap((registro) => {
    const { mudancas, travas } = COM_VISOES.has(registro.acao)
      ? mudancasDoAtivo(
          registro.antes as VisaoDoAtivoNaAuditoria | null,
          registro.depois as VisaoDoAtivoNaAuditoria | null,
          { restritos, verRestritos },
        )
      : SEM_MUDANCAS;
    const vazia =
      mudancas.length === 0 && travas.ligadas.length === 0 && travas.desligadas.length === 0;
    if (registro.acao === 'ativo.alterado' && vazia) return [];
    const outroId = idDoOutro(registro.dados);
    return [
      {
        id: registro.id,
        momento: registro.momento.toISOString(),
        acao: registro.acao,
        rotulo: rotuloDaAcao(registro.acao),
        quem:
          registro.atorTipo === 'conta'
            ? (registro.atorNome ?? '')
            : (registro.atorDescricao ?? 'Sem identificação'),
        mudancas,
        travas,
        outro: outroId ? (outros.get(outroId) ?? { id: null, rotulo: ATIVO_FORA_DO_ACESSO }) : null,
      },
    ];
  });
  return { itens, proximo };
}
