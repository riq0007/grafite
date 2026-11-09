// O entregador do push (spec notificacoes, "Push por severidade" e "Aparelhos do push"; change
// p3c-email-e-push, design, decisões 1, 7 e 8): manda o conteúdo cifrado a uma inscrição, com as
// chaves VAPID, e diz se ela não existe mais. Só um serviço de push dos navegadores, em https, é
// chamado: o endereço da inscrição passa pela conta, e o servidor nunca manda pedidos a um
// endereço que ela escolheu.
import type { Agent } from 'node:https';
import type { ConteudoDoPush } from '@grafite/domain';
import webpush from 'web-push';
import type { ConfiguracaoDoPush } from '../config.ts';

/** A inscrição de um aparelho: o endereço no serviço de push e as duas chaves, em base64url. */
export interface InscricaoDoPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** O push foi aceito pelo serviço, ou a inscrição não existe mais e sai da lista. */
export type ResultadoDoPush = 'entregue' | 'expirada';

export interface EntregadorDePush {
  /** A chave pública, que o navegador usa para inscrever o aparelho. */
  readonly chavePublica: string;
  /** Se o endereço é de um serviço de push que o entregador chama. */
  aceita(endpoint: string): boolean;
  enviar(inscricao: InscricaoDoPush, conteudo: ConteudoDoPush): Promise<ResultadoDoPush>;
}

/** Os servidores dos serviços de push dos navegadores; os com ponto valem para os de baixo. */
const SERVICOS_DE_PUSH = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  '.push.apple.com',
  '.notify.windows.com',
];

/** Por quanto tempo o serviço de push guarda o aviso de um aparelho desligado. */
const VALIDADE_NO_SERVICO = 24 * 60 * 60;

/** Se o endereço é de um serviço de push dos navegadores, em https, ou de uma das origens extras. */
export function servicoDePushConhecido(endpoint: string, extras: readonly string[] = []): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (extras.includes(url.origin)) return true;
  if (url.protocol !== 'https:') return false;
  return SERVICOS_DE_PUSH.some((servico) =>
    servico.startsWith('.') ? url.hostname.endsWith(servico) : url.hostname === servico,
  );
}

export function criarEntregadorDePush(
  { chavePublica, chavePrivada, contato }: ConfiguracaoDoPush,
  {
    extras = [],
    tempoLimite = 15_000,
    agente,
  }: {
    extras?: readonly string[];
    tempoLimite?: number;
    /** O agente HTTPS dos pedidos, como o que confia no serviço falso dos testes. */
    agente?: Agent;
  } = {},
): EntregadorDePush {
  const aceita = (endpoint: string) => servicoDePushConhecido(endpoint, extras);
  return {
    chavePublica,
    aceita,
    async enviar({ endpoint, p256dh, auth }, conteudo) {
      if (!aceita(endpoint)) {
        throw new Error('O endereço da inscrição não é de um serviço de push conhecido.');
      }
      try {
        await webpush.sendNotification(
          { endpoint, keys: { p256dh, auth } },
          JSON.stringify(conteudo),
          {
            vapidDetails: { subject: contato, publicKey: chavePublica, privateKey: chavePrivada },
            TTL: VALIDADE_NO_SERVICO,
            urgency: conteudo.severidade === 'critico' ? 'high' : 'normal',
            contentEncoding: 'aes128gcm',
            timeout: tempoLimite,
            ...(agente && { agent: agente }),
          },
        );
        return 'entregue';
      } catch (erro) {
        if (erro instanceof webpush.WebPushError && [404, 410].includes(erro.statusCode)) {
          return 'expirada';
        }
        throw erro;
      }
    },
  };
}
