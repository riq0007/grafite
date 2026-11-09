// O cliente da API na web (design do F2a, decisão 12): o do @grafite/api-client, pelo prefixo /api,
// com o token CSRF da sessão nas escritas e o aviso à sessão quando a API diz que ela não vale mais
// ou que o acesso dela mudou.
import { criarClienteDaApi, type Problema } from '@grafite/api-client';
import { type TransportarEnvio, transportarPeloFetch, transportarPeloNavegador } from './envio.ts';
import type { RespostaDaApi } from './pedir.ts';
import { CABECALHO_DO_SEGUNDO_PLANO } from './segundoPlano.ts';

export type { Problema };

const PREFIXO_DO_PROBLEMA = 'urn:grafite:problema:';
const LEITURAS = new Set(['GET', 'HEAD']);

export interface OpcoesDoCliente {
  /** O token CSRF da sessão atual, ou `null` sem sessão. */
  csrf: () => string | null;
  /** A API respondeu `sem-sessao`: a sessão terminou (expirou, foi encerrada ou redefinida). */
  aoPerderASessao: () => void;
  /**
   * A API recusou pela pendência ou pela falta de permissão: o acesso da sessão mudou desde a
   * última validação (um perfil novo que exige os dois passos, uma permissão retirada).
   */
  aoMudarOAcesso: () => void;
  /**
   * Se o usuário não interage com a página há 5 min ou mais: a requisição sai marcada, e a API
   * não a conta como uso da sessão (design do F2c, decisão 13).
   */
  emSegundoPlano?: () => boolean;
  /** O fetch do navegador; os testes passam um simulado, e os envios passam por ele. */
  buscar?: (pedido: Request) => Promise<Response>;
  /** O envio dos arquivos; sem ele, o XMLHttpRequest do navegador, ou o `buscar` dos testes. */
  transportarEnvio?: TransportarEnvio;
}

export type ClienteDaApi = ReturnType<typeof criarCliente>;

/** O corpo já lido de uma resposta de erro, se for um problem+json da API; outro corpo é nulo. */
export function comoProblema(corpo: unknown): Problema | null {
  const tipo = (corpo as Partial<Problema> | null | undefined)?.type;
  return typeof tipo === 'string' && tipo.startsWith(PREFIXO_DO_PROBLEMA)
    ? (corpo as Problema)
    : null;
}

/** Lê o corpo problem+json de uma resposta de erro; outra resposta (um proxy, por exemplo) é nula. */
export async function lerProblema(resposta: Response): Promise<Problema | null> {
  try {
    return comoProblema(await resposta.json());
  } catch {
    return null;
  }
}

/** O código do problema, como `sem-sessao` ou `credenciais-invalidas`. */
export function codigoDoProblema(
  problema: Pick<Problema, 'type'> | null | undefined,
): string | null {
  return problema?.type.startsWith(PREFIXO_DO_PROBLEMA)
    ? problema.type.slice(PREFIXO_DO_PROBLEMA.length)
    : null;
}

/** As recusas que dizem que o acesso da sessão mudou, como o módulo que a organização desligou. */
const ACESSO_MUDOU = new Set(['pendencia', 'sem-permissao', 'modulo-desligado']);

export function criarCliente({
  csrf,
  aoPerderASessao,
  aoMudarOAcesso,
  emSegundoPlano = () => false,
  buscar,
  transportarEnvio = buscar ? transportarPeloFetch(buscar) : transportarPeloNavegador,
}: OpcoesDoCliente) {
  /** A resposta que diz que a sessão terminou ou que o acesso mudou avisa a sessão. */
  async function conferir(response: Response) {
    if (response.status === 401) {
      const problema = await lerProblema(response.clone());
      if (codigoDoProblema(problema) === 'sem-sessao') aoPerderASessao();
    }
    if (response.status === 403) {
      const codigo = codigoDoProblema(await lerProblema(response.clone()));
      if (codigo !== null && ACESSO_MUDOU.has(codigo)) aoMudarOAcesso();
    }
  }

  const cliente = criarClienteDaApi('/api', { fetch: buscar });
  cliente.use({
    onRequest({ request }) {
      const token = csrf();
      if (!LEITURAS.has(request.method) && token) request.headers.set('x-grafite-csrf', token);
      if (emSegundoPlano()) request.headers.set(CABECALHO_DO_SEGUNDO_PLANO, '1');
      return request;
    },
    async onResponse({ response }) {
      await conferir(response);
      return response;
    },
  });

  /**
   * Envia um arquivo num PUT, como a foto de uma pessoa (`/pessoas/<id>/foto`), ou num POST, como a
   * planilha que cria uma importação, com o progresso do envio. A resposta vem como a das outras
   * requisições, para o `pedir()`.
   */
  async function enviarArquivo<T>(
    caminho: string,
    arquivo: Blob,
    aoProgredir: (percentual: number) => void,
    metodo: 'PUT' | 'POST' = 'PUT',
  ): Promise<RespostaDaApi<T>> {
    const token = csrf();
    const response = await transportarEnvio({
      metodo,
      endereco: `/api${caminho}`,
      corpo: arquivo,
      // O formato é conferido pelo conteúdo, e não pelo tipo que o navegador informa.
      cabecalhos: {
        'content-type': 'application/octet-stream',
        ...(token && { 'x-grafite-csrf': token }),
      },
      aoProgredir,
    });
    await conferir(response);
    const corpo: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    return response.ok ? { data: corpo as T, response } : { error: corpo, response };
  }

  return Object.assign(cliente, { enviarArquivo });
}
