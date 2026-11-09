// O escopo das rotas de acesso (design do F2a, decisão 6): cada requisição roda na organização do
// endereço, com a sessão do cookie já conferida, e as escritas passam pela proteção contra outros
// sites. As guardas dizem o que cada rota exige. Toda rota do escopo declara a permissão que exige
// ou a exceção que só pede a sessão (design do F2b, decisão 6), e a que não declara nem é registrada.
import { type Banco, naOrganizacao } from '@grafite/db';
import {
  type ArvoreDeLocais,
  descricaoDa,
  type Permissao,
  permissaoConhecida,
  pode,
  podeEm,
} from '@grafite/domain';
import type { FastifyInstance, FastifyRequest, RouteOptions } from 'fastify';
import { registrarNaAuditoria } from '../auditoria.ts';
import { ProblemaDaApi } from '../problemas.ts';
import { protegerEscritas } from '../protecao.ts';
import { nomesDosAdministradores } from './administradores.ts';
import { exigirOrganizacao, type ResolvedorDeOrganizacao } from './organizacao.ts';
import type { Pendencia } from './pendencia.ts';
import { lerSessao, NOME_DO_COOKIE, type SessaoDaRequisicao } from './sessoes.ts';

/**
 * As rotas que exigem só a sessão, e não uma permissão:
 * - `entrada`: as da sessão, que cada uma guarda com o passo que aceita;
 * - `propria-conta`: as de `/conta`, que cada uma guarda como precisa;
 * - `referencia`: as leituras que toda sessão ativa faz, como a árvore de locais. A guarda exige a
 *   sessão ativa.
 */
export const EXCECOES_DE_PERMISSAO = ['entrada', 'propria-conta', 'referencia'] as const;

/** A marca da requisição que a tela faz sem o usuário interagir há 5 min (design do F2c, decisão 13). */
export const CABECALHO_DO_SEGUNDO_PLANO = 'x-grafite-segundo-plano';
export type ExcecaoDePermissao = (typeof EXCECOES_DE_PERMISSAO)[number];

declare module 'fastify' {
  interface FastifyRequest {
    /** A sessão do cookie, se ela vale, nas rotas de acesso. */
    sessao: SessaoDaRequisicao | null;
  }

  interface FastifyContextConfig {
    /** A permissão que a rota exige, em algum escopo: a guarda confere antes de validar o pedido. */
    permissao?: Permissao;
    /** A rota que exige só a sessão. */
    semPermissao?: ExcecaoDePermissao;
    /** A rota que nunca conta como uso da sessão, como a conexão de eventos. */
    naoContaComoUso?: true;
  }
}

export interface DependenciasDoAcesso {
  banco: Banco;
  agora: () => Date;
  resolver: ResolvedorDeOrganizacao;
  /** O endereço de acesso da organização que opera o servidor (GRAFITE_ORGANIZACAO_OPERADORA). */
  organizacaoOperadora?: string;
}

export function instalarAcesso(
  escopo: FastifyInstance,
  { banco, agora, resolver, organizacaoOperadora }: DependenciasDoAcesso,
) {
  exigirOrganizacao(escopo, resolver, organizacaoOperadora);
  escopo.addHook('onRequest', async (requisicao) => {
    const token = requisicao.cookies[NOME_DO_COOKIE];
    const orgId = requisicao.organizacao?.id;
    // A requisição que a tela faz sozinha, sem o usuário interagir, e a conexão de eventos não
    // contam como uso da sessão.
    const tocar =
      requisicao.routeOptions.config?.naoContaComoUso !== true &&
      requisicao.headers[CABECALHO_DO_SEGUNDO_PLANO] !== '1';
    requisicao.sessao =
      token && orgId ? await lerSessao(banco, { orgId, token, agora: agora(), tocar }) : null;
  });
  protegerEscritas(escopo, { tokenEsperado: (requisicao) => requisicao.sessao?.tokenCsrf ?? null });
  escopo.addHook('onRoute', aplicarGuardas);

  // A recusa por falta de permissão entra na auditoria numa transação própria, que vale mesmo com
  // a transação da rota desfeita, e a resposta diz a quem pedir acesso. Os outros erros seguem para
  // o tratamento de erros da API.
  escopo.setErrorHandler(async (erro, requisicao) => {
    if (!(erro instanceof RecusaDePermissao)) throw erro;
    const { sessao } = requisicao;
    const administradores = await naOrganizacao(
      banco,
      requisicao.organizacao?.id ?? '',
      async (tx) => {
        await registrarNaAuditoria(tx, {
          acao: 'permissao.recusada',
          ator: sessao ? { tipo: 'conta', contaId: sessao.contaId } : { tipo: 'anonimo' },
          alvo: { tipo: 'rota' },
          dados: {
            permissao: erro.permissao,
            metodo: requisicao.method,
            rota: requisicao.routeOptions.url ?? requisicao.url,
            parametros: requisicao.params,
          },
          origem: { ip: requisicao.ip, codigoDeRastreio: requisicao.id },
          momento: agora(),
        });
        return nomesDosAdministradores(tx);
      },
    );
    throw new RecusaDePermissao(erro.permissao, administradores);
  });
}

/**
 * Confere a declaração da rota e, na que exige uma permissão ou é de referência, põe as guardas
 * antes da validação: a recusa vem antes de qualquer outra resposta, e nada da rota executa.
 */
function aplicarGuardas(rota: RouteOptions) {
  const { permissao, semPermissao } = rota.config ?? {};
  const nome = `A rota ${[rota.method].flat().join(', ')} ${rota.url}`;
  if (permissao !== undefined && semPermissao !== undefined) {
    throw new Error(`${nome} declara a permissão e a exceção ao mesmo tempo.`);
  }
  if (permissao === undefined && semPermissao === undefined) {
    throw new Error(
      `${nome} não declara a permissão que exige (config.permissao) nem a exceção (config.semPermissao).`,
    );
  }
  if (permissao !== undefined && !permissaoConhecida(permissao)) {
    throw new Error(`${nome} exige uma permissão fora do catálogo: ${permissao}.`);
  }
  if (semPermissao !== undefined && !EXCECOES_DE_PERMISSAO.includes(semPermissao)) {
    throw new Error(`${nome} declara uma exceção desconhecida: ${semPermissao}.`);
  }
  const guardas = permissao
    ? [exigirAtiva, exigirPermissao(permissao)]
    : semPermissao === 'referencia'
      ? [exigirAtiva]
      : [];
  if (guardas.length === 0) return;
  const existentes = rota.preValidation ?? [];
  rota.preValidation = [...guardas, ...(Array.isArray(existentes) ? existentes : [existentes])];
}

export const semSessao = () =>
  new ProblemaDaApi({
    codigo: 'sem-sessao',
    status: 401,
    titulo: 'Sem sessão',
    detalhe: 'Entre para continuar.',
  });

export const entradaPendente = (pendencia: Pendencia) =>
  new ProblemaDaApi({
    codigo: 'pendencia',
    status: 403,
    titulo: 'Entrada não concluída',
    detalhe: 'Conclua a entrada antes de continuar.',
    extras: { pendencia },
  });

/** "Você não tem permissão para <descrição>.", com a descrição do catálogo em minúscula. */
export function mensagemDeSemPermissao(permissao: Permissao): string {
  const descricao = descricaoDa(permissao);
  const inicio = descricao.charAt(0).toLocaleLowerCase('pt-BR');
  return `Você não tem permissão para ${inicio}${descricao.slice(1)}.`;
}

/**
 * A recusa por falta de permissão (403 `sem-permissao`). O escopo a registra na auditoria e
 * acrescenta os nomes de quem administra os acessos.
 */
export class RecusaDePermissao extends ProblemaDaApi {
  readonly permissao: Permissao;

  constructor(permissao: Permissao, administradores: readonly string[] = []) {
    super({
      codigo: 'sem-permissao',
      status: 403,
      titulo: 'Sem permissão',
      detalhe: mensagemDeSemPermissao(permissao),
      extras: { permissao, administradores },
    });
    this.name = 'RecusaDePermissao';
    this.permissao = permissao;
  }
}

/** A sessão que a guarda da rota já conferiu. */
export function sessaoDa(requisicao: FastifyRequest): SessaoDaRequisicao {
  if (!requisicao.sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
  return requisicao.sessao;
}

/** A rota exige uma sessão, pendente ou não. */
export async function exigirSessao(requisicao: FastifyRequest) {
  if (!requisicao.sessao) throw semSessao();
}

/** A rota exige uma sessão sem passo pendente. */
export async function exigirAtiva(requisicao: FastifyRequest) {
  if (!requisicao.sessao) throw semSessao();
  if (requisicao.sessao.pendencia) throw entradaPendente(requisicao.sessao.pendencia);
}

/** A conta tem a permissão em algum escopo. A rota que lê um registro com local usa o `exigirEm`. */
export function exigirPermissao(permissao: Permissao) {
  return async (requisicao: FastifyRequest) => {
    const { sessao } = requisicao;
    if (!sessao) throw semSessao();
    if (!pode(sessao.acesso, permissao)) throw new RecusaDePermissao(permissao);
  };
}

/**
 * O registro está no alcance da permissão: a rota confere depois de ler o registro, com o local
 * dele. O registro sem local (`null`) só é alcançado pela permissão da organização inteira.
 */
export function exigirEm(
  requisicao: FastifyRequest,
  permissao: Permissao,
  localId: string | null,
  arvore: Pick<ArvoreDeLocais, 'ancestrais'>,
) {
  const { sessao } = requisicao;
  if (!sessao) throw semSessao();
  if (!podeEm(sessao.acesso, permissao, localId, arvore)) throw new RecusaDePermissao(permissao);
}

/**
 * A rota resolve um passo pendente: só a sessão que espera esse passo a usa. A sessão que já vale
 * recebe `sem-pendencia`, e a que espera outro passo, o passo da vez.
 */
export function exigirPendencia(esperada: Pendencia) {
  return async (requisicao: FastifyRequest) => {
    const { sessao } = requisicao;
    if (!sessao) throw semSessao();
    if (sessao.pendencia === esperada) return;
    if (sessao.pendencia) throw entradaPendente(sessao.pendencia);
    throw new ProblemaDaApi({
      codigo: 'sem-pendencia',
      status: 409,
      titulo: 'Nada pendente',
      detalhe: 'A entrada já foi concluída.',
    });
  };
}

/** A rota serve à sessão que vale e à que espera este passo, como a troca da senha temporária. */
export function exigirAtivaOu(aceita: Pendencia) {
  return async (requisicao: FastifyRequest) => {
    const { sessao } = requisicao;
    if (!sessao) throw semSessao();
    if (sessao.pendencia !== null && sessao.pendencia !== aceita) {
      throw entradaPendente(sessao.pendencia);
    }
  };
}
