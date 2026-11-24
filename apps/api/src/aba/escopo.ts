// O escopo das rotas da aba (spec aba-dos-colaboradores, "Aparelho registrado pela chave"; design,
// decisão 3): como o do coletor, a organização vem do endereço e o aparelho, do token no
// `Authorization: Bearer`, sem cookie, sem sessão e sem a proteção contra outros sites, que são das
// telas. O registro, que leva a chave e não o token, declara `config.semTokenDaAba`. O último
// contato é gravado no máximo uma vez por minuto, com o nome do computador e a versão quando mudam.
// O limite por token das rotas entra depois deste gancho: o token que não vale é contado aqui, por
// endereço, e passado o limite é recusado antes do banco.
import { createHash } from 'node:crypto';
import {
  aparelhosDaAba,
  auditoria,
  type Banco,
  type ENTRADAS_DA_ABA,
  naOrganizacao,
  sessoesDaAba,
  type Transacao,
} from '@grafite/db';
import { and, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { encerrarChatsDaAba } from '../acesso/encerramento.ts';
import { exigirOrganizacao, type ResolvedorDeOrganizacao } from '../acesso/organizacao.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { ProblemaDaApi } from '../problemas.ts';
import { LIMITE_DA_ENTRADA } from '../protecao.ts';
import { origemDa } from '../rotas/sessao.ts';
import { SEM_USO_DA_SENHA } from './sessao.ts';

export type EntradaDaAba = (typeof ENTRADAS_DA_ABA)[number];

declare module 'fastify' {
  interface FastifyRequest {
    /** O aparelho do token, nas rotas da aba que pedem o token. */
    aparelhoDaAba: AparelhoDaRequisicao | null;
    /** A sessão da pessoa, nas rotas da sessão da aba, que levam o token dela no lugar do aparelho. */
    sessaoDaAba: SessaoDaRequisicao | null;
  }
  interface FastifyContextConfig {
    /** A rota da aba que não leva o token do aparelho, como o registro, que leva a chave. */
    semTokenDaAba?: true;
    /** A rota da sessão da aba, com o token da sessão da pessoa no lugar do token do aparelho. */
    daSessaoDaAba?: true;
  }
}

export interface AparelhoDaRequisicao {
  id: string;
  nome: string;
  identificadorCurto: string;
  entrada: EntradaDaAba;
  tetoDeContas: number;
}

export interface SessaoDaRequisicao {
  id: string;
  contaId: string;
  entrada: EntradaDaAba;
  expiraEm: Date;
}

/** O cabeçalho com a versão da aba e o com o nome do computador, que cada contato manda. */
export const CABECALHO_DA_VERSAO_DA_ABA = 'x-grafite-versao-da-aba';
export const CABECALHO_DO_COMPUTADOR = 'x-grafite-computador';

/** De quanto em quanto tempo, no máximo, o último contato é gravado. */
const CONTATO_GRAVADO_A_CADA = 60_000;
const MINUTO = 60_000;
/** A mesma recusa do mesmo endereço vai à auditoria uma vez neste intervalo. */
export const INTERVALO_DA_RECUSA_NA_AUDITORIA = 10 * MINUTO;
/** O limite das recusas do token da sessão por endereço, o mesmo do limite geral. */
const LIMITE_DAS_SESSOES_RECUSADAS = 600;
/** Quantos endereços o contador das recusas guarda antes de recomeçar. */
const ENDERECOS_CONTADOS = 10_000;

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

/**
 * A sessão que não vale mais. A encerrada leva o motivo do fim, para a aba que perdeu o evento não
 * pedir outra sozinha depois de 'outra-sessao-no-aparelho'; a vencida e a desconhecida vão sem.
 */
export const sessaoDaAbaRecusada = (motivoDoFim?: string) =>
  new ProblemaDaApi({
    codigo: 'sessao-da-aba-recusada',
    status: 401,
    titulo: 'Sessão da aba terminada',
    detalhe: 'A sessão da aba terminou.',
    ...(motivoDoFim ? { extras: { motivoDoFim } } : {}),
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

/**
 * O nome do computador que cabe no registro: de 1 a 63 caracteres, sem os de controle, que sairiam
 * no terminal de quem roda o `grafite aba aparelhos`.
 */
export function nomeDoComputadorValido(nome: string): boolean {
  const visivel = [...nome].every(
    (caractere) => caractere >= ' ' && (caractere < '\u007f' || caractere > '\u009f'),
  );
  return nome.length >= 1 && nome.length <= 63 && visivel;
}

/** O nome do computador informado no cabeçalho, quando ele cabe no registro. */
export function computadorDoCabecalho(cabecalho: string | string[] | undefined): string | null {
  const nome = primeiro(cabecalho);
  return nomeDoComputadorValido(nome) ? nome : null;
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
    origem,
    momento,
    dados,
  }: {
    acao: 'chave-da-aba.recusada' | 'token-da-aba.recusado';
    origem: { ip: string; codigoDeRastreio: string };
    momento: Date;
    dados?: Record<string, unknown>;
  },
) {
  const { ip } = origem;
  const desde = new Date(momento.getTime() - INTERVALO_DA_RECUSA_NA_AUDITORIA);
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
    origem,
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
  escopo.decorateRequest('sessaoDaAba', null);
  const recusas = new ContadorDeRecusas(LIMITE_DA_ENTRADA.max, LIMITE_DA_ENTRADA.timeWindow);
  // As recusas do token desconhecido da sessão, com o limite geral: o sorteio de tokens espera, e a
  // vencida e a encerrada, que já valeram, não contam, para a aba presa num laço com um token antigo
  // não segurar as sessões que valem da filial atrás do mesmo NAT.
  const recusasDaSessao = new ContadorDeRecusas(LIMITE_DAS_SESSOES_RECUSADAS, MINUTO);
  escopo.addHook('onRequest', async (requisicao) => {
    if (requisicao.routeOptions.config?.semTokenDaAba) return;
    const token = tokenDoCabecalho(requisicao.headers.authorization);
    const orgId = requisicao.organizacao?.id;
    if (!orgId) throw tokenDaAbaRecusado();
    const momento = agora();
    if (requisicao.routeOptions.config?.daSessaoDaAba) {
      // A sessão vencida é rotina: a recusa dela fica fora da auditoria e conta no limite geral.
      const espera = recusasDaSessao.espera(requisicao.ip, momento.getTime());
      if (espera !== null) throw muitasRecusas(espera);
      const daSessao = token ? await sessaoDoToken(banco, orgId, token, momento) : null;
      if (daSessao === 'bloqueado') throw aparelhoBloqueado();
      if (!daSessao || 'encerrada' in daSessao) {
        if (!daSessao) recusasDaSessao.contar(requisicao.ip, momento.getTime());
        throw sessaoDaAbaRecusada(daSessao?.encerrada ?? undefined);
      }
      requisicao.sessaoDaAba = daSessao.sessao;
      requisicao.aparelhoDaAba = daSessao.aparelho;
      return;
    }
    const hash = token ? hashDoToken(token) : null;
    const espera = recusas.espera(requisicao.ip, momento.getTime());
    // O token que valeu há pouco passa: o computador registrado de novo não espera atrás das
    // recusas dos outros do mesmo endereço, como na filial atrás de um NAT.
    if (
      espera !== null &&
      !(hash && recusas.valeu(hash.toString('base64url'), momento.getTime()))
    ) {
      throw muitasRecusas(espera);
    }
    const achado = await naOrganizacao(banco, orgId, async (tx) => {
      const [linha] = hash
        ? await tx.select().from(aparelhosDaAba).where(eq(aparelhosDaAba.tokenHash, hash))
        : [];
      if (!linha) {
        await auditarRecusa(tx, {
          acao: 'token-da-aba.recusado',
          origem: origemDa(requisicao),
          momento,
        });
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
    if (achado === 'recusado') {
      recusas.contar(requisicao.ip, momento.getTime());
      throw tokenDaAbaRecusado();
    }
    if (achado === 'bloqueado') throw aparelhoBloqueado();
    if (hash) recusas.lembrar(hash.toString('base64url'), momento.getTime());
    requisicao.aparelhoDaAba = achado;
  });
}

export const muitasRecusas = (esperaMs: number) =>
  new ProblemaDaApi({
    codigo: 'muitas-requisicoes',
    status: 429,
    titulo: 'Muitas requisições',
    detalhe: `Muitas requisições. Tente de novo em ${Math.max(1, Math.ceil(esperaMs / 1000))} s.`,
  });

/**
 * As recusas do token por endereço, numa janela fixa: o limite por token não conta o token que não
 * vale, e a rota com o próprio limite fica sem o geral.
 */
export class ContadorDeRecusas {
  readonly #porEndereco = new Map<string, { inicio: number; quantas: number }>();
  /** Os hashes dos tokens que valeram, com até quando passam pelo limite das recusas. */
  readonly #validos = new Map<string, number>();

  readonly maximo: number;
  readonly janela: number;

  constructor(maximo: number, janela: number) {
    this.maximo = maximo;
    this.janela = janela;
  }

  /** Quanto falta para o endereço tentar de novo, ou `null` quando ele ainda pode. */
  espera(endereco: string, agora: number): number | null {
    const conta = this.#porEndereco.get(endereco);
    if (!conta) return null;
    const fim = conta.inicio + this.janela;
    if (agora >= fim) {
      this.#porEndereco.delete(endereco);
      return null;
    }
    return conta.quantas >= this.maximo ? fim - agora : null;
  }

  /** O token que valeu nos últimos 10 minutos. */
  valeu(hash: string, agora: number): boolean {
    const ate = this.#validos.get(hash);
    if (ate === undefined) return false;
    if (agora < ate) return true;
    this.#validos.delete(hash);
    return false;
  }

  lembrar(hash: string, agora: number) {
    if (this.#validos.size >= ENDERECOS_CONTADOS && !this.#validos.has(hash)) this.#validos.clear();
    this.#validos.set(hash, agora + INTERVALO_DA_RECUSA_NA_AUDITORIA);
  }

  contar(endereco: string, agora: number) {
    const conta = this.#porEndereco.get(endereco);
    if (conta && agora < conta.inicio + this.janela) {
      conta.quantas++;
      return;
    }
    if (this.#porEndereco.size >= ENDERECOS_CONTADOS) this.#porEndereco.clear();
    this.#porEndereco.set(endereco, { inicio: agora, quantas: 1 });
  }
}

/**
 * A sessão aberta e dentro da validade do token, com o aparelho dela; `{ encerrada }` com o motivo
 * do fim, `null` na vencida ou `'sem-uso'` na da senha parada há 30 minutos, que este encerra,
 * antes de olhar o bloqueio, porque o pedido seguinte, com o token do aparelho, já dá o 403;
 * `'bloqueado'` com a sessão válida no aparelho bloqueado; ou `null` com o token desconhecido.
 */
async function sessaoDoToken(
  banco: Banco,
  orgId: string,
  token: string,
  momento: Date,
): Promise<
  | { sessao: SessaoDaRequisicao; aparelho: AparelhoDaRequisicao }
  | { encerrada: string | null }
  | 'bloqueado'
  | null
> {
  const [linha] = await naOrganizacao(banco, orgId, (tx) =>
    tx
      .select({ sessao: sessoesDaAba, aparelho: aparelhosDaAba })
      .from(sessoesDaAba)
      .innerJoin(
        aparelhosDaAba,
        and(
          eq(aparelhosDaAba.orgId, sessoesDaAba.orgId),
          eq(aparelhosDaAba.id, sessoesDaAba.aparelhoId),
        ),
      )
      .where(
        and(eq(sessoesDaAba.tokenHash, hashDoToken(token)), isNotNull(sessoesDaAba.ativadaEm)),
      ),
  );
  if (!linha) return null;
  if (linha.sessao.encerradaEm !== null) return { encerrada: linha.sessao.motivoDoFim };
  if (linha.sessao.expiraEm <= momento) return { encerrada: null };
  // A da entrada pela senha termina com 30 minutos sem uso, contados aqui pelo último uso: o
  // computador desligado também a tem vencida (decisão 2).
  if (
    linha.sessao.entrada === 'senha' &&
    linha.sessao.ultimoUsoEm.getTime() + SEM_USO_DA_SENHA <= momento.getTime()
  ) {
    await naOrganizacao(banco, orgId, async (tx) => {
      await tx
        .update(sessoesDaAba)
        .set({ encerradaEm: momento, motivoDoFim: 'sem-uso' })
        .where(and(eq(sessoesDaAba.id, linha.sessao.id), isNull(sessoesDaAba.encerradaEm)));
      await encerrarChatsDaAba(tx, [linha.sessao.id], momento);
    });
    return { encerrada: 'sem-uso' };
  }
  if (linha.aparelho.bloqueadoEm !== null) return 'bloqueado';
  const { sessao, aparelho } = linha;
  return {
    sessao: {
      id: sessao.id,
      contaId: sessao.contaId,
      entrada: sessao.entrada,
      expiraEm: sessao.expiraEm,
    },
    aparelho: {
      id: aparelho.id,
      nome: aparelho.nome,
      identificadorCurto: aparelho.identificadorCurto,
      entrada: aparelho.entrada,
      tetoDeContas: aparelho.tetoDeContas,
    },
  };
}
