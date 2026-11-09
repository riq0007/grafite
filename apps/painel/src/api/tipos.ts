// O que o servidor do painel dá (change painel-da-operacao, design, decisões 3 a 5), pelos tipos do
// próprio comando de operação: a página e o servidor falam a mesma língua. Só tipos: nada do comando
// entra na página compilada.
import type { LogDoServico } from '../../../operacao/src/logs.ts';
import type { EventoDoPainel } from '../../../operacao/src/painel/console.ts';
import type {
  BackupsListados,
  ConfiguracoesDoServidor,
  EstadoDoPainel,
  PacoteDaVersao,
  TarefaDaPagina,
} from '../../../operacao/src/painel/painel.ts';

export type {
  BackupsListados,
  ConfiguracoesDoServidor,
  EstadoDoPainel,
  EventoDoPainel,
  LogDoServico,
  PacoteDaVersao,
  TarefaDaPagina,
};

export type ResultadoDoPedido = { iniciada: string } | { recusada: string };

/** A API do painel, pelo servidor de verdade ou pelo simulado em memória dos testes. */
export interface ApiDoPainel {
  estado(): Promise<EstadoDoPainel>;
  tarefas(): Promise<TarefaDaPagina[]>;
  /** Pede uma tarefa: ela começa, ou o painel diz por que não. */
  iniciar(tarefa: string, campos: Record<string, string>): Promise<ResultadoDoPedido>;
  responder(id: string, resposta: string): Promise<void>;
  cancelar(): Promise<void>;
  logs(servico: string, linhas: number, busca?: string): Promise<LogDoServico[]>;
  pacotes(): Promise<PacoteDaVersao[]>;
  backups(): Promise<BackupsListados[]>;
  configuracoes(): Promise<ConfiguracoesDoServidor>;
  /** Acompanha os eventos das tarefas, desde o começo da última; devolve como parar. */
  eventos(aoReceber: (evento: EventoDoPainel) => void): () => void;
}

/** A recusa do servidor do painel, com a mensagem dele. */
export class ErroDoPainel extends Error {
  readonly status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}
