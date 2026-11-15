// O Deploy do agente do GLPI (spec distribuicao-de-software, "Deploy pelo agente do GLPI" e
// "Quando instalar"; changes distribuicao-de-software e software-por-pacote): os jobs das máquinas
// que aguardam o agente e podem seguir, com o arquivo em partes no espelho; os passos que ele manda,
// que viram a situação, a etapa, o código de saída e o log da máquina; e o `expiration` que traz o
// agente de volta na hora do pedido que ainda não pode seguir (design, decisões 6 a 8).
import {
  agentes,
  distribuicoes,
  maquinasDasDistribuicoes,
  pacotesDeSoftware,
  partesDosPacotes,
  type Transacao,
} from '@grafite/db';
import {
  aplicarPassoDoAgente,
  codigoDaMensagem,
  EXPIRATION_DE_FABRICA,
  expirationDoContato,
  podeSeguir,
} from '@grafite/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';

/** Quantas linhas da saída do comando o agente manda no passo da execução. */
const LINHAS_DA_SAIDA = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ArquivoDoDeploy {
  name: string;
  multiparts: string[];
  mirrors: string[];
  p2p: 0;
  'p2p-retention-duration': 0;
  uncompress: 0;
}

export interface JobDoDeploy {
  uuid: string;
  checks: [];
  actions: {
    cmd: {
      exec: string;
      retChecks: { type: 'okCode'; values: number[] }[];
      logLineLimit: number;
    };
  }[];
  associatedFiles: string[];
}

/**
 * Os jobs das máquinas que aguardam o agente, com o pedido que pode seguir no momento, que passam a
 * "em andamento". Sem nenhum, `{}`, que o agente lê como "nada a fazer". O job sem arquivo vai com
 * a lista de arquivos vazia.
 */
export async function jobsDoAgente(
  tx: Transacao,
  { deviceid, espelho, momento }: { deviceid: string; espelho: string; momento: Date },
): Promise<
  { jobs: JobDoDeploy[]; associatedFiles: Record<string, ArquivoDoDeploy> } | Record<string, never>
> {
  const aguardando = await tx
    .select({
      id: maquinasDasDistribuicoes.id,
      pacote: pacotesDeSoftware,
      quando: distribuicoes.quando,
      aPartirDe: distribuicoes.aPartirDe,
      fuso: distribuicoes.fuso,
    })
    .from(maquinasDasDistribuicoes)
    .innerJoin(agentes, eq(agentes.id, maquinasDasDistribuicoes.agenteId))
    .innerJoin(distribuicoes, eq(distribuicoes.id, maquinasDasDistribuicoes.distribuicaoId))
    .innerJoin(pacotesDeSoftware, eq(pacotesDeSoftware.id, distribuicoes.pacoteId))
    .where(and(eq(agentes.deviceid, deviceid), eq(maquinasDasDistribuicoes.situacao, 'aguardando')))
    .orderBy(asc(distribuicoes.criadaEm));
  const linhas = aguardando.filter((linha) => podeSeguir(linha, momento));
  if (linhas.length === 0) return {};
  const comArquivo = [
    ...new Set(
      linhas.filter(({ pacote }) => pacote.sha512DoArquivo).map(({ pacote }) => pacote.id),
    ),
  ];
  const partes =
    comArquivo.length > 0
      ? await tx
          .select()
          .from(partesDosPacotes)
          .where(inArray(partesDosPacotes.pacoteId, comArquivo))
          .orderBy(asc(partesDosPacotes.indice))
      : [];
  const associatedFiles: Record<string, ArquivoDoDeploy> = {};
  const jobs = linhas.map(({ id, pacote }): JobDoDeploy => {
    const sha512 = pacote.sha512DoArquivo;
    if (sha512 && pacote.nomeDoArquivo) {
      associatedFiles[sha512] = {
        name: pacote.nomeDoArquivo,
        multiparts: partes
          .filter((parte) => parte.pacoteId === pacote.id)
          .map((parte) => parte.sha512),
        mirrors: [espelho],
        p2p: 0,
        'p2p-retention-duration': 0,
        uncompress: 0,
      };
    }
    return {
      uuid: id,
      checks: [],
      actions: [
        {
          cmd: {
            exec: pacote.comando,
            retChecks: [{ type: 'okCode', values: pacote.codigosDeSucesso }],
            logLineLimit: LINHAS_DA_SAIDA,
          },
        },
      ],
      associatedFiles: sha512 && pacote.nomeDoArquivo ? [sha512] : [],
    };
  });
  await tx
    .update(maquinasDasDistribuicoes)
    .set({ situacao: 'em-andamento', enviadaEm: momento, atualizadaEm: momento })
    .where(
      inArray(
        maquinasDasDistribuicoes.id,
        linhas.map(({ id }) => id),
      ),
    );
  return { jobs, associatedFiles };
}

export interface PassoDoDeploy {
  uuid: string;
  currentStep: string | null;
  status: string | null;
  mensagens: string[];
}

const textoDe = (valor: unknown) =>
  typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;

/**
 * O passo pela query do `setStatus`. A `msg` vem como texto ou como lista (`msg[]`, com as linhas
 * da saída do comando). O passo com o `actionnum` e sem a etapa é da execução.
 */
export function lerPassoDoDeploy(query: Record<string, unknown>): PassoDoDeploy {
  const msg = query.msg ?? query['msg[]'];
  const mensagens = (Array.isArray(msg) ? msg : [msg])
    .map(textoDe)
    .filter((linha): linha is string => linha !== null);
  return {
    uuid: textoDe(query.uuid) ?? '',
    currentStep:
      textoDe(query.currentStep) ?? (textoDe(query.actionnum) !== null ? 'processing' : null),
    status: textoDe(query.status),
    mensagens,
  };
}

/**
 * Grava o passo na máquina do job: a etapa, as linhas do log, a situação e o código de saída, da
 * mensagem "exit status" da execução. O job desconhecido, ou de outro agente, é ignorado.
 */
export async function gravarPassoDoDeploy(
  tx: Transacao,
  { deviceid, passo, momento }: { deviceid: string; passo: PassoDoDeploy; momento: Date },
): Promise<void> {
  if (!UUID.test(passo.uuid)) return;
  const [linha] = await tx
    .select({ maquina: maquinasDasDistribuicoes })
    .from(maquinasDasDistribuicoes)
    .innerJoin(agentes, eq(agentes.id, maquinasDasDistribuicoes.agenteId))
    .where(and(eq(maquinasDasDistribuicoes.id, passo.uuid), eq(agentes.deviceid, deviceid)));
  if (!linha) return;
  let estado = {
    situacao: linha.maquina.situacao,
    etapa: linha.maquina.etapa,
    log: linha.maquina.log,
  };
  let terminou = false;
  let codigo: number | null = null;
  for (const msg of passo.mensagens.length > 0 ? passo.mensagens : [null]) {
    codigo = codigoDaMensagem(msg) ?? codigo;
    const aplicado = aplicarPassoDoAgente(estado, {
      currentStep: passo.currentStep,
      status: passo.status,
      msg,
    });
    estado = aplicado;
    terminou ||= aplicado.terminou;
  }
  await tx
    .update(maquinasDasDistribuicoes)
    .set({
      situacao: estado.situacao,
      etapa: estado.etapa,
      log: estado.log,
      atualizadaEm: momento,
      ...(codigo !== null ? { codigoDeSaida: codigo } : {}),
      ...(terminou ? { terminadaEm: momento } : {}),
    })
    .where(eq(maquinasDasDistribuicoes.id, passo.uuid));
}

/**
 * O `expiration` do agente, em minutos: até uma hora depois do próximo momento do pedido que
 * aguarda e ainda não pode seguir, com o máximo de 24 horas, que é o de quem não tem pedido assim.
 */
export async function expirationDoAgente(
  tx: Transacao,
  { deviceid, momento }: { deviceid: string; momento: Date },
): Promise<number> {
  const pedidos = await tx
    .select({
      quando: distribuicoes.quando,
      aPartirDe: distribuicoes.aPartirDe,
      fuso: distribuicoes.fuso,
    })
    .from(maquinasDasDistribuicoes)
    .innerJoin(agentes, eq(agentes.id, maquinasDasDistribuicoes.agenteId))
    .innerJoin(distribuicoes, eq(distribuicoes.id, maquinasDasDistribuicoes.distribuicaoId))
    .where(
      and(eq(agentes.deviceid, deviceid), eq(maquinasDasDistribuicoes.situacao, 'aguardando')),
    );
  return expirationDoContato(pedidos, momento);
}

/**
 * O `expiration` do CONTACT, e o `volta_ate` do agente: o momento até o qual ele deve voltar, que é o
 * contato mais o prazo dado (design, decisão 8).
 */
export async function marcarAVolta(
  tx: Transacao,
  { deviceid, momento }: { deviceid: string; momento: Date },
): Promise<number> {
  const minutos = await expirationDoAgente(tx, { deviceid, momento });
  await tx
    .update(agentes)
    .set({ voltaAte: new Date(momento.getTime() + minutos * 60_000) })
    .where(eq(agentes.deviceid, deviceid));
  return minutos;
}

/**
 * O `expiration` como o agente lê: o número sozinho é em horas, como as 24 de fábrica; o menor vai
 * em minutos, com o "m" ("480m").
 */
export const expirationNoProtocolo = (minutos: number): number | string =>
  minutos >= EXPIRATION_DE_FABRICA ? EXPIRATION_DE_FABRICA / 60 : `${minutos}m`;
