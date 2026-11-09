// O catálogo de tarefas (spec fila-de-tarefas; design do F2c, decisão 14): cada tarefa tem o nome
// técnico, que é o da fila, o nome em pt-BR, o esquema dos dados (só identificadores), o trabalho e
// as opções da fila. Uma tarefa nova é uma entrada aqui.
import type { Banco, Transacao } from '@grafite/db';
import type { Queue } from 'pg-boss';
import type { z } from 'zod';
import { tarefasDosIndicadores } from '../alertas/indicadores-diarios.ts';
import { tarefasDosAlertas } from '../alertas/tarefas.ts';
import type { Armazenamento } from '../arquivos/armazenamento.ts';
import type { CanaisDaApi } from '../canais/canais.ts';
import { tarefasDoControlId } from '../controlid/tarefa.ts';
import { tarefaDaImportacao } from '../importacao/tarefa.ts';
import { tarefasDaEntrega } from '../notificacoes/entrega.ts';
import { tarefasDoResumo } from '../notificacoes/resumo.ts';
import { tarefasDosPaineis } from '../paineis/paineis.ts';
import { tarefaDasFalhas } from './falhas.ts';
import { tarefasDaManutencao } from './manutencao.ts';

/** A tarefa que falhou em todas as tentativas, quando quem a recebe é a fila das falhas. */
export interface FalhaDeOrigem {
  /** O nome técnico da tarefa que falhou. */
  tarefa: string;
  /** O identificador dela na fila: o código que o log mostra. */
  codigo: string;
  /** Quantas vezes ela rodou. */
  tentativas: number;
  /** O que ela deixou ao falhar, em geral o erro. */
  erro: unknown;
}

/** O que o trabalho recebe além dos dados. */
export interface ContextoDaTarefa {
  /** O identificador da tarefa na fila, para o log. */
  tarefaId: string;
  /** Quantas vezes ela já foi tentada antes desta. */
  tentativa: number;
  /** Avisa que a tarefa foi interrompida, como no encerramento da API: o trabalho para logo. */
  sinal: AbortSignal;
  /** Na fila das falhas, a tarefa que falhou. */
  origem?: FalhaDeOrigem;
}

export interface DefinicaoDeTarefa<D = unknown> {
  /** O nome técnico, que é o nome da fila. */
  nome: string;
  /** Como a tela e o log chamam a tarefa. */
  rotulo: string;
  /** Os dados da tarefa: só identificadores. */
  dados: z.ZodType<D>;
  /** Um método, e não uma propriedade, para o catálogo aceitar tarefas de dados diferentes. */
  trabalho(dados: D, contexto: ContextoDaTarefa): Promise<void>;
  /** As tentativas, as esperas e o destino das falhas da fila; nunca com tabela própria. */
  opcoes?: Omit<Queue, 'name' | 'partition'>;
  /** A tarefa que roda sozinha, num horário; a execução perdida, como a de um servidor parado, roda uma vez. */
  agenda?: { cron: string; fuso: string };
  /**
   * Como a tela das tarefas mostra a tarefa agendada: o nome da rotina e o que ela faz (change
   * regras-indicadores-e-tarefas, design, decisão 4).
   */
  rotina?: { nome: string; descricao: string };
  /**
   * O que a tarefa grava quando falha em todas as tentativas, como a importação "Com falha": a fila
   * das falhas chama, com os dados conferidos, na transação em que põe a tarefa na lista.
   */
  aoFalhar?(dados: D, tx: Transacao): Promise<void>;
}

/** Opções de quem põe uma tarefa na fila. */
export interface OpcoesDoEnvio {
  /** Só uma tarefa com esta chave entra na fila... */
  chaveUnica?: string;
  /** ...dentro de uma janela deste tamanho, em segundos, mesmo depois de terminada. */
  unicaPor?: number;
  /** A transação em que ela entra: se a transação é desfeita, a tarefa não entra. */
  tx?: Transacao;
}

/** Põe uma tarefa na fila: o que as tarefas e quem notifica usam da fila. */
export type EnviarTarefa = (
  tarefa: string,
  dados: unknown,
  opcoes?: OpcoesDoEnvio,
) => Promise<string | null>;

/** O que as tarefas da API usam: o banco, o armazenamento, o relógio, o log e a própria fila. */
export interface ContextoDasTarefas {
  banco: Banco;
  armazenamento: Armazenamento;
  agora: () => Date;
  log: {
    info(dados: object, mensagem: string): void;
    warn(dados: object, mensagem: string): void;
    error(dados: object, mensagem: string): void;
  };
  enviar: EnviarTarefa;
  /** Os canais de fora que enviam neste ambiente (change p3c-email-e-push). */
  canais?: CanaisDaApi;
}

/** As tarefas da API. */
export function tarefasDaApi(contexto: ContextoDasTarefas): DefinicaoDeTarefa[] {
  const outras: DefinicaoDeTarefa[] = [
    ...tarefasDaManutencao(contexto),
    tarefaDaImportacao(contexto) as DefinicaoDeTarefa,
    ...tarefasDosAlertas(contexto),
    ...tarefasDosIndicadores(contexto),
    ...tarefasDaEntrega(contexto),
    ...tarefasDoResumo(contexto),
    ...tarefasDoControlId(contexto),
    ...tarefasDosPaineis(contexto),
  ];
  return [tarefaDasFalhas(contexto, outras), ...outras];
}
