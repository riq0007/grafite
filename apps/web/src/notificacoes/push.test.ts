// A inscrição do aparelho no push (spec notificacoes, "Aparelhos do push"; change p3c-email-e-push,
// design, decisão 8): o que o navegador oferece, o nome do aparelho, a permissão e a inscrição com
// a chave pública do servidor, gravada na API.
import { describe, expect, it, vi } from 'vitest';
import {
  type AmbienteDoPush,
  cancelarEsteAparelho,
  enderecoDesteAparelho,
  inscreverEsteAparelho,
  nomeDoAparelho,
  suporteAoPush,
} from './push.ts';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

// Uma chave pública de 65 bytes e as chaves de uma inscrição, como o navegador as dá.
const CHAVE_PUBLICA = `B${'A'.repeat(86)}`;
const P256DH = `B${'C'.repeat(86)}`;
const AUTH = 'D'.repeat(22);

function ambiente({
  userAgent = CHROME_ANDROID,
  permissao = 'default' as NotificationPermission,
  comPush = true,
  instalado = false,
  respostaDaPermissao = 'granted' as NotificationPermission,
  inscricao = null as { endpoint: string; unsubscribe: () => Promise<boolean> } | null,
} = {}) {
  const inscrever = vi.fn(async () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/aparelho',
    toJSON: () => ({
      endpoint: 'https://fcm.googleapis.com/fcm/send/aparelho',
      keys: { p256dh: `${P256DH}=`, auth: `${AUTH}==` },
    }),
  }));
  const registro = {
    pushManager: { subscribe: inscrever, getSubscription: vi.fn(async () => inscricao) },
  };
  const pedirPermissao = vi.fn(async () => respostaDaPermissao);
  const valor: AmbienteDoPush = {
    userAgent,
    temPush: comPush,
    instalado,
    permissao: () => permissao,
    pedirPermissao,
    registro: async () => registro,
  };
  return { valor, inscrever, pedirPermissao };
}

describe('nome do aparelho', () => {
  it('diz o navegador e o sistema', () => {
    expect(nomeDoAparelho(CHROME_ANDROID)).toBe('Chrome no Android');
    expect(nomeDoAparelho(EDGE_WINDOWS)).toBe('Edge no Windows');
    expect(nomeDoAparelho(FIREFOX_LINUX)).toBe('Firefox no Linux');
    expect(nomeDoAparelho(SAFARI_IPHONE)).toBe('Safari no iPhone');
    expect(nomeDoAparelho(SAFARI_MAC)).toBe('Safari no macOS');
    expect(nomeDoAparelho('Um navegador qualquer')).toBe('Navegador');
  });
});

describe('suporte ao push', () => {
  it('o navegador com push e sem bloqueio pode receber', () => {
    expect(suporteAoPush(ambiente().valor)).toBe('ok');
  });

  it('o navegador sem push não recebe, e o iPhone pede o Grafite instalado', () => {
    expect(suporteAoPush(ambiente({ comPush: false }).valor)).toBe('sem-push');
    expect(suporteAoPush(ambiente({ comPush: false, userAgent: SAFARI_IPHONE }).valor)).toBe(
      'iphone-fora-do-app',
    );
    expect(
      suporteAoPush(ambiente({ comPush: false, userAgent: SAFARI_IPHONE, instalado: true }).valor),
    ).toBe('sem-push');
  });

  it('os avisos bloqueados no navegador ficam bloqueados', () => {
    expect(suporteAoPush(ambiente({ permissao: 'denied' }).valor)).toBe('bloqueado');
  });
});

describe('inscrição deste aparelho', () => {
  it('pede a permissão, inscreve com a chave pública e grava o endereço, as chaves e o nome', async () => {
    const { valor, inscrever, pedirPermissao } = ambiente();
    const gravar = vi.fn(async () => {});
    expect(await inscreverEsteAparelho(valor, CHAVE_PUBLICA, gravar)).toBe('inscrito');
    expect(pedirPermissao).toHaveBeenCalled();
    const [opcoes] = inscrever.mock.calls[0] as unknown as [PushSubscriptionOptionsInit];
    expect(opcoes.userVisibleOnly).toBe(true);
    expect(Array.from(opcoes.applicationServerKey as Uint8Array)).toEqual([
      ...Buffer.from(CHAVE_PUBLICA, 'base64url'),
    ]);
    expect(gravar).toHaveBeenCalledWith({
      endpoint: 'https://fcm.googleapis.com/fcm/send/aparelho',
      chaves: { p256dh: P256DH, auth: AUTH },
      aparelho: 'Chrome no Android',
    });
  });

  it('com a permissão negada, nada é inscrito nem gravado', async () => {
    const { valor, inscrever } = ambiente({ respostaDaPermissao: 'denied' });
    const gravar = vi.fn(async () => {});
    expect(await inscreverEsteAparelho(valor, CHAVE_PUBLICA, gravar)).toBe('bloqueado');
    expect(inscrever).not.toHaveBeenCalled();
    expect(gravar).not.toHaveBeenCalled();
  });

  it('diz o endereço da inscrição deste aparelho e o cancela no navegador', async () => {
    const unsubscribe = vi.fn(async () => true);
    const { valor } = ambiente({
      inscricao: { endpoint: 'https://fcm.googleapis.com/fcm/send/aparelho', unsubscribe },
    });
    expect(await enderecoDesteAparelho(valor)).toBe('https://fcm.googleapis.com/fcm/send/aparelho');
    await cancelarEsteAparelho(valor);
    expect(unsubscribe).toHaveBeenCalled();
    expect(await enderecoDesteAparelho(ambiente().valor)).toBeNull();
  });
});
