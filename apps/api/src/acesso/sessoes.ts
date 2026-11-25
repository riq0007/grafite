// A sessão guardada no servidor (design do F2a, decisão 6). O token é aleatório e só o hash dele vai
// ao banco; o navegador o guarda no cookie __Host-grafite-sessao. A sessão termina depois de 2 h sem
// uso ou de 12 h desde que passou a valer; pendente, termina 10 min depois da entrada.

import { createHash, randomBytes } from 'node:crypto';
import {
  type ALCANCES_DA_SESSAO,
  aparelhosDaAba,
  type Banco,
  contas,
  doisPassos,
  naOrganizacao,
  pessoas,
  sessoes,
  sessoesDaAba,
  type Transacao,
} from '@grafite/db';
import type { Acesso } from '@grafite/domain';
import { and, eq, gt, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
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

/** Onde a sessão vale: em tudo, ou só no chat da aba (change aba-dos-colaboradores, decisão 8). */
export type AlcanceDaSessao = (typeof ALCANCES_DA_SESSAO)[number];

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
  /** A sessão do chat na aba, com o alcance `chat-da-aba`: só vale nas rotas da lista. */
  naAba: boolean;
}

export interface NovaSessao {
  contaId: string;
  momento: Date;
  ip: string | null;
  agente: string | null;
  /** A sessão nasce pendente: só resolve o passo da vez, por 10 min. */
  pendente: boolean;
  /**
   * A entrada pelo aparelho confiável (change aparelho-confiavel): a sessão nasce com o código
   * resolvido e guarda o aparelho.
   */
  aparelhoId?: string | null;
}

/** Cria a sessão na organização da transação e devolve o token, que só existe aqui e no cookie. */
export async function criarSessao(
  tx: Transacao,
  { contaId, momento, ip, agente, pendente, aparelhoId = null }: NovaSessao,
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
      segundoPassoEm: aparelhoId ? momento : null,
      aparelhoId,
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
 *
 * Só volta a sessão dos alcances que o chamador aceita, e sem eles só a comum: a do chat na aba é
 * recusada por padrão (change aba-dos-colaboradores, decisão 8). A do chat na aba confere ao vivo a
 * sessão da aba ligada: vencida, terminada, parada pela senha ou com o aparelho bloqueado, a do chat
 * também vale como terminada.
 */
export function lerSessao(
  banco: Banco,
  {
    orgId,
    token,
    agora,
    tocar = true,
    alcances = ['comum'],
  }: {
    orgId: string;
    token: string;
    agora: Date;
    tocar?: boolean;
    alcances?: readonly AlcanceDaSessao[];
  },
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
        aba: {
          encerradaEm: sessoesDaAba.encerradaEm,
          ativadaEm: sessoesDaAba.ativadaEm,
          expiraEm: sessoesDaAba.expiraEm,
          entrada: sessoesDaAba.entrada,
          ultimoUsoEm: sessoesDaAba.ultimoUsoEm,
          bloqueadoEm: aparelhosDaAba.bloqueadoEm,
        },
      })
      .from(sessoes)
      .innerJoin(contas, and(eq(contas.orgId, sessoes.orgId), eq(contas.id, sessoes.contaId)))
      .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
      .leftJoin(doisPassos, eq(doisPassos.contaId, contas.id))
      .leftJoin(
        sessoesDaAba,
        and(eq(sessoesDaAba.orgId, sessoes.orgId), eq(sessoesDaAba.id, sessoes.sessaoDaAbaId)),
      )
      .leftJoin(
        aparelhosDaAba,
        and(
          eq(aparelhosDaAba.orgId, sessoesDaAba.orgId),
          eq(aparelhosDaAba.id, sessoesDaAba.aparelhoId),
        ),
      )
      .where(eq(sessoes.tokenHash, hashDoToken(token)));
    if (!linha) return null;
    const { sessao, aba } = linha;
    if (!alcances.includes(sessao.alcance)) return null;
    const momento = agora.getTime();
    const semUso = momento - sessao.ultimoUsoEm.getTime();
    const abaVale =
      sessao.alcance === 'comum' ||
      (aba !== null &&
        aba.encerradaEm === null &&
        aba.ativadaEm !== null &&
        aba.expiraEm !== null &&
        aba.expiraEm.getTime() > momento &&
        (aba.entrada !== 'senha' ||
          (aba.ultimoUsoEm !== null &&
            momento - aba.ultimoUsoEm.getTime() < SEM_USO_DA_ABA_PELA_SENHA)) &&
        aba.bloqueadoEm === null);
    const valendo =
      sessao.encerradaEm === null &&
      sessao.expiraEm.getTime() > momento &&
      semUso < TEMPOS_DA_SESSAO.inatividade &&
      linha.situacao === 'ativa' &&
      abaVale;
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
      naAba: sessao.alcance === 'chat-da-aba',
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

/** Quanto a sessão da aba pela senha fica sem uso antes de terminar (change aba-dos-colaboradores). */
export const SEM_USO_DA_ABA_PELA_SENHA = 30 * 60_000;

/** A sessão da aba aberta, ativada e valendo: o complemento do `semValer` do `aba/sessao.ts`. */
const abaValendo = (momento: Date) =>
  and(
    isNull(sessoesDaAba.encerradaEm),
    isNotNull(sessoesDaAba.ativadaEm),
    gt(sessoesDaAba.expiraEm, momento),
    or(
      ne(sessoesDaAba.entrada, 'senha'),
      gt(sessoesDaAba.ultimoUsoEm, new Date(momento.getTime() - SEM_USO_DA_ABA_PELA_SENHA)),
    ),
  );

/** Uma sessão aberta da conta, nas duas listas: a do navegador, a da aba ou a do chat na aba. */
export interface SessaoAberta {
  id: string;
  agente: string | null;
  ip: string | null;
  criadaEm: Date;
  ultimoUsoEm: Date;
  /** A sessão da aba, com o computador e a entrada dele. */
  aba: { computador: string; entrada: 'windows' | 'senha' } | null;
  /** A sessão do chat na aba, com o computador da sessão da aba dela. */
  chatNaAba: { computador: string } | null;
}

/**
 * As sessões que valem de uma conta, da usada por último à mais antiga: sem as pendentes, as
 * encerradas, as expiradas e as paradas há mais tempo que o limite, e com as da aba (change
 * aba-dos-colaboradores, spec entrada-e-sessoes, "Sessões do usuário"). Nunca com o token.
 */
export async function lerSessoesAbertas(
  tx: Transacao,
  contaId: string,
  momento: Date,
): Promise<SessaoAberta[]> {
  const doNavegador = await tx
    .select({
      id: sessoes.id,
      agente: sessoes.agente,
      ip: sessoes.ip,
      criadaEm: sessoes.criadaEm,
      ultimoUsoEm: sessoes.ultimoUsoEm,
      computador: aparelhosDaAba.nome,
    })
    .from(sessoes)
    .leftJoin(
      sessoesDaAba,
      and(eq(sessoesDaAba.orgId, sessoes.orgId), eq(sessoesDaAba.id, sessoes.sessaoDaAbaId)),
    )
    .leftJoin(
      aparelhosDaAba,
      and(
        eq(aparelhosDaAba.orgId, sessoesDaAba.orgId),
        eq(aparelhosDaAba.id, sessoesDaAba.aparelhoId),
      ),
    )
    .where(
      and(
        eq(sessoes.contaId, contaId),
        isNull(sessoes.encerradaEm),
        isNotNull(sessoes.ativadaEm),
        gt(sessoes.expiraEm, momento),
        gt(sessoes.ultimoUsoEm, new Date(momento.getTime() - TEMPOS_DA_SESSAO.inatividade)),
        // O chat na aba sai com a sessão da aba dele, que vence sem ninguém gravar o fim.
        or(isNull(sessoes.sessaoDaAbaId), abaValendo(momento)),
      ),
    );
  // As da aba: a vencida e a da senha parada há 30 minutos ficam abertas no banco até o pedido
  // seguinte, e não entram na lista.
  const daAba = await tx
    .select({
      id: sessoesDaAba.id,
      ip: sessoesDaAba.ip,
      criadaEm: sessoesDaAba.criadaEm,
      ultimoUsoEm: sessoesDaAba.ultimoUsoEm,
      computador: aparelhosDaAba.nome,
      entrada: sessoesDaAba.entrada,
    })
    .from(sessoesDaAba)
    .innerJoin(
      aparelhosDaAba,
      and(
        eq(aparelhosDaAba.orgId, sessoesDaAba.orgId),
        eq(aparelhosDaAba.id, sessoesDaAba.aparelhoId),
      ),
    )
    .where(and(eq(sessoesDaAba.contaId, contaId), abaValendo(momento)));
  return [
    ...doNavegador.map(({ computador, ...linha }) => ({
      ...linha,
      aba: null,
      chatNaAba: computador === null ? null : { computador },
    })),
    ...daAba.map(({ computador, entrada, ...linha }) => ({
      ...linha,
      agente: null,
      aba: { computador, entrada },
      chatNaAba: null,
    })),
  ].sort((a, b) => b.ultimoUsoEm.getTime() - a.ultimoUsoEm.getTime());
}

/** A frase da sessão da aba pelo Windows na lista: encerrá-la vale só até a aba abrir outra. */
export const AVISO_DA_ABA_PELO_WINDOWS =
  'Este computador entra na aba pelo Windows: encerrada a sessão, a aba abre outra na hora. Só o bloqueio do computador, feito pela TI, o para.';

/** Como a lista mostra a sessão: o navegador e o sistema, ou o computador da aba. */
export function descreverSessao(
  linha: SessaoAberta,
  descreverDispositivo: (agente: string | null) => string,
): { dispositivo: string; aviso: string | null } {
  if (linha.aba) {
    return {
      dispositivo: `Aba · ${linha.aba.computador}`,
      aviso: linha.aba.entrada === 'windows' ? AVISO_DA_ABA_PELO_WINDOWS : null,
    };
  }
  if (linha.chatNaAba) {
    return { dispositivo: `Chat na aba · ${linha.chatNaAba.computador}`, aviso: null };
  }
  return { dispositivo: descreverDispositivo(linha.agente), aviso: null };
}
