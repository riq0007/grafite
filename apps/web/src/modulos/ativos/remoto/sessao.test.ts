// A sessão do acesso remoto (change acesso-remoto-vnc, design, decisão 3): o noVNC vem sob demanda,
// fora do pacote principal da web, e a conexão com a ponte só abre depois dele, para a primeira
// mensagem da máquina não se perder; desconectar antes disso não abre nada e avisa o fim.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { abrirSessaoRemota, type EventosDaSessao } from './sessao.ts';

const { criados, conexoes } = vi.hoisted(() => ({
  criados: [] as { canal: unknown; opcoes: unknown }[],
  conexoes: [] as string[],
}));

vi.mock('@novnc/novnc', () => ({
  default: class extends EventTarget {
    scaleViewport = false;
    background = '';
    constructor(_alvo: HTMLElement, canal: unknown, opcoes: unknown) {
      super();
      criados.push({ canal, opcoes });
    }
    disconnect() {
      this.dispatchEvent(new Event('disconnect'));
    }
    sendCredentials() {}
    sendCtrlAltDel() {}
  },
}));

class ConexaoSimulada extends EventTarget {
  binaryType = 'blob';
  constructor(endereco: string) {
    super();
    conexoes.push(endereco);
  }
}

afterEach(() => {
  criados.length = 0;
  conexoes.length = 0;
  vi.unstubAllGlobals();
});

const eventos = () =>
  ({
    aoConectar: vi.fn<() => void>(),
    aoPedirSenha: vi.fn<(comUsuario: boolean) => void>(),
    aoDesconectar: vi.fn<(motivo: string | null) => void>(),
  }) satisfies EventosDaSessao;

describe('a sessão remota', () => {
  it('abre a conexão com a ponte só depois de o noVNC carregar', async () => {
    vi.stubGlobal('WebSocket', ConexaoSimulada);
    abrirSessaoRemota(
      document.createElement('div'),
      'ws://grafite/api/ativos/a1/acesso-remoto',
      eventos(),
      {
        ajustar: true,
      },
    );
    expect(conexoes).toEqual([]);
    await vi.waitFor(() => expect(criados).toHaveLength(1));
    expect(conexoes).toEqual(['ws://grafite/api/ativos/a1/acesso-remoto']);
    expect(criados[0]?.opcoes).toEqual({ shared: true });
  });

  it('desconectar antes de o noVNC carregar não abre a conexão e avisa o fim', async () => {
    vi.stubGlobal('WebSocket', ConexaoSimulada);
    const daSessao = eventos();
    const sessao = abrirSessaoRemota(
      document.createElement('div'),
      'ws://grafite/api/ativos/a1/acesso-remoto',
      daSessao,
      { ajustar: false },
    );
    sessao.desconectar();
    expect(daSessao.aoDesconectar).toHaveBeenCalledWith(null);
    await import('@novnc/novnc');
    await new Promise((pronto) => setTimeout(pronto, 0));
    expect(conexoes).toEqual([]);
    expect(criados).toEqual([]);
  });
});
