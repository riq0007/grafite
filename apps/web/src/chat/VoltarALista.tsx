// A seta de voltar das telas de um item no celular (spec modulo-chat, "Chat no celular"; change
// chat-com-chamados, design, decisão 15, "O celular"): a conversa, a direta, o chamado e a equipe
// ficam no lugar da lista, sem a barra de baixo, e a seta volta à lista da vista, pelo histórico
// quando a tela veio dela (`voltar.ts`). Também nos estados da tela, como "Abrindo a conversa…", para
// ninguém ficar preso nela. Fora do celular, a lista fica ao lado, e a seta não aparece.
import { BotaoDeIcone, usePostura } from '@grafite/ui';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { noChatDeAgora, useOndeEstaOChat } from './base.tsx';
import { enderecoDaVista, vistaDaTela } from './MolduraDoChat.tsx';
import estilos from './VoltarALista.module.css';
import { voltarParaALista } from './voltar.ts';

export function VoltarALista() {
  const roteador = useRouter();
  const onde = useOndeEstaOChat();
  const vista = useRouterState({ select: vistaDaTela });
  const celular = usePostura() === 'celular';
  if (!celular) return null;
  // A lista de onde o chat está: a do app ou a da janela do Chat da casca.
  const lista = noChatDeAgora(enderecoDaVista(vista ?? 'chat'), onde);
  return (
    <BotaoDeIcone
      icone={ChevronLeft}
      rotulo="Voltar à lista"
      comDica={false}
      className={estilos.voltar}
      onPress={() =>
        voltarParaALista(roteador.history, lista, (href) => {
          void roteador.navigate({ href, replace: true });
        })
      }
    />
  );
}

/**
 * O estado da tela de um item, como "Abrindo a conversa…" ou a falha: no celular, com a seta de
 * voltar no alto; fora dele, só o estado.
 */
export function EstadoComAVolta({ children }: { children: ReactNode }) {
  const celular = usePostura() === 'celular';
  if (!celular) return children;
  return (
    <div className={estilos.estado}>
      <div className={estilos.alto}>
        <VoltarALista />
      </div>
      {children}
    </div>
  );
}
