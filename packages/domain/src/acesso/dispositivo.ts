// O dispositivo de uma sessão, como a lista de sessões o mostra (spec entrada-e-sessoes): o
// navegador e o sistema, tirados do User-Agent, como "Chrome no Windows".

/** Em ordem: o Edge e o Opera também dizem "Chrome", e o Chrome também diz "Safari". */
const NAVEGADORES: readonly [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, 'Edge'],
  [/\b(OPR|Opera)\//, 'Opera'],
  [/\b(CriOS|Chrome|Chromium)\//, 'Chrome'],
  [/\b(FxiOS|Firefox)\//, 'Firefox'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

/** Em ordem: o Android também diz "Linux", e o iPhone, "Mac OS X". */
const SISTEMAS: readonly [RegExp, string][] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'Mac'],
  [/\bLinux\b/, 'Linux'],
];

const primeiro = (lista: readonly [RegExp, string][], agente: string) =>
  lista.find(([padrao]) => padrao.test(agente))?.[1];

export function descreverDispositivo(agente: string | null | undefined): string {
  const navegador = agente ? primeiro(NAVEGADORES, agente) : undefined;
  const sistema = agente ? primeiro(SISTEMAS, agente) : undefined;
  if (navegador && sistema) return `${navegador} no ${sistema}`;
  if (sistema) return `Navegador no ${sistema}`;
  return navegador ?? 'Navegador desconhecido';
}
