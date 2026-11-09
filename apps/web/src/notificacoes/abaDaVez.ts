// A aba da vez dos avisos (spec notificacoes, "Aviso numa aba só"; change p3b-notificacoes-no-
// servidor, design, decisão 9): cada aba anuncia, num BroadcastChannel da origem, quando ganha o
// foco ou fica visível, e avisa quando fecha; as outras guardam a mais recente. Só a aba usada por
// último mostra o aviso de uma notificação. Sem anúncio de outra aba, a aba visível é a da vez.

export const CANAL_DAS_ABAS = 'grafite:avisos';

type MensagemDaAba =
  | { tipo: 'em-uso'; aba: string; momento: number }
  | { tipo: 'saiu'; aba: string };

export interface AbaDaVez {
  /** Esta aba é a usada por último, e o aviso aparece nela. */
  ehDaVez(): boolean;
  parar(): void;
}

export function vigiarAbaDaVez(janela: Window = window): AbaDaVez {
  const aba = crypto.randomUUID();
  let ultima: { aba: string; momento: number } | null = null;
  const canal =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CANAL_DAS_ABAS);
  const visivel = () => janela.document.visibilityState !== 'hidden';
  const anunciar = () => {
    if (!visivel()) return;
    const momento = Date.now();
    ultima = { aba, momento };
    canal?.postMessage({ tipo: 'em-uso', aba, momento } satisfies MensagemDaAba);
  };
  const aoReceber = (evento: MessageEvent<MensagemDaAba>) => {
    const mensagem = evento.data;
    if (mensagem.tipo === 'em-uso') {
      if (!ultima || mensagem.momento >= ultima.momento) {
        ultima = { aba: mensagem.aba, momento: mensagem.momento };
      }
    } else if (mensagem.tipo === 'saiu' && ultima?.aba === mensagem.aba) {
      ultima = null;
    }
  };
  const aoSair = () => canal?.postMessage({ tipo: 'saiu', aba } satisfies MensagemDaAba);
  canal?.addEventListener('message', aoReceber as EventListener);
  janela.addEventListener('focus', anunciar);
  janela.document.addEventListener('visibilitychange', anunciar);
  janela.addEventListener('pagehide', aoSair);
  anunciar();
  return {
    ehDaVez: () => (ultima === null ? visivel() : ultima.aba === aba),
    parar: () => {
      aoSair();
      canal?.removeEventListener('message', aoReceber as EventListener);
      canal?.close();
      janela.removeEventListener('focus', anunciar);
      janela.document.removeEventListener('visibilitychange', anunciar);
      janela.removeEventListener('pagehide', aoSair);
    },
  };
}
