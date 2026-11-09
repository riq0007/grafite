// As tarefas com falha (spec fila-de-tarefas; design do F2c, decisão 15): a tarefa que falha em
// todas as tentativas vai para a fila das falhas, que a grava na lista da organização dela, com o
// evento para quem administra as tarefas. A tarefa da instalação, sem organização, vai para o log,
// com o código e o erro. O erro é a mensagem, cortada em 500 caracteres, sem a pilha. A tarefa que
// diz o que gravar quando falha de vez, como a importação, o grava na mesma transação.
import { naOrganizacao, tarefasComFalha } from '@grafite/db';
import { z } from 'zod';
import { registrarEvento } from '../eventos/saida.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from './tarefas.ts';

export const FILA_DAS_FALHAS = 'tarefas-com-falha';

const TAMANHO_DO_ERRO = 500;

/** A mensagem do erro que a tarefa deixou, sem a pilha, em até 500 caracteres. */
export function mensagemDoErro(erro: unknown): string {
  const mensagem =
    typeof erro === 'object' && erro !== null && 'message' in erro
      ? String((erro as { message: unknown }).message)
      : typeof erro === 'string'
        ? erro
        : '';
  return (mensagem.trim() || 'A tarefa falhou sem dizer o motivo.').slice(0, TAMANHO_DO_ERRO);
}

/** Os dados da tarefa que falhou, só identificadores; os da tarefa agendada são `null`. */
type DadosDaFalha = Record<string, unknown> | null;

export function tarefaDasFalhas(
  { banco, agora, log }: ContextoDasTarefas,
  catalogo: readonly DefinicaoDeTarefa[] = [],
): DefinicaoDeTarefa<DadosDaFalha> {
  return {
    nome: FILA_DAS_FALHAS,
    rotulo: 'Registro das tarefas com falha',
    dados: z.record(z.string(), z.unknown()).nullable(),
    // A falha chega à lista mesmo com o banco fora por um tempo: as tentativas da manutenção.
    opcoes: { retryLimit: 5, retryDelay: 60, retryBackoff: true, retryDelayMax: 60 * 60 },
    async trabalho(dados, { origem, tarefaId }) {
      if (!origem) {
        log.warn({ codigo: tarefaId }, 'tarefa na fila das falhas sem a tarefa de origem');
        return;
      }
      const erro = mensagemDoErro(origem.erro);
      const orgId = typeof dados?.orgId === 'string' ? dados.orgId : null;
      if (!orgId) {
        log.error(
          { tarefa: origem.tarefa, codigo: origem.codigo, erro },
          'tarefa da instalação com falha',
        );
        return;
      }
      await naOrganizacao(banco, orgId, async (tx) => {
        const [falha] = await tx
          .insert(tarefasComFalha)
          .values({
            orgId,
            tarefa: origem.tarefa,
            dados: dados ?? {},
            tentativas: origem.tentativas,
            erro,
            falhouEm: agora(),
          })
          .returning({ id: tarefasComFalha.id });
        await registrarEvento(tx, {
          tipo: 'tarefas.mudaram',
          alvo: { tipo: 'tarefa', id: falha?.id ?? null },
          publico: { permissao: 'tarefas.administrar' },
        });
        const daOrigem = catalogo.find((tarefa) => tarefa.nome === origem.tarefa);
        const lidos = daOrigem?.dados.safeParse(dados);
        if (daOrigem?.aoFalhar && lidos?.success) await daOrigem.aoFalhar(lidos.data, tx);
      });
    },
  };
}
