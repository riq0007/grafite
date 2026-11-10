// Os aparelhos confiáveis (spec verificacao-em-dois-passos, "Aparelho confiável", "Prazo da
// confiança" e "Aparelhos esquecidos"; change aparelho-confiavel, design, decisões 1 a 5): o
// navegador que a conta marcou no passo do código dispensa o código nas entradas seguintes, dentro
// do prazo. O aparelho é um segundo token, como o da sessão: só o hash vai ao banco, e o token só
// existe no cookie, que vai só às rotas da entrada.

import { randomBytes } from 'node:crypto';
import {
  aparelhosConfiaveis,
  contas,
  politicaDeEntrada,
  sessoes,
  type Transacao,
} from '@grafite/db';
import {
  type Acesso,
  APARELHOS_POR_CONTA,
  aparelhoNoPrazo,
  descreverDispositivo,
  type PrazoDaConfianca,
  prazoDaConfianca,
} from '@grafite/domain';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { type EventoDeAuditoria, registrarNaAuditoria } from '../auditoria.ts';
import { carregarAcesso } from './acesso.ts';
import { hashDoToken } from './sessoes.ts';

/** `__Secure-`: o navegador só aceita o cookie com Secure; sem Domain, preso ao endereço. */
export const NOME_DO_COOKIE_DO_APARELHO = '__Secure-grafite-aparelho';

/**
 * O cookie só acompanha as rotas da entrada, que o navegador vê em `/api/sessao`: o prefixo
 * `__Host-` obrigaria o `Path=/`, e ele iria em toda requisição.
 */
const ATRIBUTOS_DO_COOKIE = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/sessao',
} as const;

const DIA_EM_SEGUNDOS = 24 * 60 * 60;

export function lerCookieDoAparelho(requisicao: FastifyRequest): string | null {
  const token = requisicao.cookies[NOME_DO_COOKIE_DO_APARELHO];
  return token ? token : null;
}

/** O cookie dura o prazo que vale na hora da marcação. */
export function gravarCookieDoAparelho(resposta: FastifyReply, token: string, dias: number) {
  resposta.setCookie(NOME_DO_COOKIE_DO_APARELHO, token, {
    ...ATRIBUTOS_DO_COOKIE,
    maxAge: dias * DIA_EM_SEGUNDOS,
  });
}

export function apagarCookieDoAparelho(resposta: FastifyReply) {
  resposta.clearCookie(NOME_DO_COOKIE_DO_APARELHO, ATRIBUTOS_DO_COOKIE);
}

/**
 * O prazo que vale para a conta (design, decisão 4): o dela, o menor dos perfis em vigor ou o da
 * organização, lido na hora. O acesso já carregado na requisição serve, sem uma leitura a mais.
 */
export async function prazoDaConta(
  tx: Transacao,
  contaId: string,
  acesso?: Acesso,
): Promise<PrazoDaConfianca> {
  const [conta] = await tx
    .select({ dias: contas.diasDeConfianca })
    .from(contas)
    .where(eq(contas.id, contaId));
  const [politica] = await tx
    .select({ dias: politicaDeEntrada.diasDeConfianca })
    .from(politicaDeEntrada);
  const doAcesso = acesso ?? (await carregarAcesso(tx, contaId));
  return prazoDaConfianca({
    conta: conta?.dias ?? null,
    perfis: doAcesso.prazosDosPerfis,
    organizacao: politica?.dias ?? null,
  });
}

/**
 * Marca o navegador como aparelho confiável da conta (design, decisão 3), na transação que conclui
 * o passo do código. O cookie de antes daquele navegador a entrada já apagou (decisão 2). Passando
 * de 10, sai o usado há mais tempo. A sessão guarda o aparelho que marcou.
 */
export async function marcarAparelho(
  tx: Transacao,
  {
    contaId,
    sessaoId,
    agente,
    ip,
    momento,
    origem,
  }: {
    contaId: string;
    sessaoId: string;
    agente: string | null;
    ip: string | null;
    momento: Date;
    origem: EventoDeAuditoria['origem'];
  },
): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString('base64url');
  const dispositivo = descreverDispositivo(agente).slice(0, 80);
  const [criado] = await tx
    .insert(aparelhosConfiaveis)
    .values({
      orgId: sql`app.current_org()`,
      contaId,
      tokenHash: hashDoToken(token),
      dispositivo,
      ip,
      criadoEm: momento,
      usadoEm: momento,
    })
    .returning({ id: aparelhosConfiaveis.id });
  if (!criado) throw new Error('O aparelho não foi marcado.');

  const daConta = await tx
    .select({ id: aparelhosConfiaveis.id })
    .from(aparelhosConfiaveis)
    .where(eq(aparelhosConfiaveis.contaId, contaId))
    .orderBy(desc(aparelhosConfiaveis.usadoEm), desc(aparelhosConfiaveis.criadoEm));
  const sobra = daConta.slice(APARELHOS_POR_CONTA).map((aparelho) => aparelho.id);
  if (sobra.length > 0) {
    await tx.delete(aparelhosConfiaveis).where(inArray(aparelhosConfiaveis.id, sobra));
  }

  await tx.update(sessoes).set({ aparelhoId: criado.id }).where(eq(sessoes.id, sessaoId));
  await registrarNaAuditoria(tx, {
    acao: 'aparelho.marcado',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'aparelho', id: criado.id },
    dados: { dispositivo },
    origem,
    momento,
  });
  return { id: criado.id, token };
}

/**
 * O aparelho do cookie que dispensa o código nesta entrada (design, decisão 2), só depois da senha
 * certa: ele existe, é da conta que entra, na organização do endereço, e está dentro do prazo do
 * momento. O uso fica registrado, sem renovar o prazo. `null`: o cookie não confere.
 */
export async function aparelhoDaEntrada(
  tx: Transacao,
  {
    contaId,
    token,
    momento,
    acesso,
  }: { contaId: string; token: string; momento: Date; acesso: Acesso },
): Promise<{ id: string } | null> {
  const [aparelho] = await tx
    .select({ id: aparelhosConfiaveis.id, criadoEm: aparelhosConfiaveis.criadoEm })
    .from(aparelhosConfiaveis)
    .where(
      and(
        eq(aparelhosConfiaveis.contaId, contaId),
        eq(aparelhosConfiaveis.tokenHash, hashDoToken(token)),
      ),
    );
  if (!aparelho) return null;
  const { dias } = await prazoDaConta(tx, contaId, acesso);
  if (!aparelhoNoPrazo({ criadoEm: aparelho.criadoEm, dias, agora: momento })) {
    // O cookie vai ser apagado, e o aparelho vencido já não volta àquele navegador.
    await tx.delete(aparelhosConfiaveis).where(eq(aparelhosConfiaveis.id, aparelho.id));
    return null;
  }
  await tx
    .update(aparelhosConfiaveis)
    .set({ usadoEm: momento })
    .where(eq(aparelhosConfiaveis.id, aparelho.id));
  return { id: aparelho.id };
}
