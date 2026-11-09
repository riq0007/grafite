// A sessão guardada no servidor (design do F2a, decisão 6). O token é aleatório e só o hash dele vai
// ao banco; o navegador o guarda no cookie __Host-grafite-sessao. A sessão termina depois de 2 h sem
// uso ou de 12 h desde que passou a valer; pendente, termina 10 min depois da entrada.

import { createHash, randomBytes } from 'node:crypto';
import {
  type Banco,
  contas,
  doisPassos,
  naOrganizacao,
  pessoas,
  sessoes,
  type Transacao,
} from '@grafite/db';
import type { Acesso } from '@grafite/domain';
import { and, desc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { carregarAcesso, exigeDoisPassos } from './acesso.ts';
import { type Pendencia, pendenciaDa } from './pendencia.ts';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

export const TEMPOS_DA_SESSAO = {
  inatividade: 2 * HORA,
  total: 12 * HORA,
  pendente: 10 * MINUTO,
  /** O último uso só é regravado depois disso, e não a cada requisição. */
  toque: MINUTO,
};

/** `__Host-`: o navegador só aceita o cookie com Secure, Path=/ e sem Domain, preso ao endereço. */
export const NOME_DO_COOKIE = '__Host-grafite-sessao';

export function hashDoToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

const novoToken = () => randomBytes(32).toString('base64url');

/** A sessão de uma requisição, já conferida: existe, não terminou e é de uma conta ativa. */
export interface SessaoDaRequisicao {
  id: string;
  contaId: string;
  usuario: string;
  nome: string;
  pendencia: Pendencia | null;
  tokenCsrf: string;
  expiraEm: Date;
  /** O acesso efetivo da conta, lido nesta requisição (design do F2b, decisão 5). */
  acesso: Acesso;
  /** A conta tem a verificação em dois passos ativa, que o cofre exige (design do P6). */
  doisPassosAtivos: boolean;
  /** Até quando o código do app liberou revelar e copiar nesta sessão, ou `null`. */
  cofreLiberadoAte: Date | null;
}

export interface NovaSessao {
  contaId: string;
  momento: Date;
  ip: string | null;
  agente: string | null;
  /** A sessão nasce pendente: só resolve o passo da vez, por 10 min. */
  pendente: boolean;
}

/** Cria a sessão na organização da transação e devolve o token, que só existe aqui e no cookie. */
export async function criarSessao(
  tx: Transacao,
  { contaId, momento, ip, agente, pendente }: NovaSessao,
) {
  const token = novoToken();
  const tokenCsrf = novoToken();
  const expiraEm = new Date(
    momento.getTime() + (pendente ? TEMPOS_DA_SESSAO.pendente : TEMPOS_DA_SESSAO.total),
  );
  const [criada] = await tx
    .insert(sessoes)
    .values({
      orgId: sql`app.current_org()`,
      contaId,
      tokenHash: hashDoToken(token),
      tokenCsrf,
      criadaEm: momento,
      ultimoUsoEm: momento,
      expiraEm,
      ativadaEm: pendente ? null : momento,
      ip,
      agente: agente?.slice(0, 512) ?? null,
    })
    .returning({ id: sessoes.id });
  if (!criada) throw new Error('A sessão não foi criada.');
  return { id: criada.id, token, tokenCsrf, expiraEm };
}

/**
 * A sessão do token, na organização do endereço, se ela ainda vale. O último uso é regravado
 * quando passa de 60 s, a menos que a leitura não conte como uso (`tocar: false`): a da conexão de
 * eventos e a das requisições que a tela faz sozinha (design do F2c, decisão 13).
 */
export function lerSessao(
  banco: Banco,
  {
    orgId,
    token,
    agora,
    tocar = true,
  }: { orgId: string; token: string; agora: Date; tocar?: boolean },
): Promise<SessaoDaRequisicao | null> {
  return naOrganizacao(banco, orgId, async (tx) => {
    const [linha] = await tx
      .select({
        sessao: sessoes,
        usuario: contas.usuario,
        situacao: contas.situacao,
        senhaTemporaria: contas.senhaTemporaria,
        exigeDoisPassos: contas.exigeDoisPassos,
        nome: pessoas.nome,
        doisPassosAtivadoEm: doisPassos.ativadoEm,
      })
      .from(sessoes)
      .innerJoin(contas, and(eq(contas.orgId, sessoes.orgId), eq(contas.id, sessoes.contaId)))
      .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
      .leftJoin(doisPassos, eq(doisPassos.contaId, contas.id))
      .where(eq(sessoes.tokenHash, hashDoToken(token)));
    if (!linha) return null;
    const { sessao } = linha;
    const momento = agora.getTime();
    const semUso = momento - sessao.ultimoUsoEm.getTime();
    const valendo =
      sessao.encerradaEm === null &&
      sessao.expiraEm.getTime() > momento &&
      semUso < TEMPOS_DA_SESSAO.inatividade &&
      linha.situacao === 'ativa';
    if (!valendo || linha.usuario === null) return null;
    if (tocar && semUso > TEMPOS_DA_SESSAO.toque) {
      await tx.update(sessoes).set({ ultimoUsoEm: agora }).where(eq(sessoes.id, sessao.id));
    }
    const acesso = await carregarAcesso(tx, sessao.contaId);
    return {
      id: sessao.id,
      contaId: sessao.contaId,
      usuario: linha.usuario,
      nome: linha.nome,
      pendencia: pendenciaDa({
        conta: {
          senhaTemporaria: linha.senhaTemporaria,
          exigeDoisPassos: exigeDoisPassos(linha, acesso),
        },
        doisPassosAtivos: linha.doisPassosAtivadoEm !== null,
        segundoPassoEm: sessao.segundoPassoEm,
      }),
      tokenCsrf: sessao.tokenCsrf,
      expiraEm: sessao.expiraEm,
      acesso,
      doisPassosAtivos: linha.doisPassosAtivadoEm !== null,
      cofreLiberadoAte: sessao.cofreLiberadoAte,
    };
  });
}

const ATRIBUTOS_DO_COOKIE = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;

/** O cookie vive até a sessão expirar: fechar o navegador não a encerra. */
export function gravarCookieDaSessao(
  resposta: FastifyReply,
  token: string,
  expiraEm: Date,
  agora: Date,
) {
  resposta.setCookie(NOME_DO_COOKIE, token, {
    ...ATRIBUTOS_DO_COOKIE,
    maxAge: Math.max(0, Math.floor((expiraEm.getTime() - agora.getTime()) / 1000)),
  });
}

export function apagarCookieDaSessao(resposta: FastifyReply) {
  resposta.clearCookie(NOME_DO_COOKIE, ATRIBUTOS_DO_COOKIE);
}

/**
 * A sessão pendente passa a valer: um token e um CSRF novos (o anterior deixa de ser aceito, contra
 * a fixação de sessão) e as 12 h contadas a partir de agora.
 */
export async function ativarSessao(tx: Transacao, sessaoId: string, momento: Date) {
  const token = novoToken();
  const tokenCsrf = novoToken();
  const expiraEm = new Date(momento.getTime() + TEMPOS_DA_SESSAO.total);
  await tx
    .update(sessoes)
    .set({
      tokenHash: hashDoToken(token),
      tokenCsrf,
      ativadaEm: momento,
      expiraEm,
      ultimoUsoEm: momento,
    })
    .where(eq(sessoes.id, sessaoId));
  return { token, tokenCsrf, expiraEm };
}

/**
 * As sessões que valem de uma conta, da usada por último à mais antiga: sem as pendentes, as
 * encerradas, as expiradas e as paradas há mais tempo que o limite. Nunca com o token.
 */
export function lerSessoesAbertas(tx: Transacao, contaId: string, momento: Date) {
  return tx
    .select({
      id: sessoes.id,
      agente: sessoes.agente,
      ip: sessoes.ip,
      criadaEm: sessoes.criadaEm,
      ultimoUsoEm: sessoes.ultimoUsoEm,
    })
    .from(sessoes)
    .where(
      and(
        eq(sessoes.contaId, contaId),
        isNull(sessoes.encerradaEm),
        isNotNull(sessoes.ativadaEm),
        gt(sessoes.expiraEm, momento),
        gt(sessoes.ultimoUsoEm, new Date(momento.getTime() - TEMPOS_DA_SESSAO.inatividade)),
      ),
    )
    .orderBy(desc(sessoes.ultimoUsoEm));
}
