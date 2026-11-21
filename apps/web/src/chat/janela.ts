// A janela do app do chat: se ela está à vista, para a leitura das conversas (change
// chat-com-chamados, design, "A leitura"), e o minuto de agora, para os dias da conversa ("Hoje" e
// "Ontem") virarem na meia-noite sem recarregar. O chat não importa o relógio da casca, que fica
// fora do pacote dele (decisão 12).
import { useEffect, useState, useSyncExternalStore } from 'react';

/** O destino de fora do chat, como o de um alerta, abre o Grafite numa janela nova. */
export const abrirForaDoChat = (destino: string) => {
  window.open(destino, '_blank', 'noopener');
};

/** A aba visível e a janela com o foco. */
const aVistaAgora = () => document.visibilityState === 'visible' && document.hasFocus();

function assinar(avisar: () => void) {
  document.addEventListener('visibilitychange', avisar);
  window.addEventListener('focus', avisar);
  window.addEventListener('blur', avisar);
  return () => {
    document.removeEventListener('visibilitychange', avisar);
    window.removeEventListener('focus', avisar);
    window.removeEventListener('blur', avisar);
  };
}

/** A janela está à vista: a aba visível e a janela com o foco. */
export function useJanelaAVista(): boolean {
  return useSyncExternalStore(assinar, aVistaAgora, () => false);
}

const UM_MINUTO = 60_000;

/**
 * O momento de agora, que anda na virada do minuto. Cada virada agenda a seguinte pela hora do
 * sistema, e a virada atrasada, com o computador dormindo, não desalinha as próximas.
 */
export function useAgoraNoChat(): Date {
  const [agora, definirAgora] = useState(() => new Date());
  useEffect(() => {
    let proxima: ReturnType<typeof setTimeout>;
    const agendar = () => {
      proxima = setTimeout(
        () => {
          definirAgora(new Date());
          agendar();
        },
        UM_MINUTO - (Date.now() % UM_MINUTO),
      );
    };
    agendar();
    return () => clearTimeout(proxima);
  }, []);
  return agora;
}
