// Um pedido à API com a falha já em texto para a tela: a loja da sessão e as seções que falam com
// a API dizem o mesmo. Num erro do servidor, o texto traz o código de rastreio (spec
// plataforma-base), que a TI procura no log.
import { codigoDoProblema, comoProblema, type Problema } from './cliente.ts';

export const SEM_CONEXAO = 'Sem conexão com o servidor. Tente de novo.';

/** O que o cliente da API devolve: os dados, ou o corpo do erro, com a resposta. */
export interface RespostaDaApi<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Uma falha, com o texto para a tela e, quando a API respondeu, o problema e o código dele. */
export interface FalhaDoPedido {
  erro: string;
  problema: Problema | null;
  codigo: string | null;
}

/**
 * O serviço de fora que falhou, como o AD, o canal de e-mail ou a fila: a API escreveu o motivo
 * para a tela, e não é o erro inesperado, que só tem a mensagem genérica (spec plataforma-base).
 */
const DE_UM_SERVICO_DE_FORA = new Set([502, 503]);

/**
 * Faz o pedido e traduz a falha: sem resposta da API (ou com a de um proxy), "Sem conexão…"; num
 * erro do servidor, "Não foi possível <acao>." com o código de rastreio; numa recusa ou na falha de
 * um serviço de fora, o detalhe que a API escreveu.
 */
export async function pedir<T>(
  fazer: () => Promise<RespostaDaApi<T>>,
  acao: string,
): Promise<{ dados: T } | FalhaDoPedido> {
  let resposta: RespostaDaApi<T>;
  try {
    resposta = await fazer();
  } catch {
    return { erro: SEM_CONEXAO, problema: null, codigo: null };
  }
  if (resposta.response.ok) return { dados: resposta.data as T };
  const problema = comoProblema(resposta.error);
  if (!problema) return { erro: SEM_CONEXAO, problema: null, codigo: null };
  const erro =
    problema.status >= 500 && !DE_UM_SERVICO_DE_FORA.has(problema.status)
      ? `Não foi possível ${acao}. Informe à TI o código ${problema.codigoDeRastreio}.`
      : problema.detail;
  return { erro, problema, codigo: codigoDoProblema(problema) };
}
