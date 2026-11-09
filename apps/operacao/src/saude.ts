// A saúde dos apps (spec plataforma-base, "Saúde dos serviços"; spec operacao-servicos): depois de
// iniciar um app, o comando de operação espera a saúde dele responder `ok` e confere a versão e o
// ambiente. Pela porta local, prova que o app subiu; pelo proxy, que o endereço atende com HTTPS. O
// pedido ao proxy vai ao próprio servidor (127.0.0.1:443) com o nome do endereço, então não depende
// do DNS, e o certificado é conferido com as ACs do Node, as do Windows e a raiz dada (a AC do
// próprio Caddy, no modo interno). No Linux (change servidor-linux-com-docker, design, decisão 9), o
// comando roda na rede interna do Docker: o app é o serviço da porta, e o proxy, o serviço dele.
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { SERVICOS_NO_LINUX, servicoDaPortaNoLinux } from './layout.ts';

export interface RespostaDaSaude {
  status: string;
  versao: string;
  /** O ambiente, que a API informa; o coletor não informa. */
  ambiente?: string;
}

export interface Saude {
  /** A saúde do app ou do coletor na porta local, quando ela responde `ok`. */
  local(porta: number): Promise<RespostaDaSaude>;
  /** A saúde pelo proxy, por HTTPS no endereço, quando ela responde `ok`. */
  peloProxy(endereco: string, opcoes?: { raiz?: string }): Promise<RespostaDaSaude>;
}

/** Recusa a resposta com outra versão ou outro ambiente que os esperados. */
export function conferirSaude(
  resposta: RespostaDaSaude,
  esperado: { versao?: string; ambiente?: string },
  onde: string,
): void {
  if (esperado.versao !== undefined && resposta.versao !== esperado.versao) {
    throw new Error(
      `${onde} respondeu a versão ${resposta.versao}, e a esperada é a ${esperado.versao}.`,
    );
  }
  if (esperado.ambiente !== undefined && resposta.ambiente !== esperado.ambiente) {
    throw new Error(
      `${onde} respondeu o ambiente ${resposta.ambiente}, e o esperado é ${esperado.ambiente}.`,
    );
  }
}

const TEMPO_DO_PEDIDO = 10_000;

function lerResposta(pedido: http.ClientRequest): Promise<RespostaDaSaude> {
  return new Promise((resolver, recusar) => {
    pedido.once('response', (resposta) => {
      const partes: Buffer[] = [];
      resposta.on('data', (parte: Buffer) => partes.push(parte));
      resposta.once('error', recusar);
      resposta.once('end', () => {
        try {
          const corpo = JSON.parse(Buffer.concat(partes).toString('utf8')) as RespostaDaSaude;
          if (typeof corpo?.status !== 'string') throw new Error();
          resolver(corpo);
        } catch {
          recusar(new Error(`respondeu ${resposta.statusCode} sem a saúde do Grafite`));
        }
      });
    });
    pedido.once('timeout', () => pedido.destroy(new Error('não respondeu a tempo')));
    pedido.once('error', recusar);
    pedido.end();
  });
}

export function saudePelaRede({
  prazoLocal = 120_000,
  prazoDoProxy = 300_000,
  intervalo = 2_000,
  portaDoProxy = 443,
  hostDaPorta = () => '127.0.0.1',
  hostDoProxy = '127.0.0.1',
}: {
  /** Quanto esperar o app subir, em ms. */
  prazoLocal?: number;
  /** Quanto esperar o endereço, em ms; o Let's Encrypt pode levar alguns minutos no início. */
  prazoDoProxy?: number;
  intervalo?: number;
  portaDoProxy?: number;
  /** Onde atende o app ou o coletor de uma porta; no Windows, o próprio servidor. */
  hostDaPorta?: (porta: number) => string;
  /** Onde atende o proxy; no Windows, o próprio servidor. */
  hostDoProxy?: string;
} = {}): Saude {
  async function aguardar(
    onde: string,
    prazo: number,
    pedir: () => Promise<RespostaDaSaude>,
  ): Promise<RespostaDaSaude> {
    const limite = Date.now() + prazo;
    for (;;) {
      let motivo: string;
      try {
        const resposta = await pedir();
        if (resposta.status === 'ok') return resposta;
        motivo = `respondeu ${resposta.status}`;
      } catch (erro) {
        motivo = erro instanceof Error ? erro.message : String(erro);
      }
      if (Date.now() >= limite) {
        throw new Error(
          `${onde} não respondeu com saúde em ${Math.round(prazo / 1000)} s: ${motivo.replace(/\.$/, '')}.`,
        );
      }
      await new Promise((pronto) => setTimeout(pronto, intervalo));
    }
  }

  return {
    local: (porta) => {
      const host = hostDaPorta(porta);
      return aguardar(`O app em ${host}:${porta}`, prazoLocal, async () =>
        lerResposta(
          http.request({
            host,
            port: porta,
            path: '/health',
            timeout: TEMPO_DO_PEDIDO,
          }),
        ),
      );
    },

    peloProxy: (endereco, { raiz } = {}) =>
      aguardar(`O endereço https://${endereco}`, prazoDoProxy, async () => {
        const acs = [...tls.getCACertificates('bundled'), ...tls.getCACertificates('system')];
        if (raiz !== undefined) {
          acs.push(
            await readFile(raiz, 'utf8').catch(() => {
              throw new Error(`a raiz ${raiz} ainda não existe`);
            }),
          );
        }
        return lerResposta(
          https.request({
            host: hostDoProxy,
            port: portaDoProxy,
            servername: endereco,
            headers: { host: endereco },
            path: '/health',
            ca: acs,
            timeout: TEMPO_DO_PEDIDO,
          }),
        );
      }),
  };
}

/** A saúde de dentro da rede interna do servidor Linux, onde o comando de operação roda. */
export function saudeNoLinux(
  opcoes: Omit<Parameters<typeof saudePelaRede>[0] & object, 'hostDaPorta' | 'hostDoProxy'> = {},
): Saude {
  return saudePelaRede({
    ...opcoes,
    hostDaPorta: servicoDaPortaNoLinux,
    hostDoProxy: SERVICOS_NO_LINUX.proxy,
  });
}
