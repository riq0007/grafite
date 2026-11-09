// Os tipos do cliente VNC do noVNC 1.7.0 (change acesso-remoto-vnc, design, decisão 3), só com o
// que a tela do acesso remoto usa: o pacote não traz os tipos.
declare module '@novnc/novnc' {
  export interface CredenciaisDoVnc {
    username?: string;
    password?: string;
  }

  export default class RFB extends EventTarget {
    constructor(
      alvo: HTMLElement,
      canal: string | WebSocket,
      opcoes?: { shared?: boolean; credentials?: CredenciaisDoVnc },
    );
    scaleViewport: boolean;
    background: string;
    focusOnClick: boolean;
    disconnect(): void;
    sendCredentials(credenciais: CredenciaisDoVnc): void;
    sendCtrlAltDel(): void;
    focus(): void;
  }
}
