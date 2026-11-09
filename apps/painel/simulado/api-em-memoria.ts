// A API do painel em memória, para os testes da página (change painel-da-operacao, design, decisão
// 10): o mesmo executor de tarefas e o mesmo canal de eventos do comando de verdade, com o servidor
// de mentira do dominio.ts, sem HTTP.
import { tarefasComCanal } from '../../operacao/src/painel/painel.ts';
import { TAREFAS_DO_PAINEL } from '../../operacao/src/painel/tarefas.ts';
import { type ApiDoPainel, ErroDoPainel } from '../src/api/tipos.ts';
import { type CenarioSimulado, criarDominioSimulado } from './dominio.ts';

export function apiEmMemoria(cenario: CenarioSimulado = {}) {
  const dominio = criarDominioSimulado(cenario);
  const { canal, executor } = tarefasComCanal(dominio.rodar);
  const pedidas: { tarefa: string; campos: Record<string, string> }[] = [];
  const api: ApiDoPainel = {
    estado: async () => ({ ...dominio.estado(), tarefaEmAndamento: executor.emAndamento() }),
    tarefas: async () =>
      TAREFAS_DO_PAINEL.map(({ id, rotulo, campos, sensivel }) => ({
        id,
        rotulo,
        campos,
        sensivel: sensivel ?? false,
      })),
    async iniciar(tarefa, campos) {
      pedidas.push({ tarefa, campos });
      return executor.iniciar(tarefa, campos);
    },
    async responder(id, resposta) {
      if (!executor.responder(id, resposta)) {
        throw new ErroDoPainel(404, 'A pergunta não está mais esperando resposta.');
      }
    },
    cancelar: async () => executor.cancelar(),
    logs: async (servico, linhas, busca) =>
      dominio.logs(servico, { linhas, ...(busca ? { busca } : {}) }),
    pacotes: async () => dominio.pacotes(),
    backups: async () => dominio.backups(),
    configuracoes: async () => dominio.configuracoes(),
    eventos(aoReceber) {
      for (const evento of canal.historia()) aoReceber(evento);
      return canal.ouvir(aoReceber);
    },
  };
  return { api, dominio, pedidas, terminada: () => executor.terminada() };
}
