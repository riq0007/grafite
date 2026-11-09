// Os indicadores criados pela organização na API (spec indicadores, "Indicadores da organização" e
// "Backups do Control iD em dia"; change regras-indicadores-e-tarefas, design, decisão 3): cada um
// é a medida dele sobre os ativos do recorte. Os alertas são lidos uma vez, no alcance de quem vê
// os alertas, e filtrados pelos ativos do recorte de cada indicador; a medida dos backups lê os
// controles com o backup ligado e o último backup bom de cada um. O texto de cada linha da lista
// sai daqui, e a data, a tela escreve no fuso da conta.
import {
  ativos,
  backupsDoControlId,
  indicadoresCriados,
  locais,
  modelos,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type Acesso,
  type AlertaParaOsIndicadores,
  type ArvoreDeLocais,
  alcance,
  definicaoDaMedida,
  type ItemDosBackups,
  indicadorDaDisponibilidade,
  indicadorDoCritico,
  indicadorDosBackups,
  indicadorDoToner,
  indicadorQueVolta,
  MENSAGENS_DO_RECORTE,
  type MedidaDoIndicadorCriado,
  periodoDosIndicadores,
  type RecorteDoIndicador,
  type ResultadoDoIndicador,
  rotuloDoAtivo,
  type SituacaoDoIndicador,
  textoDaPorcentagem,
  textoDoTempo,
} from '@grafite/domain';
import { and, asc, eq, inArray, max, type SQL, sql } from 'drizzle-orm';
import { dadosInvalidos } from '../problemas.ts';
import {
  type AlvoDoIndicador,
  alertasDosIndicadores,
  temRegraDeOfflineAtiva,
} from './indicadores.ts';

export type LinhaDoIndicadorCriado = typeof indicadoresCriados.$inferSelect;

/** Uma linha da lista do indicador criado: o alvo, o texto e, nos backups, o momento. */
export interface ItemDoIndicadorCriado {
  alvo: AlvoDoIndicador;
  detalhe: string;
  /** ISO 8601: o último backup bom, que a tela escreve no fuso da conta. */
  momento: string | null;
}

export interface IndicadorCriadoCalculado {
  id: string;
  nome: string;
  medida: MedidaDoIndicadorCriado;
  recorte: {
    tipo: { id: string; nome: string } | null;
    modelo: { id: string; nome: string } | null;
    local: { id: string; nome: string } | null;
  };
  meta: number;
  metaDeFabrica: number;
  valor: number | null;
  anterior: number | null;
  base: number;
  situacao: SituacaoDoIndicador;
  itens: ItemDoIndicadorCriado[];
  mais: number;
}

/** O recorte guardado na linha. */
export const recorteDaLinha = (linha: LinhaDoIndicadorCriado): RecorteDoIndicador => ({
  tipoId: linha.tipoId,
  modeloId: linha.modeloId,
  localId: linha.localId,
});

/** Confere no banco que o tipo, o modelo e o local do recorte existem e estão ativos. */
export async function conferirRecorteNoBanco(
  tx: Transacao,
  recorte: RecorteDoIndicador,
): Promise<void> {
  const erros: Record<string, string> = {};
  const confere = async (
    campo: 'tipo' | 'modelo' | 'local',
    id: string | null,
    tabela: typeof tiposDeAtivo | typeof modelos | typeof locais,
  ) => {
    if (id === null) return;
    const [achado] = await tx
      .select({ id: tabela.id })
      .from(tabela)
      .where(and(eq(tabela.id, id), eq(tabela.situacao, 'ativo')));
    if (!achado) erros[campo] = MENSAGENS_DO_RECORTE[campo];
  };
  await confere('tipo', recorte.tipoId, tiposDeAtivo);
  await confere('modelo', recorte.modeloId, modelos);
  await confere('local', recorte.localId, locais);
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);
}

/** Os ativos do recorte, ou `null` quando o indicador não tem recorte e vale para todos. */
async function ativosDoRecorte(
  tx: Transacao,
  recorte: RecorteDoIndicador,
  arvore: ArvoreDeLocais,
): Promise<Set<string> | null> {
  const partes: SQL[] = [];
  if (recorte.tipoId) partes.push(eq(ativos.tipoId, recorte.tipoId));
  if (recorte.modeloId) partes.push(eq(ativos.modeloId, recorte.modeloId));
  if (recorte.localId) {
    const ramo = [...arvore.ramo(recorte.localId)];
    partes.push(ramo.length > 0 ? inArray(ativos.localId, ramo) : sql`false`);
  }
  if (partes.length === 0) return null;
  const linhas = await tx
    .select({ id: ativos.id })
    .from(ativos)
    .where(and(...partes));
  return new Set(linhas.map((linha) => linha.id));
}

/** Os controles ativos com o backup ligado no tipo, no alcance e no recorte, com o último backup bom. */
async function controlesDosBackups(
  tx: Transacao,
  {
    doRecorte,
    doVer,
    arvore,
  }: {
    doRecorte: Set<string> | null;
    doVer: ReturnType<typeof alcance>;
    arvore: ArvoreDeLocais;
  },
) {
  if (doVer === null) return [];
  const partes: SQL[] = [
    eq(ativos.situacao, 'ativo'),
    sql`'controlid.backup'::text = any(${tiposDeAtivo.capacidades})`,
  ];
  if (doVer !== 'organizacao') {
    partes.push(doVer.size > 0 ? inArray(ativos.localId, [...doVer]) : sql`false`);
  }
  const controles = (
    await tx
      .select({
        id: ativos.id,
        nome: ativos.nome,
        localId: ativos.localId,
        tipo: tiposDeAtivo.nome,
        fabricante: modelos.fabricante,
        modelo: modelos.nome,
      })
      .from(ativos)
      .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
      .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
      .where(and(...partes))
  ).filter((controle) => doRecorte === null || doRecorte.has(controle.id));
  if (controles.length === 0) return [];
  const bons = new Map(
    (
      await tx
        .select({
          ativoId: backupsDoControlId.ativoId,
          ultimo: max(backupsDoControlId.concluidoEm),
        })
        .from(backupsDoControlId)
        .where(
          and(
            inArray(
              backupsDoControlId.ativoId,
              controles.map((controle) => controle.id),
            ),
            inArray(backupsDoControlId.situacao, ['sucesso', 'parcial']),
          ),
        )
        .groupBy(backupsDoControlId.ativoId)
    ).map((linha) => [linha.ativoId, linha.ultimo]),
  );
  return controles.map((controle) => ({
    alvo: {
      tipo: 'ativo',
      id: controle.id,
      nome: rotuloDoAtivo({
        nome: controle.nome,
        modelo:
          controle.fabricante !== null && controle.modelo !== null
            ? { fabricante: controle.fabricante, nome: controle.modelo }
            : null,
        tipo: { nome: controle.tipo },
      }),
      local: controle.localId ? arvore.caminho(controle.localId) : null,
    } satisfies AlvoDoIndicador,
    ultimoBom: bons.get(controle.id) ?? null,
  }));
}

/** O nome do tipo, do modelo e do local de cada recorte, pelo id. */
async function nomesDosRecortes(tx: Transacao, linhas: readonly LinhaDoIndicadorCriado[]) {
  const ids = (campo: 'tipoId' | 'modeloId' | 'localId') => [
    ...new Set(linhas.flatMap((linha) => (linha[campo] ? [linha[campo]] : []))),
  ];
  const nomes = new Map<string, string>();
  const doTipo = ids('tipoId');
  if (doTipo.length > 0) {
    for (const tipo of await tx
      .select({ id: tiposDeAtivo.id, nome: tiposDeAtivo.nome })
      .from(tiposDeAtivo)
      .where(inArray(tiposDeAtivo.id, doTipo))) {
      nomes.set(tipo.id, tipo.nome);
    }
  }
  const doModelo = ids('modeloId');
  if (doModelo.length > 0) {
    for (const modelo of await tx
      .select({ id: modelos.id, fabricante: modelos.fabricante, nome: modelos.nome })
      .from(modelos)
      .where(inArray(modelos.id, doModelo))) {
      nomes.set(modelo.id, `${modelo.fabricante} ${modelo.nome}`);
    }
  }
  return nomes;
}

const plural = (quantidade: number, singular: string, plural: string) =>
  `${quantidade} ${quantidade === 1 ? singular : plural}`;

type Alertas = readonly AlertaParaOsIndicadores<AlvoDoIndicador>[];

/** A medida de um indicador criado, com a lista em texto. */
function calcularMedida(
  medida: Exclude<MedidaDoIndicadorCriado, 'backups-do-control-id'>,
  alertas: Alertas,
  { agora, meta, regraDeOfflineAtiva }: { agora: Date; meta: number; regraDeOfflineAtiva: boolean },
) {
  const periodo = periodoDosIndicadores(agora);
  switch (medida) {
    case 'toner':
    case 'critico': {
      const resultado =
        medida === 'toner'
          ? indicadorDoToner(alertas, periodo, meta)
          : indicadorDoCritico(alertas, periodo, meta);
      return {
        ...resultado,
        itens: resultado.itens.map((item) => ({
          alvo: item.alvo,
          detalhe: `${item.texto}: ${
            item.esperando
              ? `esperando há ${textoDoTempo(item.minutos)}`
              : textoDoTempo(item.minutos)
          }`,
          momento: null,
        })),
      };
    }
    case 'disponibilidade': {
      const resultado = indicadorDaDisponibilidade(alertas, periodo, meta, regraDeOfflineAtiva);
      return {
        ...resultado,
        itens: resultado.itens.map((item) => ({
          alvo: item.alvo,
          detalhe: `${textoDaPorcentagem(item.porMil)} no ar, ${textoDoTempo(item.minutosForaDoAr)} sem responder`,
          momento: null,
        })),
      };
    }
    case 'que-voltam': {
      const resultado = indicadorQueVolta(alertas, periodo, meta);
      return {
        ...resultado,
        itens: resultado.itens.map((item) => ({
          alvo: item.alvo,
          detalhe: `${item.regra.nome}: ${plural(item.vezes, 'vez', 'vezes')}`,
          momento: item.ultimaEm.toISOString(),
        })),
      };
    }
  }
}

/**
 * Os indicadores criados da organização, em ordem de nome, calculados com os alertas que a conta vê
 * e os ativos do recorte de cada um.
 */
export async function lerIndicadoresCriados(
  tx: Transacao,
  { agora, arvore, acesso }: { agora: Date; arvore: ArvoreDeLocais; acesso: Acesso },
): Promise<IndicadorCriadoCalculado[]> {
  const linhas = await tx
    .select()
    .from(indicadoresCriados)
    .orderBy(asc(indicadoresCriados.nomeNormalizado));
  if (linhas.length === 0) return [];
  const doVer = alcance(acesso, 'alertas.ver', arvore);
  const comAlertas = linhas.some((linha) => linha.medida !== 'backups-do-control-id');
  const alertas = comAlertas ? await alertasDosIndicadores(tx, { agora, arvore, doVer }) : [];
  const regraDeOfflineAtiva = comAlertas ? await temRegraDeOfflineAtiva(tx) : false;
  const nomes = await nomesDosRecortes(tx, linhas);
  const calculados: IndicadorCriadoCalculado[] = [];
  for (const linha of linhas) {
    const doRecorte = await ativosDoRecorte(tx, recorteDaLinha(linha), arvore);
    const resultado =
      linha.medida === 'backups-do-control-id'
        ? backupsEmTexto(
            indicadorDosBackups(
              await controlesDosBackups(tx, { doRecorte, doVer, arvore }),
              agora,
              linha.meta,
            ),
          )
        : calcularMedida(
            linha.medida,
            doRecorte === null
              ? alertas
              : alertas.filter(
                  (alerta) => alerta.alvo.tipo === 'ativo' && doRecorte.has(alerta.alvo.id),
                ),
            { agora, meta: linha.meta, regraDeOfflineAtiva },
          );
    calculados.push(comoCalculado(linha, resultado, nomes, arvore));
  }
  return calculados;
}

/** A lista dos backups em texto, com o momento do último backup bom para a tela escrever. */
const backupsEmTexto = (resultado: ResultadoDoIndicador<ItemDosBackups<AlvoDoIndicador>>) => ({
  ...resultado,
  itens: resultado.itens.map((item) => ({
    alvo: item.alvo,
    detalhe: item.ultimoBom ? 'Último backup bom' : 'Nenhum backup',
    momento: item.ultimoBom?.toISOString() ?? null,
  })),
});

function comoCalculado(
  linha: LinhaDoIndicadorCriado,
  resultado: Omit<
    IndicadorCriadoCalculado,
    'id' | 'nome' | 'medida' | 'recorte' | 'meta' | 'metaDeFabrica'
  >,
  nomes: ReadonlyMap<string, string>,
  arvore: ArvoreDeLocais,
): IndicadorCriadoCalculado {
  return {
    id: linha.id,
    nome: linha.nome,
    medida: linha.medida,
    recorte: {
      tipo: linha.tipoId ? { id: linha.tipoId, nome: nomes.get(linha.tipoId) ?? '' } : null,
      modelo: linha.modeloId ? { id: linha.modeloId, nome: nomes.get(linha.modeloId) ?? '' } : null,
      local: linha.localId ? { id: linha.localId, nome: arvore.caminho(linha.localId) } : null,
    },
    meta: linha.meta,
    metaDeFabrica: definicaoDaMedida(linha.medida).metaDeFabrica,
    valor: resultado.valor,
    anterior: resultado.anterior,
    base: resultado.base,
    situacao: resultado.situacao,
    itens: resultado.itens,
    mais: resultado.mais,
  };
}
