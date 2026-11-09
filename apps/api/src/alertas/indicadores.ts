// Os indicadores dos alertas na API (spec indicadores; change p3d-indicadores, design, decisões 1, 3
// e 6): os alertas que tocam os últimos 60 dias, pelo alcance de `alertas.ver` da conta, ou da
// organização inteira na avaliação diária, com o alvo e o local e quem reconheceu pelo nome atual;
// as metas da organização, com as de fábrica no lugar das que ninguém escolheu; e o cálculo do
// domínio, o mesmo da tela e da notificação.
import {
  alertas,
  ativos,
  coletores,
  contas,
  indicadoresDaOrganizacao,
  modelos,
  pessoas,
  regrasDeAlerta,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type Acesso,
  type AlertaParaOsIndicadores,
  type ArvoreDeLocais,
  alcance,
  calcularIndicadores,
  DEFINICOES_DOS_INDICADORES,
  INDICADORES,
  type Indicador,
  type IndicadoresCalculados,
  periodoDosIndicadores,
  rotuloDoAtivo,
} from '@grafite/domain';
import { and, eq, gte, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';

/** O ativo ou o coletor de um alerta, nas listas dos indicadores. */
export type AlvoDoIndicador =
  | { tipo: 'ativo'; id: string; nome: string; local: string | null }
  | { tipo: 'coletor'; id: string; nome: string };

/** As metas da organização, com a de fábrica onde ninguém escolheu outra. */
export async function metasDaOrganizacao(tx: Transacao): Promise<Record<Indicador, number>> {
  const escolhidas = await tx
    .select({ indicador: indicadoresDaOrganizacao.indicador, meta: indicadoresDaOrganizacao.meta })
    .from(indicadoresDaOrganizacao);
  const porIndicador = new Map<string, number | null>(
    escolhidas.map(({ indicador, meta }) => [indicador, meta]),
  );
  return Object.fromEntries(
    INDICADORES.map((indicador) => [
      indicador,
      porIndicador.get(indicador) ?? DEFINICOES_DOS_INDICADORES[indicador].metaDeFabrica,
    ]),
  ) as Record<Indicador, number>;
}

/** Se a organização tem uma regra de ativo offline ativa, sem a qual a disponibilidade não mede. */
export async function temRegraDeOfflineAtiva(tx: Transacao): Promise<boolean> {
  const [regra] = await tx
    .select({ id: regrasDeAlerta.id })
    .from(regrasDeAlerta)
    .where(and(eq(regrasDeAlerta.condicao, 'rede.offline'), eq(regrasDeAlerta.situacao, 'ativa')))
    .limit(1);
  return regra !== undefined;
}

/** Os nomes atuais das pessoas das contas dadas. */
async function nomesDasContas(tx: Transacao, ids: readonly string[]) {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map<string, string>();
  const linhas = await tx
    .select({ id: contas.id, nome: pessoas.nome })
    .from(contas)
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .where(inArray(contas.id, unicos));
  return new Map(linhas.map((linha) => [linha.id, linha.nome]));
}

/**
 * Os alertas que abriram e tocam os últimos 60 dias: os que abriram neles, os que terminaram neles e
 * os ainda abertos, fora os que abriram no silêncio, no alcance de quem vê os alertas. O alerta do
 * coletor e o do ativo sem local só entram pela organização inteira, como na lista.
 */
export async function alertasDosIndicadores(
  tx: Transacao,
  {
    agora,
    arvore,
    doVer,
  }: { agora: Date; arvore: ArvoreDeLocais; doVer: ReturnType<typeof alcance> },
): Promise<AlertaParaOsIndicadores<AlvoDoIndicador>[]> {
  const { inicioDoAnterior } = periodoDosIndicadores(agora);
  const condicoes: SQL[] = [
    isNotNull(alertas.abertoEm),
    eq(alertas.abertoNoSilencio, false),
    or(
      gte(alertas.abertoEm, inicioDoAnterior),
      isNull(alertas.resolvidoEm),
      gte(alertas.resolvidoEm, inicioDoAnterior),
    ) as SQL,
  ];
  if (doVer !== 'organizacao') {
    condicoes.push(
      doVer && doVer.size > 0
        ? (and(isNotNull(alertas.ativoId), inArray(ativos.localId, [...doVer])) as SQL)
        : sql`false`,
    );
  }
  const linhas = await tx
    .select({
      id: alertas.id,
      regraId: alertas.regraId,
      regraNome: regrasDeAlerta.nome,
      condicao: regrasDeAlerta.condicao,
      severidade: alertas.severidade,
      texto: alertas.texto,
      observadoEm: alertas.observadoEm,
      abertoEm: alertas.abertoEm,
      reconhecidoEm: alertas.reconhecidoEm,
      reconhecidoPor: alertas.reconhecidoPor,
      resolvidoEm: alertas.resolvidoEm,
      comoTerminou: alertas.comoTerminou,
      ativoId: alertas.ativoId,
      ativoNome: ativos.nome,
      localId: ativos.localId,
      tipoNome: tiposDeAtivo.nome,
      fabricante: modelos.fabricante,
      modeloNome: modelos.nome,
      coletorId: alertas.coletorId,
      coletorNome: coletores.nome,
    })
    .from(alertas)
    .innerJoin(regrasDeAlerta, eq(regrasDeAlerta.id, alertas.regraId))
    .leftJoin(ativos, eq(ativos.id, alertas.ativoId))
    .leftJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .leftJoin(coletores, eq(coletores.id, alertas.coletorId))
    .where(and(...condicoes));
  const nomes = await nomesDasContas(
    tx,
    linhas.flatMap((linha) => (linha.reconhecidoPor ? [linha.reconhecidoPor] : [])),
  );
  return linhas.map((linha) => {
    const alvo: AlvoDoIndicador =
      linha.ativoId !== null
        ? {
            tipo: 'ativo',
            id: linha.ativoId,
            nome: rotuloDoAtivo({
              nome: linha.ativoNome,
              modelo:
                linha.fabricante !== null && linha.modeloNome !== null
                  ? { fabricante: linha.fabricante, nome: linha.modeloNome }
                  : null,
              tipo: { nome: linha.tipoNome ?? '' },
            }),
            local: linha.localId ? arvore.caminho(linha.localId) : null,
          }
        : { tipo: 'coletor', id: linha.coletorId ?? '', nome: linha.coletorNome ?? '' };
    return {
      id: linha.id,
      condicao: linha.condicao,
      regra: { id: linha.regraId, nome: linha.regraNome },
      severidade: linha.severidade,
      texto: linha.texto,
      alvoChave: `${alvo.tipo}:${alvo.id}`,
      alvo,
      observadoEm: linha.observadoEm,
      abertoEm: linha.abertoEm as Date,
      reconhecidoEm: linha.reconhecidoEm,
      reconhecidoPor: linha.reconhecidoPor ? (nomes.get(linha.reconhecidoPor) ?? null) : null,
      resolvidoEm: linha.resolvidoEm,
      comoTerminou: linha.comoTerminou,
      abertoNoSilencio: false,
    };
  });
}

export interface IndicadoresDaOrganizacao {
  metas: Record<Indicador, number>;
  calculados: IndicadoresCalculados<AlvoDoIndicador>;
}

/**
 * Os indicadores no momento dado, com os alertas que a conta vê, ou, sem a conta, como na avaliação
 * diária, com os da organização inteira.
 */
export async function lerIndicadores(
  tx: Transacao,
  { agora, arvore, acesso }: { agora: Date; arvore: ArvoreDeLocais; acesso?: Acesso },
): Promise<IndicadoresDaOrganizacao> {
  const doVer = acesso ? alcance(acesso, 'alertas.ver', arvore) : 'organizacao';
  const metas = await metasDaOrganizacao(tx);
  const calculados = calcularIndicadores(
    await alertasDosIndicadores(tx, { agora, arvore, doVer }),
    { agora, metas, regraDeOfflineAtiva: await temRegraDeOfflineAtiva(tx) },
  );
  return { metas, calculados };
}
