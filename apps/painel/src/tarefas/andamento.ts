// O andamento da tarefa pelos eventos do servidor (change painel-da-operacao, design, decisão 3): a
// tarefa que roda ou a última, as linhas que o comando escreveu, a pergunta que espera a resposta e
// o fim, com o resultado. A recusa de um pedido, como o de uma tarefa que espera outra, também fica
// aqui, para o painel da tarefa mostrar.
import { useCallback, useEffect, useState } from 'react';
import type { ApiDoPainel, EventoDoPainel } from '../api/tipos.ts';

export type PerguntaDaTarefa = Extract<EventoDoPainel, { tipo: 'pergunta' }>;

export interface Andamento {
  tarefa: string | null;
  rodando: boolean;
  /** As linhas do comando, cada uma com o número dela na tarefa. */
  linhas: { numero: number; texto: string; erro: boolean }[];
  pergunta: PerguntaDaTarefa | null;
  fim: { codigo: number; resultado: string } | null;
  recusa: string | null;
}

const VAZIO: Andamento = {
  tarefa: null,
  rodando: false,
  linhas: [],
  pergunta: null,
  fim: null,
  recusa: null,
};

/** O andamento depois de um evento. */
export function aplicarEvento(atual: Andamento, evento: EventoDoPainel): Andamento {
  switch (evento.tipo) {
    case 'inicio':
      return { ...VAZIO, tarefa: evento.tarefa, rodando: true };
    case 'andamento':
      return {
        ...atual,
        linhas: [
          ...atual.linhas,
          { numero: atual.linhas.length, texto: evento.texto, erro: evento.erro === true },
        ],
      };
    case 'pergunta':
      return { ...atual, pergunta: evento };
    case 'respondida':
      return atual.pergunta?.id === evento.id ? { ...atual, pergunta: null } : atual;
    case 'fim':
      return {
        ...atual,
        rodando: false,
        pergunta: null,
        fim: { codigo: evento.codigo, resultado: evento.resultado },
      };
  }
}

/** O andamento da tarefa, pelos eventos da API; o fim de cada tarefa chama o aoTerminar. */
export function useAndamento(api: ApiDoPainel, aoTerminar: () => void) {
  const [andamento, setAndamento] = useState<Andamento>(VAZIO);
  useEffect(
    () =>
      api.eventos((evento) => {
        setAndamento((atual) => aplicarEvento(atual, evento));
        if (evento.tipo === 'fim') aoTerminar();
      }),
    [api, aoTerminar],
  );
  const recusar = useCallback((recusa: string) => {
    setAndamento((atual) => ({ ...atual, recusa }));
  }, []);
  const fechar = useCallback(() => {
    setAndamento((atual) => (atual.rodando ? atual : VAZIO));
  }, []);
  return { andamento, recusar, fechar };
}
