// A abertura da conversa do chamado gravada pelo chat (spec modulo-chat, "Abertura do chamado
// gravada pelo chat"; spec chamados, "Resposta por ver"; change aba-dos-colaboradores, design,
// decisão 5): a conversa que aparece à vista, com a página visível e o foco, grava a abertura, e de
// novo a mensagem de outra pessoa que chega com ela à vista. Lida sem o foco, não grava: a gravação
// espera a conversa aparecer. A abertura tira só a resposta por ver, e a API manda o evento à pessoa;
// a falha fica calada, e a próxima aparição grava de novo.
import { useEffect, useRef } from 'react';
import { useApi } from '../api/useApi.tsx';
import type { ConversaDoChamadoNoChat } from './consultas.ts';

/** A última mensagem da conversa escrita por outra pessoa, ou nenhuma. */
export function ultimaDeOutraPessoa(conversa: ConversaDoChamadoNoChat['conversa']): string | null {
  for (let i = conversa.length - 1; i >= 0; i--) {
    const item = conversa[i];
    if (item?.especie === 'mensagem' && !item.autor.minha) return item.id;
  }
  return null;
}

export function useAberturaDoChamado(
  { numero, conversa }: Pick<ConversaDoChamadoNoChat, 'numero' | 'conversa'>,
  aVista: boolean,
) {
  const api = useApi();
  const ultima = ultimaDeOutraPessoa(conversa);
  // O que já foi gravado nesta aparição: o chamado e a última mensagem de outra pessoa.
  const gravada = useRef<string | null>(null);
  useEffect(() => {
    if (!aVista) {
      gravada.current = null;
      return;
    }
    const chave = `${numero} ${ultima ?? ''}`;
    if (gravada.current === chave) return;
    gravada.current = chave;
    api
      .POST('/chat/chamados/{numero}/aberta', { params: { path: { numero } } })
      .catch(() => undefined);
  }, [api, aVista, numero, ultima]);
}
