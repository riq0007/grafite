// A sessão do acesso remoto (spec acesso-remoto; change acesso-remoto-vnc, design, decisão 3): o
// cliente VNC do noVNC na tela, pela conexão WebSocket com a ponte da API. A conexão é aberta aqui,
// e não pelo noVNC, para o motivo do fechamento, que a ponte manda, chegar à tela. O noVNC vem sob
// demanda, fora do pacote principal da web, que o service worker guarda até 2 MiB por arquivo.
import type RFB from '@novnc/novnc';

export interface EventosDaSessao {
  aoConectar: () => void;
  /** A máquina pede a senha do VNC; `comUsuario` quando ela pede o usuário também. */
  aoPedirSenha: (comUsuario: boolean) => void;
  /** O fim da conexão, com o motivo da ponte ou da máquina, quando há um. */
  aoDesconectar: (motivo: string | null) => void;
}

export interface SessaoRemota {
  enviarSenha: (credenciais: { usuario?: string; senha: string }) => void;
  ctrlAltDel: () => void;
  ajustar: (ligado: boolean) => void;
  desconectar: () => void;
}

/** O endereço da ponte, na mesma origem da tela, pelo /api. */
export function enderecoDaPonte(ativoId: string, local: Pick<Location, 'protocol' | 'host'>) {
  const protocolo = local.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocolo}//${local.host}/api/ativos/${encodeURIComponent(ativoId)}/acesso-remoto`;
}

/** A senha que a máquina recusou: o motivo do noVNC vem em inglês. */
const SENHA_RECUSADA = 'A máquina recusou a senha do VNC.';

/** O noVNC que não carregou, como a rede que caiu no meio. */
const SEM_CLIENTE = 'O cliente do acesso remoto não carregou. Recarregue a página e tente de novo.';

/**
 * Abre a sessão no elemento da tela: a tela da máquina ocupa o elemento. A conexão com a ponte só
 * abre com o noVNC carregado: a mensagem que a máquina manda antes de ele ouvir se perderia.
 */
export function abrirSessaoRemota(
  tela: HTMLElement,
  endereco: string,
  eventos: EventosDaSessao,
  { ajustar }: { ajustar: boolean },
): SessaoRemota {
  let rfb: RFB | null = null;
  let encerrada = false;
  let ajuste = ajustar;
  let motivo: string | null = null;
  import('@novnc/novnc').then(
    ({ default: ClienteVnc }) => {
      if (encerrada) return;
      const canal = new WebSocket(endereco);
      canal.binaryType = 'arraybuffer';
      // Antes do noVNC: o motivo já está guardado quando ele avisa o fim.
      canal.addEventListener('close', (evento) => {
        motivo ??= evento.reason || null;
      });
      const cliente = new ClienteVnc(tela, canal, { shared: true });
      cliente.scaleViewport = ajuste;
      cliente.background = 'var(--cor-fundo)';
      cliente.addEventListener('connect', () => eventos.aoConectar());
      cliente.addEventListener('credentialsrequired', (evento) => {
        const tipos = (evento as CustomEvent<{ types?: string[] }>).detail?.types ?? [];
        eventos.aoPedirSenha(tipos.includes('username'));
      });
      cliente.addEventListener('securityfailure', () => {
        motivo = SENHA_RECUSADA;
      });
      cliente.addEventListener('disconnect', () => eventos.aoDesconectar(motivo));
      rfb = cliente;
    },
    () => {
      if (encerrada) return;
      encerrada = true;
      eventos.aoDesconectar(SEM_CLIENTE);
    },
  );
  return {
    enviarSenha: ({ usuario, senha }) =>
      rfb?.sendCredentials({ ...(usuario ? { username: usuario } : {}), password: senha }),
    ctrlAltDel: () => rfb?.sendCtrlAltDel(),
    ajustar: (ligado) => {
      ajuste = ligado;
      if (rfb) rfb.scaleViewport = ligado;
    },
    desconectar: () => {
      if (encerrada) return;
      encerrada = true;
      // Sem o noVNC ainda, não há conexão: o fim é avisado aqui.
      if (rfb) rfb.disconnect();
      else eventos.aoDesconectar(null);
    },
  };
}
