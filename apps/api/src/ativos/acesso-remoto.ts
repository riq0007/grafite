// O acesso remoto por VNC (spec acesso-remoto; change acesso-remoto-vnc, design, decisão 2): o alvo
// do acesso, com o IP do campo da disponibilidade e a porta do tipo, e a ponte que liga a conexão
// WebSocket da tela à porta VNC da máquina, sem guardar nada do que passa. O fim de um lado fecha o
// outro, com o motivo no código 4000 do fechamento, que a tela mostra.
import { connect } from 'node:net';
import type { WebSocket } from '@fastify/websocket';
import { ativos, type Transacao, tiposDeAtivo } from '@grafite/db';
import { PORTA_PADRAO_DO_VNC } from '@grafite/domain';
import { and, eq, sql } from 'drizzle-orm';
import { ipDoAtivo } from '../coleta/alvos.ts';

/** O código do fechamento pela ponte; o motivo vai no texto. */
export const FECHAMENTO_DA_PONTE = 4000;

/** O prazo da primeira resposta da máquina, em milissegundos. */
export const PRAZO_DA_MAQUINA = 10_000;

/** Acima disto à espera do navegador, a ponte para de ler a máquina até o navegador alcançar. */
const LIMITE_A_CAMINHO = 4 * 1024 * 1024;

export const MOTIVOS_DO_ACESSO_REMOTO = {
  naoEncontrado: 'Ativo não encontrado.',
  semPermissao: 'Você não tem o acesso remoto no local deste ativo.',
  inativo: 'O ativo está inativo.',
  semCapacidade: 'O tipo do ativo não tem o acesso remoto.',
  semIp: 'O ativo não tem IP para o acesso remoto.',
  semResposta: 'A máquina não respondeu no VNC.',
  encerrou: 'A máquina encerrou a conexão.',
  falhou: 'O acesso remoto falhou. Tente de novo.',
  recusou: (porta: number) => `A máquina recusou a conexão na porta ${porta}.`,
} as const;

const doTipo = and(eq(tiposDeAtivo.orgId, ativos.orgId), eq(tiposDeAtivo.id, ativos.tipoId));

export interface AlvoDoAcessoRemoto {
  localId: string | null;
  situacao: 'ativo' | 'inativo';
  capacidades: string[];
  ip: string | null;
  porta: number | null;
}

/** O ativo do acesso, com o local, a situação, as capacidades do tipo, o IP e a porta, ou `null`. */
export async function lerAlvoDoAcessoRemoto(
  tx: Transacao,
  ativoId: string,
): Promise<AlvoDoAcessoRemoto | null> {
  const [linha] = await tx
    .select({
      localId: ativos.localId,
      situacao: ativos.situacao,
      capacidades: tiposDeAtivo.capacidades,
      ip: ipDoAtivo,
      porta: sql<
        number | null
      >`(${tiposDeAtivo.configuracaoDasCapacidades} -> 'acesso.vnc' ->> 'porta')::int`,
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, doTipo)
    .where(eq(ativos.id, ativoId));
  return linha ?? null;
}

/** O IP e a porta do alvo que passa nas conferências, ou o motivo da recusa. */
export function conferirAlvo(
  alvo: AlvoDoAcessoRemoto,
): { ip: string; porta: number } | { motivo: string } {
  if (alvo.situacao !== 'ativo') return { motivo: MOTIVOS_DO_ACESSO_REMOTO.inativo };
  if (!alvo.capacidades.includes('acesso.vnc')) {
    return { motivo: MOTIVOS_DO_ACESSO_REMOTO.semCapacidade };
  }
  const ip = alvo.ip?.trim();
  if (!ip) return { motivo: MOTIVOS_DO_ACESSO_REMOTO.semIp };
  return { ip, porta: alvo.porta ?? PORTA_PADRAO_DO_VNC };
}

/**
 * Liga a conexão da tela à porta VNC da máquina: os dados passam nos dois sentidos. Sem a primeira
 * resposta da máquina no prazo, ou com a conexão recusada, a ponte fecha a tela com o motivo; o fim
 * da tela fecha a máquina, e o da máquina, a tela.
 */
export function ligarPonte(
  navegador: WebSocket,
  { ip, porta, prazo = PRAZO_DA_MAQUINA }: { ip: string; porta: number; prazo?: number },
) {
  let fechada = false;
  const maquina = connect({ host: ip, port: porta });
  const fechar = (motivo: string) => {
    if (fechada) return;
    fechada = true;
    clearTimeout(espera);
    maquina.destroy();
    if (navegador.readyState === navegador.OPEN) navegador.close(FECHAMENTO_DA_PONTE, motivo);
  };
  const espera = setTimeout(() => fechar(MOTIVOS_DO_ACESSO_REMOTO.semResposta), prazo);

  maquina.once('data', () => clearTimeout(espera));
  maquina.on('data', (dados) => {
    navegador.send(dados, { binary: true }, () => {
      if (maquina.isPaused() && navegador.bufferedAmount < LIMITE_A_CAMINHO) maquina.resume();
    });
    if (navegador.bufferedAmount >= LIMITE_A_CAMINHO) maquina.pause();
  });
  maquina.on('error', (erro: NodeJS.ErrnoException) =>
    fechar(
      erro.code === 'ECONNREFUSED'
        ? MOTIVOS_DO_ACESSO_REMOTO.recusou(porta)
        : MOTIVOS_DO_ACESSO_REMOTO.semResposta,
    ),
  );
  maquina.on('close', () => fechar(MOTIVOS_DO_ACESSO_REMOTO.encerrou));

  navegador.on('message', (dados) => {
    if (fechada) return;
    maquina.write(
      Array.isArray(dados)
        ? Buffer.concat(dados)
        : Buffer.isBuffer(dados)
          ? dados
          : Buffer.from(new Uint8Array(dados)),
    );
  });
  navegador.on('close', () => {
    fechada = true;
    clearTimeout(espera);
    maquina.destroy();
  });
}
