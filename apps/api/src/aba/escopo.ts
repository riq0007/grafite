// O escopo das rotas da aba (spec aba-dos-colaboradores, "Aparelho registrado pela chave"; design,
// decisão 3): como o do coletor, a organização vem do endereço e o aparelho, do token no
// `Authorization: Bearer`, sem cookie, sem sessão e sem a proteção contra outros sites, que são das
// telas. O registro, que leva a chave e não o token, declara `config.semTokenDaAba`. O último
// contato é gravado no máximo uma vez por minuto, com o nome do computador e a versão quando mudam.
import { createHash } from 'node:crypto';
import {
  aparelhosDaAba,
  auditoria,
  type Banco,
  type ENTRADAS_DA_ABA,
  naOrganizacao,
  type Transacao,
} from '@grafite/db';
import { INTERVALO_DA_RECUSA_DA_PESSOA } from '@grafite/domain';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { exigirOrganizacao, type ResolvedorDeOrganizacao } from '../acesso/organizacao.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { ProblemaDaApi } from '../problemas.ts';

export type EntradaDaAba = (typeof ENTRADAS_DA_ABA)[number];

declare module 'fastify' {
  interface FastifyRequest {
    /** O aparelho do token, nas rotas da aba que pedem o token. */
    aparelhoDaAba: AparelhoDaRequisicao | null;
  }
  interface FastifyContextConfig {
    /** A rota da aba que não leva o token do aparelho, como o registro, que leva a chave. */
    semTokenDaAba?: true;
  }
}

export interface AparelhoDaRequisicao {
  id: string;
  nome: string;
  identificadorCurto: string;
  entrada: EntradaDaAba;
  tetoDeContas: number;
}

/** O cabeçalho com a versão da aba e o com o nome do computador, que cada contato manda. */
export const CABECALHO_DA_VERSAO_DA_ABA = 'x-grafite-versao-da-aba';
export const CABECALHO_DO_COMPUTADOR = 'x-grafite-computador';

/** De quanto em quanto tempo, no máximo, o último contato é gravado. */
const CONTATO_GRAVADO_A_CADA = 60_000;
const MINUTO = 60_000;

/** O limite das rotas da aba com o token, por token: o serviço relê a configuração a cada 60 s. */
export const LIMITE_POR_TOKEN_DA_ABA = {
  max: 120,
  timeWindow: MINUTO,
  keyGenerator: (requisicao: FastifyRequest) => {
    const token = tokenDoCabecalho(requisicao.headers.authorization);
    return token
      ? `aba:${createHash('sha256').update(token).digest('base64url')}`
      : `ip:${requisicao.ip}`;
  },
};

export const chaveRecusada = () =>
  new ProblemaDaApi({
    codigo: 'chave-da-aba-recusada',
    status: 401,
    titulo: 'Chave recusada',
    detalhe: 'Chave da aba recusada.',
  });

export const tokenDaAbaRecusado = () =>
  new ProblemaDaApi({
    codigo: 'token-da-aba-recusado',
    status: 401,
    titulo: 'Computador sem registro',
    detalhe: 'Este computador precisa ser registrado de novo. Fale com a TI.',
  });

export const aparelhoBloqueado = () =>
  new ProblemaDaApi({
    codigo: 'aparelho-da-aba-bloqueado',
    status: 403,
    titulo: 'Computador bloqueado',
    detalhe: 'Este computador foi bloqueado na aba. Fale com a TI.',
  });

const FRASE_DA_ENTRADA: Record<EntradaDaAba, string> = {
  windows: 'Este computador entra na aba pelo usuário do Windows.',
  senha: 'Este computador entra na aba pelo usuário e pela senha do AD.',
};

/**
 * A entrada do aparelho é do servidor (decisão 2): o aparelho com a entrada pela senha recusa o
 * pedido pelo SID, e o com a entrada pelo Windows recusa o pedido pela senha.
 */
export function exigirEntrada(aparelho: { entrada: EntradaDaAba }, pedida: EntradaDaAba) {
  if (aparelho.entrada === pedida) return;
  throw new ProblemaDaApi({
    codigo: 'entrada-do-aparelho-diferente',
    status: 403,
    titulo: 'Outra entrada',
    detalhe: FRASE_DA_ENTRADA[aparelho.entrada],
  });
}

/** O token do cabeçalho `Authorization: Bearer <token>`, ou `null`. */
export function tokenDoCabecalho(cabecalho: string | undefined): string | null {
  const achado = /^Bearer\s+(\S+)$/i.exec(cabecalho?.trim() ?? '');
  return achado?.[1] ?? null;
}

const primeiro = (cabecalho: string | string[] | undefined) =>
  (Array.isArray(cabecalho) ? cabecalho[0] : cabecalho)?.trim() ?? '';

/** A versão informada, quando ela cabe no registro: até 40 caracteres visíveis. */
export function versaoDoCabecalho(cabecalho: string | string[] | undefined): string | null {
  const versao = primeiro(cabecalho);
  return /^[\x21-\x7e]{1,40}$/.test(versao) ? versao : null;
}

/** O nome do computador informado, quando ele cabe no registro: de 1 a 63 caracteres. */
export function computadorDoCabecalho(cabecalho: string | string[] | undefined): string | null {
  const nome = primeiro(cabecalho);
  const visivel = [...nome].every((caractere) => caractere >= ' ');
  return nome.length >= 1 && nome.length <= 63 && visivel ? nome : null;
}

/**
 * A recusa da chave e a do token na auditoria, sem repetir a mesma recusa do mesmo endereço em 10
 * minutos: o serviço tenta de novo a cada minuto, e o computador restaurado de um backup encheria a
 * auditoria.
 */
export async function auditarRecusa(
  tx: Transacao,
  {
    acao,
    ip,
    momento,
    dados,
  }: {
    acao: 'chave-da-aba.recusada' | 'token-da-aba.recusado';
    ip: string;
    momento: Date;
    dados?: Record<string, unknown>;
  },
) {
  const desde = new Date(momento.getTime() - INTERVALO_DA_RECUSA_DA_PESSOA);
  const [recente] = await tx
    .select({ id: auditoria.id })
    .from(auditoria)
    .where(and(eq(auditoria.acao, acao), eq(auditoria.ip, ip), gt(auditoria.momento, desde)))
    .orderBy(desc(auditoria.momento))
    .limit(1);
  if (recente) return;
  await registrarNaAuditoria(tx, {
    acao,
    ator: { tipo: 'anonimo' },
    alvo: { tipo: acao === 'chave-da-aba.recusada' ? 'chave-da-aba' : 'aparelho-da-aba' },
    ...(dados ? { dados } : {}),
    origem: { ip, codigoDeRastreio: null },
    momento,
  });
}

export function instalarAba(
  escopo: FastifyInstance,
  {
    banco,
    agora,
    resolver,
    organizacaoOperadora,
  }: {
    banco: Banco;
    agora: () => Date;
    resolver: ResolvedorDeOrganizacao;
    organizacaoOperadora?: string;
  },
) {
  exigirOrganizacao(escopo, resolver, organizacaoOperadora);
  escopo.decorateRequest('aparelhoDaAba', null);
  escopo.addHook('onRequest', async (requisicao) => {
    if (requisicao.routeOptions.config?.semTokenDaAba) return;
    const token = tokenDoCabecalho(requisicao.headers.authorization);
    const orgId = requisicao.organizacao?.id;
    if (!orgId) throw tokenDaAbaRecusado();
    const momento = agora();
    const achado = await naOrganizacao(banco, orgId, async (tx) => {
      const [linha] = token
        ? await tx
            .select()
            .from(aparelhosDaAba)
            .where(eq(aparelhosDaAba.tokenHash, hashDoToken(token)))
        : [];
      if (!linha) {
        await auditarRecusa(tx, { acao: 'token-da-aba.recusado', ip: requisicao.ip, momento });
        return 'recusado' as const;
      }
      if (linha.bloqueadoEm !== null) return 'bloqueado' as const;
      const versao = versaoDoCabecalho(requisicao.headers[CABECALHO_DA_VERSAO_DA_ABA]);
      const nome = computadorDoCabecalho(requisicao.headers[CABECALHO_DO_COMPUTADOR]);
      const passou =
        !linha.ultimoContatoEm ||
        momento.getTime() - linha.ultimoContatoEm.getTime() >= CONTATO_GRAVADO_A_CADA;
      const outraVersao = versao !== null && versao !== linha.versao;
      const outroNome = nome !== null && nome !== linha.nome;
      if (passou || outraVersao || outroNome) {
        await tx
          .update(aparelhosDaAba)
          .set({
            ultimoContatoEm: momento,
            ...(outraVersao ? { versao } : {}),
            ...(outroNome ? { nome } : {}),
          })
          .where(eq(aparelhosDaAba.id, linha.id));
      }
      return {
        id: linha.id,
        nome: outroNome ? nome : linha.nome,
        identificadorCurto: linha.identificadorCurto,
        entrada: linha.entrada,
        tetoDeContas: linha.tetoDeContas,
      };
    });
    if (achado === 'recusado') throw tokenDaAbaRecusado();
    if (achado === 'bloqueado') throw aparelhoBloqueado();
    requisicao.aparelhoDaAba = achado;
  });
}
