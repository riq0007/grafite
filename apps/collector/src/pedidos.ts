// Os pedidos ao coletor (spec coletor-local, "Pedidos ao coletor"; change p5a-backup-do-control-id,
// design, decisão 3): de 15 em 15 segundos, ou no prazo que a API der, o coletor busca os pedidos
// dos ativos que ele alcança e faz um por vez, respondendo com o ZIP ou com a falha. A busca que
// falha tenta de novo no mesmo prazo; o coletor parado não busca.
import type { RespostaDaApi } from './api.ts';
import {
  fazerBackup,
  type PedidoDeBackup,
  type ResultadoDoBackupNoColetor,
} from './backup-control-id.ts';
import type { Registro } from './configuracao.ts';
import {
  executarOperacao,
  type PedidoDeOperacao,
  type ResultadoDaOperacaoNoColetor,
} from './operacoes-control-id.ts';

/** Um pedido da API: o backup, ou uma operação no controle (change p5b-comparacao-e-restauracao). */
export type PedidoDoColetor = (PedidoDeBackup & { tipo: 'backup' }) | PedidoDeOperacao;

/** O prazo da busca quando a API não diz outro, em ms. */
const PRAZO = 15_000;

export interface ApiDosPedidos {
  pedidos: () => Promise<RespostaDaApi<{ pedidos: PedidoDoColetor[]; proximaEm?: number }>>;
  arquivoDoPedido: (id: string, conteudo: Buffer) => Promise<RespostaDaApi<unknown>>;
  falhaDoPedido: (id: string, mensagem: string) => Promise<RespostaDaApi<unknown>>;
  zipDoPedido: (id: string) => Promise<RespostaDaApi<Buffer>>;
  resultadoDoPedido: (id: string, categorias: unknown[]) => Promise<RespostaDaApi<unknown>>;
}

export function criarBuscaDePedidos({
  api,
  log,
  backup = (pedido) => fazerBackup(pedido),
  operacao = (pedido, zip) => executarOperacao(pedido, zip),
}: {
  api: ApiDosPedidos;
  log: Registro;
  backup?: (pedido: PedidoDeBackup) => Promise<ResultadoDoBackupNoColetor>;
  operacao?: (pedido: PedidoDeOperacao, zip: Buffer) => Promise<ResultadoDaOperacaoNoColetor>;
}) {
  /** Faz uma operação: baixa o ZIP do backup, fala com o controle e responde. */
  async function fazerOperacao(pedido: PedidoDeOperacao) {
    const zip = await api.zipDoPedido(pedido.id);
    if (zip.tipo !== 'ok') {
      return api.falhaDoPedido(pedido.id, 'O coletor não conseguiu baixar o backup da API.');
    }
    const feita = await operacao(pedido, zip.dados).catch(
      (erro: unknown): ResultadoDaOperacaoNoColetor => ({
        tipo: 'falha',
        mensagem: `O coletor falhou na operação: ${erro instanceof Error ? erro.message : String(erro)}`,
      }),
    );
    return feita.tipo === 'resultado'
      ? api.resultadoDoPedido(pedido.id, feita.categorias)
      : api.falhaDoPedido(pedido.id, feita.mensagem);
  }

  let proxima: ReturnType<typeof setTimeout> | null = null;
  /** Iniciada: a busca seguinte é marcada. Encerrando: o ciclo para no próximo pedido. */
  let ativa = false;
  let encerrando = false;
  let ciclo: Promise<void> | null = null;

  function marcar(espera: number) {
    if (!ativa) return;
    if (proxima) clearTimeout(proxima);
    proxima = setTimeout(() => void buscar(), espera);
  }

  /** Busca os pedidos e faz cada um; um ciclo por vez. */
  function buscar(): Promise<void> {
    ciclo ??= (async () => {
      let espera = PRAZO;
      try {
        const resposta = await api.pedidos();
        if (resposta.tipo !== 'ok') {
          if (resposta.tipo !== 'token-recusado') {
            log.warn(
              {
                motivo:
                  resposta.tipo === 'recusado' || resposta.tipo === 'indisponivel'
                    ? resposta.motivo
                    : '',
              },
              'falha ao buscar os pedidos',
            );
          }
          return;
        }
        if (resposta.dados.proximaEm) espera = resposta.dados.proximaEm * 1000;
        for (const pedido of resposta.dados.pedidos) {
          if (encerrando) break;
          if (pedido.tipo !== 'backup') {
            const respondida = await fazerOperacao(pedido);
            if (respondida.tipo === 'ok') log.info({ pedido: pedido.id }, 'operação respondida');
            else
              log.warn(
                { pedido: pedido.id, resposta: respondida.tipo },
                'a API não aceitou a operação',
              );
            continue;
          }
          const feito = await backup(pedido).catch(
            (erro: unknown): ResultadoDoBackupNoColetor => ({
              tipo: 'falha',
              mensagem: `O coletor falhou no backup: ${erro instanceof Error ? erro.message : String(erro)}`,
            }),
          );
          const enviada =
            feito.tipo === 'zip'
              ? await api.arquivoDoPedido(pedido.id, feito.conteudo)
              : await api.falhaDoPedido(pedido.id, feito.mensagem);
          if (enviada.tipo === 'ok') {
            log.info({ pedido: pedido.id, resultado: feito.tipo }, 'pedido respondido');
          } else {
            log.warn(
              { pedido: pedido.id, resposta: enviada.tipo },
              'a API não aceitou a resposta do pedido',
            );
          }
        }
      } catch (erro) {
        log.warn({ motivo: String(erro) }, 'falha nos pedidos');
      } finally {
        ciclo = null;
        marcar(espera);
      }
    })();
    return ciclo;
  }

  return {
    iniciar() {
      ativa = true;
      encerrando = false;
      void buscar();
    },
    buscar,
    async parar() {
      ativa = false;
      encerrando = true;
      if (proxima) clearTimeout(proxima);
      proxima = null;
      await ciclo;
    },
  };
}
