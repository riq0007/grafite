// O Deploy do agente do GLPI (spec distribuicao-de-software, "Deploy pelo agente do GLPI"; change
// distribuicao-de-software, design, decisões 2 a 4): os jobs das máquinas que aguardam o agente,
// com o arquivo em partes no espelho, e os passos que ele manda, que viram a situação, a etapa e o
// log da máquina.
import {
  agentes,
  distribuicoes,
  maquinasDasDistribuicoes,
  pacotesDeSoftware,
  partesDosPacotes,
  type Transacao,
} from '@grafite/db';
import { aplicarPassoDoAgente } from '@grafite/domain';
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
 * Os jobs das máquinas que aguardam o agente, que passam a "em andamento". Sem nenhum, `{}`, que o
 * agente lê como "nada a fazer". O job sem arquivo vai com a lista de arquivos vazia.
 */
export async function jobsDoAgente(
  tx: Transacao,
  { deviceid, espelho, momento }: { deviceid: string; espelho: string; momento: Date },
): Promise<
  { jobs: JobDoDeploy[]; associatedFiles: Record<string, ArquivoDoDeploy> } | Record<string, never>
> {
  const linhas = await tx
    .select({ id: maquinasDasDistribuicoes.id, pacote: pacotesDeSoftware })
    .from(maquinasDasDistribuicoes)
    .innerJoin(agentes, eq(agentes.id, maquinasDasDistribuicoes.agenteId))
    .innerJoin(distribuicoes, eq(distribuicoes.id, maquinasDasDistribuicoes.distribuicaoId))
    .innerJoin(pacotesDeSoftware, eq(pacotesDeSoftware.id, distribuicoes.pacoteId))
    .where(and(eq(agentes.deviceid, deviceid), eq(maquinasDasDistribuicoes.situacao, 'aguardando')))
    .orderBy(asc(distribuicoes.criadaEm));
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
 * Grava o passo na máquina do job: a etapa, as linhas do log e a situação. O job desconhecido, ou
 * de outro agente, é ignorado.
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
  for (const msg of passo.mensagens.length > 0 ? passo.mensagens : [null]) {
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
      ...(terminou ? { terminadaEm: momento } : {}),
    })
    .where(eq(maquinasDasDistribuicoes.id, passo.uuid));
}
