// A inscrição do aparelho no push (spec notificacoes, "Aparelhos do push"; change p3c-email-e-push,
// design, decisão 8): o que o navegador oferece, o nome do aparelho, a permissão dos avisos e a
// inscrição no serviço de push do navegador, com a chave pública do servidor, gravada na API. O
// navegador fica atrás do `AmbienteDoPush`, que os testes trocam por um falso.

/** O que a inscrição usa do registro do service worker. */
export interface RegistroDoPush {
  pushManager: {
    subscribe(opcoes: PushSubscriptionOptionsInit): Promise<{
      endpoint: string;
      toJSON(): PushSubscriptionJSON;
    }>;
    getSubscription(): Promise<{ endpoint: string; unsubscribe(): Promise<boolean> } | null>;
  };
}

export interface AmbienteDoPush {
  userAgent: string;
  /** O navegador tem o service worker, o `PushManager` e as notificações do sistema. */
  temPush: boolean;
  /** O Grafite roda instalado, na tela de início, e não numa aba do navegador. */
  instalado: boolean;
  permissao: () => NotificationPermission;
  pedirPermissao: () => Promise<NotificationPermission>;
  /** O registro do service worker, ou `null` sem ele, como no servidor de desenvolvimento. */
  registro: () => Promise<RegistroDoPush | null>;
}

/** O que o aparelho oferece: o push, ou o motivo de não ter. */
export type SuporteAoPush = 'ok' | 'sem-push' | 'iphone-fora-do-app' | 'bloqueado';

/** A inscrição que a API grava. */
export interface InscricaoDoAparelho {
  endpoint: string;
  chaves: { p256dh: string; auth: string };
  aparelho: string;
}

export function ambienteDoNavegador(): AmbienteDoPush {
  const temPush =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window;
  return {
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    temPush,
    instalado:
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches ?? false),
    permissao: () => (typeof Notification === 'undefined' ? 'default' : Notification.permission),
    pedirPermissao: () => Notification.requestPermission(),
    registro: async () =>
      temPush ? ((await navigator.serviceWorker.getRegistration()) ?? null) : null,
  };
}

const NAVEGADORES: ReadonlyArray<[RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

// O Android e o iPhone antes do Linux e do macOS, que aparecem também no texto deles.
const SISTEMAS: ReadonlyArray<[RegExp, string]> = [
  [/Android/, 'Android'],
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

/** O nome do aparelho pelo navegador, como "Chrome no Android". */
export function nomeDoAparelho(userAgent: string): string {
  const navegador = NAVEGADORES.find(([padrao]) => padrao.test(userAgent))?.[1];
  const sistema = SISTEMAS.find(([padrao]) => padrao.test(userAgent))?.[1];
  if (navegador && sistema) return `${navegador} no ${sistema}`;
  if (navegador) return navegador;
  return sistema ? `Navegador no ${sistema}` : 'Navegador';
}

export function suporteAoPush(ambiente: AmbienteDoPush): SuporteAoPush {
  if (!ambiente.temPush) {
    // No iPhone e no iPad, o push só existe com o Grafite instalado na tela de início.
    return /iPhone|iPad/.test(ambiente.userAgent) && !ambiente.instalado
      ? 'iphone-fora-do-app'
      : 'sem-push';
  }
  return ambiente.permissao() === 'denied' ? 'bloqueado' : 'ok';
}

function deBase64url(texto: string): Uint8Array<ArrayBuffer> {
  const base64 =
    texto.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (texto.length % 4)) % 4);
  const binario = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let indice = 0; indice < binario.length; indice++)
    bytes[indice] = binario.charCodeAt(indice);
  return bytes;
}

const semPreenchimento = (texto: string) => texto.replace(/=+$/, '');

/**
 * Inscreve este aparelho: pede a permissão dos avisos, inscreve no serviço de push do navegador com
 * a chave pública do servidor e grava a inscrição. Sem a permissão, nada é inscrito.
 */
export async function inscreverEsteAparelho(
  ambiente: AmbienteDoPush,
  chavePublica: string,
  gravar: (inscricao: InscricaoDoAparelho) => Promise<unknown>,
): Promise<'inscrito' | 'bloqueado' | 'sem-push'> {
  if ((await ambiente.pedirPermissao()) !== 'granted') return 'bloqueado';
  const registro = await ambiente.registro();
  if (!registro) return 'sem-push';
  const inscricao = await registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: deBase64url(chavePublica),
  });
  const { endpoint, keys } = inscricao.toJSON();
  await gravar({
    endpoint: endpoint ?? inscricao.endpoint,
    chaves: {
      p256dh: semPreenchimento(keys?.p256dh ?? ''),
      auth: semPreenchimento(keys?.auth ?? ''),
    },
    aparelho: nomeDoAparelho(ambiente.userAgent),
  });
  return 'inscrito';
}

/** O endereço da inscrição deste aparelho, para marcar "Este aparelho" na lista. */
export async function enderecoDesteAparelho(ambiente: AmbienteDoPush): Promise<string | null> {
  const registro = await ambiente.registro();
  return (await registro?.pushManager.getSubscription())?.endpoint ?? null;
}

/** Cancela a inscrição deste aparelho no navegador, quando ele sai da lista. */
export async function cancelarEsteAparelho(ambiente: AmbienteDoPush): Promise<void> {
  const registro = await ambiente.registro();
  await (await registro?.pushManager.getSubscription())?.unsubscribe();
}
