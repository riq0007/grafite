// As falhas depois de parar os serviços (spec operacao-servicos, "Atualização pelo teste antes da
// produção"; design do F2d, decisões 7, 8 e 16): os serviços ficam parados, e a mensagem diz o que
// falhou, o que ficou parado e a seção do runbook com o que fazer.
import { NO_SERVIDOR, type Plataforma } from './layout.ts';
import type { Servicos } from './windows/servicos.ts';

/** O runbook da operação, no pacote e no repositório. */
export const RUNBOOK = NO_SERVIDOR.windows.runbook;

/** A indicação de uma seção do runbook, no caminho do pacote da plataforma. */
export const vejaNoRunbook = (secao: string, plataforma: Plataforma = 'windows') =>
  `Veja "${secao}" no runbook (${NO_SERVIDOR[plataforma].runbook}).`;

/** A mensagem de um erro qualquer. */
export const mensagemDe = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

/**
 * Para os serviços, na ordem, e roda os passos. Uma falha os deixa parados, mesmo os que um passo
 * tinha iniciado, e soma ao erro o que ficou parado e o que fazer.
 */
export async function comServicosParados(
  servicos: Servicos,
  ids: readonly string[],
  oQueFazer: string,
  passos: () => Promise<void>,
): Promise<void> {
  try {
    for (const id of ids) await servicos.parar(id);
    await passos();
  } catch (erro) {
    for (const id of ids) await servicos.parar(id).catch(() => {});
    throw new Error(`${mensagemDe(erro)}\n${oQueFazer}`, { cause: erro });
  }
}
