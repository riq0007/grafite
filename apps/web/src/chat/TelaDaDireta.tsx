// A conversa direta que ainda não nasceu (spec chat, "Conversa direta"; change chat-com-chamados,
// design, decisão 15, "A caixa e o menu da mensagem"): a pessoa escolhida em "Nova conversa", com a
// foto e o nome no cabeçalho e a caixa, sem nenhuma mensagem. A primeira mensagem faz a conversa
// nascer, e a tela passa a ser a dela. A pessoa vem com a navegação; aberta sem ela, a tela pede a
// escolha de novo. Com a conversa já nascida, a tela vai a ela.
import { nomeNoChat } from '@grafite/domain';
import { Avatar, LugarDeSoltar } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';
import { miniaturasNoChat } from '../api/fotos.ts';
import { pedir } from '../api/pedir.ts';
import { useApi } from '../api/useApi.tsx';
import { useServidor } from '../sessao/useSessao.tsx';
import { useIrNoChat } from './base.tsx';
import { CaixaDoChat } from './CaixaDoChat.tsx';
import {
  CHAVE_DAS_CONVERSAS,
  CHAVE_DO_RESUMO_DO_CHAT,
  type ConversaAberta,
  useConversasDoChat,
} from './consultas.ts';
import { focarAoChegar } from './focoNaChegada.ts';
import { LinkDoChat } from './LinkDoChat.tsx';
import { rascunhoDaDireta } from './rascunhos.tsx';
import estilos from './TelaDaConversa.module.css';
import { ajudaDaCaixa } from './TelaDaConversa.tsx';
import { EstadoComAVolta, VoltarALista } from './VoltarALista.tsx';

/** A pessoa da direta, como a escolha em "Nova conversa" a passa na navegação. */
export type PessoaDaDireta = NonNullable<ConversaAberta['outra']>;

const NENHUM_DESLIGADO: readonly string[] = [];

export function TelaDaDireta({ conta, pessoa }: { conta: string; pessoa: PessoaDaDireta | null }) {
  const irNoChat = useIrNoChat();
  const api = useApi();
  const consultas = useQueryClient();
  const conversas = useConversasDoChat();
  const desligados = useServidor()?.modulosDesligados ?? NENHUM_DESLIGADO;
  const idDoNome = useId();
  const nascida = conversas.data?.recentes.find(
    ({ outra }) => outra?.conta.toLowerCase() === conta,
  )?.id;

  useEffect(() => {
    if (nascida) irNoChat(`/chat/c/${nascida}`, { replace: true });
  }, [nascida, irNoChat]);

  if (nascida || (!pessoa && conversas.isPending)) {
    return (
      <EstadoComAVolta>
        <p role="status" className={estilos.abrindo}>
          Abrindo a conversa…
        </p>
      </EstadoComAVolta>
    );
  }
  if (!pessoa) {
    return (
      <EstadoComAVolta>
        <div role="alert" className={estilos.naoEncontrada}>
          <p>Escolha a pessoa de novo em Nova conversa.</p>
          <LinkDoChat para="/chat">Ir para o Chat</LinkDoChat>
        </div>
      </EstadoComAVolta>
    );
  }

  const nome = nomeNoChat(pessoa.nome, pessoa.daTi);
  return (
    <section className={estilos.conversa} aria-labelledby={idDoNome}>
      <header className={estilos.cabecalho} data-sem-abas>
        <VoltarALista />
        <Avatar
          nome={pessoa.nome}
          imagens={miniaturasNoChat(pessoa.conta, pessoa.foto)}
          className={estilos.foto}
          decorativo
        />
        <div className={estilos.titulos}>
          <h2
            id={idDoNome}
            className={estilos.nome}
            tabIndex={-1}
            data-titulo-de-chegada="item"
            ref={focarAoChegar}
          >
            {nome}
          </h2>
        </div>
      </header>
      {/* A conversa que ainda não nasceu também é o lugar de soltar os anexos (tarefa 4.19). */}
      <LugarDeSoltar className={estilos.lugarDeSoltar}>
        <p className={estilos.semMensagens}>Nenhuma mensagem ainda.</p>
        <CaixaDoChat
          rascunho={rascunhoDaDireta(conta)}
          ajuda={ajudaDaCaixa({ tipo: 'direta', nome })}
          citar={!desligados.includes('chamados')}
          mandar={({ texto, anexos }) =>
            pedir(
              () =>
                api.POST('/chat/diretas/{conta}/mensagens', {
                  params: { path: { conta } },
                  body: { texto, anexos },
                }),
              'mandar a mensagem',
            )
          }
          aoEnviar={({ conversa }) => {
            void consultas.invalidateQueries({ queryKey: CHAVE_DAS_CONVERSAS });
            void consultas.invalidateQueries({ queryKey: CHAVE_DO_RESUMO_DO_CHAT });
            irNoChat(`/chat/c/${conversa.toLowerCase()}`, { replace: true });
          }}
        />
      </LugarDeSoltar>
    </section>
  );
}
