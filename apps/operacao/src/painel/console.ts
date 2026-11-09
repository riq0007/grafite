// O console do painel (change painel-da-operacao, design, decisão 3): o mesmo contrato do console do
// terminal, para o painel rodar o mesmo executarComando. O escrever vira um evento de andamento; as
// perguntas e as confirmações viram eventos de pergunta, que a página mostra num diálogo e responde
// por um POST, enquanto o comando espera; o cancelar responde como o Ctrl+C. A resposta de uma
// senha nunca volta em evento, e nada do que é respondido vai para o log.
// O canal guarda os eventos da tarefa em curso, para a página que conecta no meio dela, e os
// entrega pelo SSE.
import { randomUUID } from 'node:crypto';
import type { Console } from '../windows/console.ts';
import type { PedidoDaApi } from './servidor.ts';

export type EventoDoPainel =
  | { tipo: 'inicio'; tarefa: string }
  | { tipo: 'andamento'; tarefa: string; texto: string; erro?: true }
  | {
      tipo: 'pergunta';
      tarefa: string;
      id: string;
      modo: 'texto' | 'segredo' | 'confirmacao';
      texto: string;
      padrao?: string;
      /** Na confirmação, o texto que precisa ser digitado, como o nome do banco. */
      esperado?: string;
    }
  | { tipo: 'respondida'; tarefa: string; id: string }
  | { tipo: 'fim'; tarefa: string; codigo: number; resultado: string };

export interface ConsoleDoPainel extends Console {
  /** A resposta da página a uma pergunta; `false` quando a pergunta não está esperando. */
  responder(id: string, resposta: string): boolean;
  /** Para a tarefa como o Ctrl+C: a pergunta em curso e as seguintes recusam com "Cancelado.". */
  cancelar(): void;
}

export function consoleDoPainel({
  tarefa,
  emitir,
}: {
  tarefa: string;
  emitir: (evento: EventoDoPainel) => void;
}): ConsoleDoPainel {
  const esperando = new Map<
    string,
    { resolver(resposta: string): void; recusar(erro: Error): void }
  >();
  let cancelado = false;

  const perguntar = (
    modo: 'texto' | 'segredo' | 'confirmacao',
    texto: string,
    extra: { padrao?: string; esperado?: string } = {},
  ) =>
    new Promise<string>((resolver, recusar) => {
      if (cancelado) {
        recusar(new Error('Cancelado.'));
        return;
      }
      const id = randomUUID();
      esperando.set(id, { resolver, recusar });
      emitir({ tipo: 'pergunta', tarefa, id, modo, texto, ...extra });
    });

  return {
    async perguntar(pergunta, padrao) {
      const resposta = (
        await perguntar('texto', pergunta, padrao === undefined ? {} : { padrao })
      ).trim();
      return resposta === '' && padrao !== undefined ? padrao : resposta;
    },

    async perguntarSegredo(pergunta) {
      return (await perguntar('segredo', pergunta)).trim();
    },

    async confirmarDigitado(pedido, esperado) {
      const digitado = (await perguntar('confirmacao', pedido, { esperado })).trim();
      if (digitado !== esperado) {
        throw new Error(`O texto digitado não confere com ${esperado}. Nada foi feito.`);
      }
    },

    escrever(texto) {
      emitir({ tipo: 'andamento', tarefa, texto });
    },

    responder(id, resposta) {
      const pergunta = esperando.get(id);
      if (pergunta === undefined) return false;
      esperando.delete(id);
      emitir({ tipo: 'respondida', tarefa, id });
      pergunta.resolver(resposta);
      return true;
    },

    cancelar() {
      cancelado = true;
      for (const [id, pergunta] of esperando) {
        esperando.delete(id);
        pergunta.recusar(new Error('Cancelado.'));
      }
    },
  };
}

export interface CanalDeEventos {
  emitir(evento: EventoDoPainel): void;
  /** Começa a história de uma tarefa nova. */
  comecar(tarefa: string): void;
  /** Os eventos da tarefa em curso ou da última. */
  historia(): EventoDoPainel[];
  /** Acompanha cada evento novo, como a janela do comando faz; devolve como parar. */
  ouvir(ouvinte: (evento: EventoDoPainel) => void): () => void;
  /** A rota do SSE: a história e, depois, cada evento novo, até a página fechar. */
  entregar(pedido: PedidoDaApi): Promise<'respondido'>;
}

/** De quanto em quanto tempo o SSE manda um comentário, para a conexão não cair parada. */
const BATIDA = 15_000;

export function canalDeEventos(): CanalDeEventos {
  let historia: EventoDoPainel[] = [];
  const ouvintes = new Set<(evento: EventoDoPainel) => void>();
  const emitir = (evento: EventoDoPainel) => {
    historia.push(evento);
    for (const ouvinte of ouvintes) ouvinte(evento);
  };
  return {
    emitir,
    comecar(tarefa) {
      historia = [];
      emitir({ tipo: 'inicio', tarefa });
    },
    historia: () => [...historia],
    ouvir(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    async entregar({ resposta }) {
      resposta.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      const enviar = (evento: EventoDoPainel) => {
        resposta.write(`data: ${JSON.stringify(evento)}\n\n`);
      };
      for (const evento of historia) enviar(evento);
      ouvintes.add(enviar);
      const batida = setInterval(() => resposta.write(': batida\n\n'), BATIDA);
      resposta.once('close', () => {
        clearInterval(batida);
        ouvintes.delete(enviar);
      });
      return 'respondido';
    },
  };
}
